import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventApi, type LiveOrder } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { MonitorCheck, Radio, AlertTriangle } from "lucide-react";

// 全サークル横断の注文モニタ (2026-07-12)
// 進行中(pending/preparing)の注文を古い順に表示し、経過時間が長いものを遅延として警告する。
// LIVE ON で 10 秒ごとに自動更新。event_manager(order:read) 権限。

// 遅延しきい値(分)。estimatedTime があればそれを超過、無ければ既定で判定。
const WARN_MIN = 15;
const DANGER_MIN = 25;

function ageMin(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

export function OrderMonitorTab({ eventId }: { eventId: string }) {
  const [live, setLive] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<LiveOrder | null>(null);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["event-live-orders", eventId],
    queryFn: () => eventApi.liveOrders(eventId),
    enabled: !!eventId,
    refetchInterval: live ? 10_000 : false,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const orders = data ?? [];
  const delayed = orders.filter((o) => ageMin(o.createdAt) >= WARN_MIN).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b-thick border-border pb-3">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
            <MonitorCheck className="h-4 w-4" /> 注文モニタ
          </h2>
          <p className="text-[11px] text-muted-foreground font-mono mt-1">
            進行中 {orders.length} 件
            {delayed > 0 && <span className="text-error font-bold"> / 遅延 {delayed} 件</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className={`flex items-center gap-1 font-mono text-[11px] uppercase border-thick px-2 py-1 ${
            live ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-muted"
          }`}
        >
          <Radio className={`h-3.5 w-3.5 ${live ? "animate-pulse" : ""}`} /> LIVE
        </button>
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={MonitorCheck} message="進行中の注文はありません" />
      ) : (
        <div className="space-y-1.5">
          {orders.map((o: LiveOrder) => {
            const age = ageMin(o.createdAt);
            const level = age >= DANGER_MIN ? "danger" : age >= WARN_MIN ? "warn" : "ok";
            const firstItem = o.items[0]?.name;
            const summaryName = firstItem
              ? `${firstItem}${o.items.length > 1 ? ` ほか${o.items.length - 1}品` : ""}`
              : `注文 #${o.orderNumber}`;
            return (
              <button
                type="button"
                key={o.id}
                aria-label={`${o.circleName}、${summaryName}、注文 #${o.orderNumber} の詳細を表示`}
                onClick={() => setSelectedOrder(o)}
                className={`flex w-full flex-col items-stretch justify-between gap-2 p-3 text-left border-thick font-mono text-[12px] transition-colors hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:gap-3 ${
                  level === "danger"
                    ? "border-error bg-error/10"
                    : level === "warn"
                      ? "border-warning bg-warning/10"
                      : "border-border bg-background"
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-bold">{o.circleName}<span className="px-1 text-muted-foreground">｜</span>{summaryName}</p>
                  <p className="break-words text-[10px] text-muted-foreground">
                    注文 #{o.orderNumber} · {o.status === "pending" ? "未着手" : "調理中"} · {o.peopleCount}名
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 tabular-nums sm:justify-end">
                  <span className="text-[10px] text-muted-foreground">詳細を見る</span>
                  <span className="flex items-center gap-1">
                  {level !== "ok" && <AlertTriangle className="h-3.5 w-3.5 text-error" />}
                  <span className={level !== "ok" ? "font-bold text-error" : "text-muted-foreground"}>
                    {age}分経過
                  </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <p className="font-mono text-[10px] text-muted-foreground">
        {WARN_MIN}分以上を注意(黄)、{DANGER_MIN}分以上を遅延(赤)として表示します。
      </p>

      <Modal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder ? `${selectedOrder.circleName}｜注文 #${selectedOrder.orderNumber}` : "注文詳細"}
        maxWidth="md"
      >
        {selectedOrder && <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 border-b-thin border-border pb-4 text-xs">
            <div><dt className="text-muted-foreground">注文状態</dt><dd className="font-bold">{selectedOrder.status === "pending" ? "未着手" : "調理中"}</dd></div>
            <div><dt className="text-muted-foreground">来場者数</dt><dd>{selectedOrder.peopleCount}名</dd></div>
            <div><dt className="text-muted-foreground">注文時刻</dt><dd>{new Date(selectedOrder.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</dd></div>
            <div><dt className="text-muted-foreground">経過時間</dt><dd>{ageMin(selectedOrder.createdAt)}分</dd></div>
            {selectedOrder.estimatedTime !== null && <div><dt className="text-muted-foreground">提供見込み</dt><dd>{selectedOrder.estimatedTime}分</dd></div>}
          </dl>
          <section className="space-y-2" aria-label="注文商品">
            <h3 className="text-xs font-bold">注文内容</h3>
            {selectedOrder.items.length > 0 ? selectedOrder.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="space-y-1 border-b-thin border-border py-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 break-words">{item.name} × {item.quantity}</span>
                  <span className="shrink-0 tabular-nums">単価 {item.unitPrice.toLocaleString("ja-JP")}円</span>
                </div>
                {item.toppings.length > 0 && <ul className="space-y-1 pl-3 text-[10px] text-muted-foreground">
                  {item.toppings.map((topping, toppingIndex) => (
                    <li key={`${topping.name}-${toppingIndex}`} className="flex justify-between gap-2">
                      <span className="break-words">+ {topping.name}</span>
                      <span className="shrink-0 tabular-nums">{topping.unitPrice.toLocaleString("ja-JP")}円</span>
                    </li>
                  ))}
                </ul>}
              </div>
            )) : <p className="text-xs text-muted-foreground">商品情報はありません。</p>}
          </section>
          <p className="flex justify-between border-t-thick border-border pt-3 text-sm font-bold">
            <span>合計</span><span className="tabular-nums">{selectedOrder.totalPrice.toLocaleString("ja-JP")}円</span>
          </p>
        </div>}
      </Modal>
    </div>
  );
}
