import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useCircleAuth";
import { circleApi, orderApi, type ProjectorOrder } from "@/lib/api";

function NumberColumn({
  title,
  orders,
  tone,
}: {
  title: string;
  orders: ProjectorOrder[];
  tone: "preparing" | "ready";
}) {
  return (
    <section className="flex min-h-0 flex-col border-thick border-foreground bg-background text-foreground">
      <header className={`flex items-baseline justify-between gap-3 border-b-thick border-foreground px-4 py-3 sm:px-6 sm:py-4 ${tone === "ready" ? "bg-success text-white" : "bg-primary text-primary-foreground"}`}>
        <h2 className="font-headline text-2xl uppercase tracking-wide sm:text-4xl">{title}</h2>
        <span className="shrink-0 font-mono text-xl font-black tabular-nums sm:text-3xl">{orders.length}</span>
      </header>
      <div className="grid min-h-0 flex-1 content-start grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-2 overflow-y-auto p-3 sm:gap-3 sm:p-5">
        {orders.length === 0 ? (
          <p className="col-span-full py-8 text-center font-mono text-lg font-bold text-muted-foreground sm:text-2xl">
            {tone === "ready" ? "完成した注文はありません" : "作成中の注文はありません"}
          </p>
        ) : orders.map((order) => (
          <div key={order.orderNumber} className={`flex min-h-20 flex-col items-center justify-center border-thick border-foreground px-2 py-3 text-center ${tone === "ready" ? "bg-success text-white" : "bg-background"}`}>
            <span className="break-all font-mono text-2xl font-black leading-tight tabular-nums sm:text-4xl xl:text-5xl">{order.orderNumber}</span>
            {tone === "preparing" && (
              <span className="mt-2 font-mono text-xs font-bold uppercase sm:text-sm">
                {order.status === "pending" ? "受付" : "作成中"}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function OrderNumberDisplay() {
  const { circleId: authCircleId } = useAuth();
  const circleId = authCircleId ?? "";
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [clock, setClock] = useState(() => new Date());
  const circleQuery = useQuery({
    queryKey: ["circle", circleId],
    queryFn: () => circleApi.get(circleId),
    enabled: !!circleId,
  });
  const ordersQuery = useQuery({
    queryKey: ["projector-orders", circleId],
    queryFn: () => orderApi.projector(circleId),
    enabled: !!circleId,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const previousTitle = document.title;
    document.title = "注文番号表示 | FesFlow";
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      document.title = previousTitle;
    };
  }, []);

  const orders = ordersQuery.data ?? [];
  // 2026-10-21: ready は受取待ちとして掲示し、実際に受け取って completed になった注文は外す。
  const preparingOrders = orders.filter((order) => order.status === "pending" || order.status === "preparing");
  const readyOrders = orders.filter((order) => order.status === "ready");
  const lastUpdated = ordersQuery.dataUpdatedAt
    ? new Date(ordersQuery.dataUpdatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    : "接続中";

  return (
    <main className="flex min-h-svh w-full flex-col bg-background text-foreground">
      <header className="flex flex-col gap-2 border-b-heavy border-foreground bg-primary px-4 py-3 text-primary-foreground sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:py-5">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] sm:text-sm">{circleQuery.data?.name ?? "FesFlow"}</p>
          <h1 className="break-words font-headline text-2xl uppercase tracking-wide sm:text-4xl xl:text-5xl">注文番号のご案内</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-sm font-bold sm:text-base">
        <span aria-live="polite" className={`px-2 py-1 ${isOnline && !ordersQuery.isError ? "bg-success text-white" : "bg-error text-white"}`}>
            {isOnline && !ordersQuery.isError ? "● 配信中" : "● 接続を確認中"}
          </span>
          <time dateTime={clock.toISOString()}>{clock.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
      </header>

      {ordersQuery.isError && (
        <p role="status" className="bg-error px-4 py-2 text-center font-mono text-sm font-bold text-white sm:text-base">
          番号を更新できません。最終取得 {lastUpdated} の表示です。
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-5 md:grid-cols-2">
        <NumberColumn title="作成中" orders={preparingOrders} tone="preparing" />
        <NumberColumn title="完成・お渡し待ち" orders={readyOrders} tone="ready" />
      </div>
      <footer className="border-t-thin border-foreground px-4 py-2 text-right font-mono text-xs text-muted-foreground sm:px-8">
        自動更新 · 最終更新 {lastUpdated} · {clock.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
      </footer>
    </main>
  );
}
