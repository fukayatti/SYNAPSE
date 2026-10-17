
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAuthGuard, useAuth } from "@/hooks/useCircleAuth";
import { orderApi, toppingApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";
import { SwipeableOrderStack, type KitchenOrderView } from "@/components/pos/SwipeableOrderStack";

function BackyardPageContent() {
  // 2026-07-16: circleId を useState+useEffect(mount時一度きり) で固定していると、
  // 同一パス上でスペース切り替え後も古いサークルの注文一覧のまま表示され続ける。
  // useAuth() (authChange 購読で常に最新値) に統一する。
  const { circleId: authCircleId } = useAuth();
  const circleId = authCircleId ?? "";
  // 2026-10-17: 着手対象と直前の完了注文を同じ一覧に置き、厨房から過去注文をすぐ参照できるよう全件表示にする。
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>();
  const [view, setView] = useState<KitchenOrderView>("horizontal");
  // 注文キャンセルの確認ダイアログ用
  const [pendingCancel, setPendingCancel] = useState<{ id: string; orderNumber: string } | null>(
    null
  );
  const [cancelAnimationOrderId, setCancelAnimationOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: orders,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["orders", circleId, selectedStatus],
    queryFn: () => orderApi.list(circleId, selectedStatus),
    enabled: !!circleId,
    refetchInterval: 5000, // 5秒ごとに自動更新
  });

  const { data: toppings } = useQuery({
    queryKey: ["toppings", circleId],
    queryFn: () => toppingApi.list(circleId),
    enabled: !!circleId,
    staleTime: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: async (input: {
      id: string;
      status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
    }) => {
      return await orderApi.updateStatus(input.id, input.status);
    },
    onSuccess: () => {
      toast.success("注文ステータスを更新しました");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "更新に失敗しました");
    },
  });

  const completeOrder = useMutation({
    mutationFn: async (input: { id: string }) => {
      return await orderApi.complete(input.id);
    },
    onSuccess: () => {
      toast.success("注文を完了しました!");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "完了処理に失敗しました");
    },
  });

  const handleStartPreparing = (orderId: string) => {
    return updateStatus.mutateAsync({ id: orderId, status: "preparing" });
  };

  const handleComplete = (orderId: string) => {
    return completeOrder.mutateAsync({ id: orderId });
  };

  const handleCancel = () => {
    if (!pendingCancel) return;
    const orderId = pendingCancel.id;
    setCancelAnimationOrderId(orderId);
    setPendingCancel(null);
    window.setTimeout(() => updateStatus.mutate(
      { id: orderId, status: "cancelled" },
      { onSettled: () => setCancelAnimationOrderId(null) }
    ), 300);
  };

  const toppingDetails = new Map((toppings ?? []).map((topping) => [topping.id, topping]));
  const kitchenOrders = (orders ?? []).map((order) => ({
    ...order,
    items: order.items.map((item) => ({
      ...item,
      toppings: item.toppings?.map((topping) => ({
        ...topping,
        category: toppingDetails.get(topping.id)?.category || "未分類",
        sortOrder: toppingDetails.get(topping.id)?.sortOrder ?? 0,
      })),
    })),
  }));

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto p-4">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 p-3 sm:space-y-6 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b-thick border-border pb-3">
        <h1 className="text-2xl sm:text-3xl font-headline uppercase tracking-tight">厨房管理</h1>
        <Button onClick={() => refetch()} variant="outline" className="w-full sm:w-auto border-thick border-border rounded-none font-mono uppercase">
          更新
        </Button>
      </div>

      {/* ステータスフィルター */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={selectedStatus === "pending" ? "default" : "outline"}
          onClick={() => setSelectedStatus("pending")}
          className="border-thick border-border rounded-none font-mono uppercase text-xs sm:text-sm"
        >
          未着手
        </Button>
        <Button
          variant={selectedStatus === "preparing" ? "default" : "outline"}
          onClick={() => setSelectedStatus("preparing")}
          className="border-thick border-border rounded-none font-mono uppercase text-xs sm:text-sm"
        >
          調理中
        </Button>
        <Button
          variant={selectedStatus === "completed" ? "default" : "outline"}
          onClick={() => setSelectedStatus("completed")}
          className="border-thick border-border rounded-none font-mono uppercase text-xs sm:text-sm"
        >
          完成
        </Button>
        <Button
          variant={selectedStatus === "cancelled" ? "default" : "outline"}
          onClick={() => setSelectedStatus("cancelled")}
          className="border-thick border-border rounded-none font-mono uppercase text-xs sm:text-sm"
        >
          キャンセル
        </Button>
        <Button
          variant={selectedStatus === undefined ? "default" : "outline"}
          onClick={() => setSelectedStatus(undefined)}
          className="border-thick border-border rounded-none font-mono uppercase text-xs sm:text-sm"
        >
          すべて
        </Button>
      </div>

      {/* 注文一覧 */}
      <SwipeableOrderStack
        orders={kitchenOrders}
        view={view}
        onViewChange={setView}
        onStart={handleStartPreparing}
        onComplete={handleComplete}
        onCancelRequest={(id, orderNumber) => setPendingCancel({ id, orderNumber })}
        cancelAnimationOrderId={cancelAnimationOrderId}
        isUpdating={updateStatus.isPending || completeOrder.isPending}
      />

      <ConfirmDialog
        isOpen={!!pendingCancel}
        title="[注文のキャンセル]"
        description={`注文 #${pendingCancel?.orderNumber ?? ""} をキャンセルしますか？この操作は元に戻せません。`}
        confirmLabel="注文を取り消す"
        cancelLabel="戻る"
        onConfirm={handleCancel}
        onCancel={() => setPendingCancel(null)}
      />
    </div>
  );
}

export default function BackyardPage() {
  return (
    <CircleAuthGuard>
      <BackyardPageContent />
    </CircleAuthGuard>
  );
}
