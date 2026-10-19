import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { circleApi, type Event } from "@/lib/api";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Building2, Plus, Edit, Trash2, Users, Settings2, Link2 } from "lucide-react";
import { toast } from "sonner";

// モーダル
import { CircleFormModal } from "./CircleFormModal";
import { CircleCreateWizard } from "@/components/circle/CircleCreateWizard";
import { CircleCreateLinkModal } from "./CircleCreateLinkModal";
import { CircleManageModal } from "./CircleManageModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getAuthInfo, saveAuthInfo, useAuth } from "@/hooks/useCircleAuth";
import { groupCirclesByStoreArea } from "@/lib/store-areas";

interface CirclesTabProps {
  eventId: string;
  eventData?: Event;
  circles: any[] | undefined;
  circlesLoading: boolean;
  /** サークル一覧取得の isError (省略時はエラー分岐を表示しない) */
  circlesError?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

export function CirclesTab({
  eventId,
  eventData,
  circles,
  circlesLoading,
  circlesError,
  error,
  onRetry,
}: CirclesTabProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { role: effectiveRole, eventId: effectiveEventId } = useAuth();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCreateWizardOpen, setIsCreateWizardOpen] = useState(false);
  const [selectedCircle, setSelectedCircle] = useState<any | null>(null);
  const [isCreateLinkOpen, setIsCreateLinkOpen] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [circleToDelete, setCircleToDelete] = useState<any | null>(null);

  // サークル運営管理 (拡張機能ON/OFF + メンバーのロール)
  const [manageCircle, setManageCircle] = useState<any | null>(null);

  // サークル削除 API
  const deleteCircleMutation = useMutation({
    mutationFn: (id: string) => circleApi.delete(id),
    onSuccess: () => {
      toast.success("サークルを削除しました");
      queryClient.invalidateQueries({ queryKey: ["circles", eventId] });
      setIsDeleteOpen(false);
      setCircleToDelete(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "削除に失敗しました");
    },
  });

  const handleOpenAdd = () => {
    if (!eventData) {
      toast.error("イベント情報の読み込み後にもう一度お試しください");
      return;
    }
    setSelectedCircle(null);
    setIsCreateWizardOpen(true);
  };

  const handleOpenEdit = (circle: any) => {
    setSelectedCircle(circle);
    setIsFormOpen(true);
  };

  const handleOpenDelete = (circle: any) => {
    setCircleToDelete(circle);
    setIsDeleteOpen(true);
  };

  // サークル管理画面へ切り替え
  const handleSwitchToCircle = (circle: any) => {
    const authInfo = getAuthInfo();
    if (!authInfo || effectiveRole !== "event_manager" || effectiveEventId !== eventId) return;
    // 2026-09-27: タブ別の選択を保ち、権限の正本は実際のイベント所属または監査付きの実効権限に維持する。
    saveAuthInfo({ ...authInfo, circleId: circle.id, circleName: circle.name, eventId });
    void queryClient.invalidateQueries({ queryKey: ["circle", circle.id] });
    toast.success(`「${circle.name}」のダッシュボードに切り替えました`);
    navigate("/circle/dashboard");
  };

  const uniqueCircles = circles
    ? Array.from(new Map(circles.map(c => [c.id, c])).values())
    : undefined;
  const circleGroups = groupCirclesByStoreArea(uniqueCircles ?? [], eventData?.storeAreas);

  if (isCreateWizardOpen && eventData) {
    return (
      <div className="space-y-5 p-2 sm:p-5">
        <CircleCreateWizard
          event={eventData}
          onCancel={() => setIsCreateWizardOpen(false)}
          onCreated={(id, name) => {
            queryClient.invalidateQueries({ queryKey: ["circles", eventId] });
            const authInfo = getAuthInfo();
            if (authInfo && effectiveRole === "event_manager" && effectiveEventId === eventId) {
              saveAuthInfo({ ...authInfo, circleId: id, circleName: name, eventId });
              window.sessionStorage.setItem("circleName", name);
            }
            navigate("/circle/dashboard/menu", { replace: true });
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-foreground">
      <div className="flex flex-col items-start gap-3 border-b-thick border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          サークル一覧 ({uniqueCircles?.length || 0})
        </h2>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <Button
            onClick={() => setIsCreateLinkOpen(true)}
            variant="outline"
            className="h-auto min-h-10 w-full whitespace-normal rounded-none border-thick px-3 text-[11px] font-bold uppercase leading-tight shadow-none transition-all sm:w-auto"
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            サークル作成リンクを作成
          </Button>
          <Button
            onClick={handleOpenAdd}
            className="h-auto min-h-10 w-full whitespace-normal rounded-none border-thick border-primary bg-primary px-3 text-[11px] font-bold uppercase leading-tight text-primary-foreground shadow-none transition-all hover:bg-background hover:text-foreground sm:w-auto"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新規追加
          </Button>
        </div>
      </div>

      {circlesLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : circlesError ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : uniqueCircles && uniqueCircles.length > 0 ? (
        <div className="space-y-5">
          {circleGroups.map((group) => (
            <section key={group.area?.id ?? "unassigned"} className="space-y-2">
              <h3 className="flex items-center justify-between border-b-thin border-border pb-2 text-xs font-bold">
                <span>{group.area?.name ?? "エリア未設定"}</span>
                <span className="text-[10px] text-muted-foreground">{group.circles.length}サークル</span>
              </h3>
              {group.circles.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
                  {/* 2026-10-16: カードを画面いっぱいの1列にせず、スマートフォンでも2列で並べる。 */}
                  {group.circles.map((cir) => (
            <Card
              key={cir.id}
              className="flex min-w-0 flex-col justify-between rounded-none border-thick border-border bg-background p-2 shadow-none transition-all hover:border-neutral-800 sm:p-3"
            >
              <div>
                <div className="flex justify-between items-start border-b-thin border-border pb-2 mb-2">
                  <CardTitle className="flex min-w-0 flex-1 items-center gap-1.5 break-words text-[11px] font-bold uppercase tracking-wide sm:text-xs">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {cir.name}
                  </CardTitle>
                  <div className="flex gap-1 shrink-0">
                    <button
                      aria-label={`${cir.name}を編集`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-thick border-transparent text-muted-foreground transition-all hover:border-border hover:bg-muted hover:text-primary focus-visible:border-border sm:h-10 sm:w-10"
                      onClick={() => handleOpenEdit(cir)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label={`${cir.name}を削除`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-thick border-transparent text-destructive transition-all hover:border-border hover:bg-muted hover:text-neutral-800 focus-visible:border-border sm:h-10 sm:w-10"
                      onClick={() => handleOpenDelete(cir)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {cir.description && (
                  <p className="mb-3 break-words text-[10px] text-muted-foreground">{cir.description}</p>
                )}
                {/* 2026-10-19: 管理者名・メールはイベント管理権限のある一覧 API だけが返す。 */}
                <div className="mb-4 space-y-1 font-mono text-[10px] text-muted-foreground">
                  <p>管理者: {cir.managerName || "未設定"}</p>
                  {cir.managerEmail && <p className="break-all">メール: {cir.managerEmail}</p>}
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-full border-thick border-border rounded-none text-[10px] font-bold uppercase tracking-wider shadow-none hover:bg-neutral-100"
                  onClick={() => setManageCircle(cir)}
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1" /> 運営
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-full border-thick border-border rounded-none text-[10px] font-bold uppercase tracking-wider shadow-none hover:bg-neutral-100"
                  onClick={() => handleSwitchToCircle(cir)}
                >
                  管理へ切替
                </Button>
              </div>
            </Card>
                  ))}
                </div>
              ) : (
                <p className="border-thin border-border p-3 text-[10px] text-muted-foreground">このエリアのサークルはまだありません。</p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          message="サークルが登録されていません"
          actionLabel="新規追加"
          onAction={handleOpenAdd}
        />
      )}

      {/* サークル追加・編集モーダル */}
      <CircleFormModal
        eventId={eventId}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        circle={selectedCircle}
      />

      <CircleCreateLinkModal
        eventId={eventId}
        isOpen={isCreateLinkOpen}
        onClose={() => setIsCreateLinkOpen(false)}
      />

      {/* サークル運営管理モーダル (拡張機能ON/OFF + ロール調整) */}
      <CircleManageModal
        circle={manageCircle}
        event={eventData}
        isOpen={!!manageCircle}
        onClose={() => setManageCircle(null)}
      />

      {/* 削除確認ダイアログ (破壊的操作のため ConfirmDialog を使用) */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="サークルを削除しますか？"
        description={`サークル「${circleToDelete?.name}」を一覧から削除します。関連するメニューや運営画面も利用できなくなります。`}
        confirmLabel="削除する"
        isPending={deleteCircleMutation.isPending}
        onConfirm={() => circleToDelete && deleteCircleMutation.mutate(circleToDelete.id)}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
