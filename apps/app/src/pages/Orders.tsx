import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { preOrderApi, orderApi, circleApi, type VisitorOrderHistory } from "@/lib/api";
import { useVisitor } from "@/hooks/useVisitor";
import { ModSandbox } from "@/components/ModSandbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, CheckCircle2, Receipt, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMobileOrderOutboxEntries, retryMobileOrder, type MobileOrderOutboxEntry } from "@/features/orders/mobile-order-outbox";

type MobileOrderReceipt = {
  orderId: string;
  orderNumber: string;
  circleName: string;
  totalPrice: number;
  items: NonNullable<MobileOrderOutboxEntry["displayItems"]>;
};

/**
 * 来場者の注文履歴 (2026-07-11 マイページから分離 / 2026-07-13 サーバ実注文ベースへ再構成)。
 *
 * 表示は2種類:
 *  1. [注文履歴] レジを通った注文 (order テーブル)。事前注文の受取確定・代引の両方を含む。
 *     GET /api/orders/user/:code から取得する。端末非依存で、別端末やデータ削除後も残る。
 *  2. [受取待ちの事前注文] まだレジを通していない pending の事前オーダー。
 *     GET /api/pre-orders/user/:code から取得する (受取確定すると order へ移り 1 に現れる)。
 *
 * 旧実装は代引履歴を localStorage(fesorder_direct_orders) だけで持っていたため端末を変えると
 * 消えていた。サーバの userId 別注文一覧に置き換え、localStorage 依存を撤去した。
 * 来場者は eventUser.id ベアラーのみで参照する (認証会員ではない)。
 */

// 注文ステータス → 表示バッジ。order.status は pending/preparing/ready/completed/cancelled。
function orderStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return { cls: "bg-success text-primary-foreground", icon: CheckCircle2, label: "受取完了" };
    case "ready":
      return { cls: "bg-info text-primary-foreground", icon: CheckCircle2, label: "受取可能" };
    case "preparing":
      return { cls: "bg-info text-primary-foreground", icon: Clock, label: "調理中" };
    case "cancelled":
      return { cls: "bg-muted text-muted-foreground border-thin border-border", icon: XCircle, label: "キャンセル" };
    default: // pending
      return { cls: "bg-warning text-foreground border-thin border-border", icon: Clock, label: "受付済み" };
  }
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const receipt = (location.state as { mobileOrderReceipt?: MobileOrderReceipt } | null)?.mobileOrderReceipt;
  const { userId: visitorUserId, isLoaded } = useVisitor();
  const userId = visitorUserId ?? "";

  const [modHooks, setModHooks] = useState<{ id: string; hook: any }[]>([]);

  const { data: queuedOrders = [], isLoading: queuedOrdersLoading, refetch: refetchQueuedOrders } = useQuery({
    queryKey: ["mobileOrderOutbox", userId],
    queryFn: () => getMobileOrderOutboxEntries(userId),
    enabled: isLoaded && !!userId,
    networkMode: "always",
    retry: false,
  });

  useEffect(() => {
    const refresh = () => void refetchQueuedOrders();
    window.addEventListener("fesflow:outbox-change", refresh);
    window.addEventListener("fesflow:mobile-order-synced", refresh);
    return () => {
      window.removeEventListener("fesflow:outbox-change", refresh);
      window.removeEventListener("fesflow:mobile-order-synced", refresh);
    };
  }, [refetchQueuedOrders]);

  // 注文履歴 (レジを通った注文) 取得。getByUser は握り潰さないので isError で ErrorState に流す。
  const {
    data: orderHistory,
    isLoading: historyLoading,
    isError: historyError,
    error: historyErrorObj,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["myOrders", userId],
    queryFn: () => orderApi.getByUser(userId),
    enabled: !!userId,
    networkMode: "always",
    retry: false,
  });

  // 2026-10-21: オフライン注文の同期完了後、番号が付いた注文を表示するため履歴を再取得する。
  useEffect(() => {
    const refreshHistory = () => void refetchHistory();
    window.addEventListener("fesflow:mobile-order-synced", refreshHistory);
    return () => window.removeEventListener("fesflow:mobile-order-synced", refreshHistory);
  }, [refetchHistory]);

  // 事前オーダー(未受取) 取得
  const {
    data: preOrders,
    isLoading: preOrdersLoading,
    isError: preOrdersError,
    error: preOrdersErrorObj,
    refetch: refetchPreOrders,
  } = useQuery({
    queryKey: ["myPreOrders", userId],
    queryFn: () => preOrderApi.getByCode(userId),
    enabled: !!userId,
    networkMode: "always",
    retry: false,
  });

  // 注文履歴に含まれるサークルの myOrderBodyBottom モッドフックを読み込む
  useEffect(() => {
    const loadModHooks = async () => {
      const orders = orderHistory ?? [];
      const circleIds = Array.from(new Set(orders.map((o) => o.circleId)));
      if (circleIds.length === 0) {
        setModHooks([]);
        return;
      }
      try {
        const hooks: { id: string; hook: any }[] = [];
        for (const cid of circleIds) {
          try {
            const circleData = await circleApi.get(cid);
            if (circleData && circleData.mods) {
              const modsPayload = JSON.parse(circleData.mods);
              Object.values(modsPayload.installed || {}).forEach((m: any) => {
                if (m.enabled && m.manifest.hooks?.myOrderBodyBottom) {
                  hooks.push({
                    id: m.manifest.id,
                    hook: m.manifest.hooks.myOrderBodyBottom,
                  });
                }
              });
            }
          } catch (e) {
            // Ignore individual fetch errors
          }
        }
        setModHooks(hooks);
      } catch (err) {
        console.error("Failed to load mod hooks:", err);
      }
    };
    loadModHooks();
  }, [orderHistory]);

  if (!isLoaded || queuedOrdersLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4 font-mono">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const history: VisitorOrderHistory[] = orderHistory ?? [];
  const displayedHistory = history.filter((order) => order.id !== receipt?.orderId);
  const hasHistory = displayedHistory.length > 0;
  const hasPreOrders = !!preOrders && preOrders.length > 0;

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6 pb-24 font-mono">
      <button
        onClick={() => navigate("/visitor/mypage")}
        className="min-h-11 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2 hover:text-info"
      >
        <ArrowLeft className="h-4 w-4" />
        マイQRに戻る
      </button>

      <div className="border-b-thick border-border pb-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tight leading-tight flex items-center gap-2">
          <Receipt className="h-6 w-6 shrink-0" />
          注文履歴
        </h1>
        <p className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground mt-1">
          過去の注文と、受取待ちの事前注文を確認できます
        </p>
      </div>

      {receipt && (
        <section aria-labelledby="mobile-order-receipt-heading" role="status" className="space-y-3 border-heavy border-success bg-success/10 p-4 sm:p-6">
          <div>
            <h2 id="mobile-order-receipt-heading" className="text-lg font-black">注文を受け付けました</h2>
            <p className="mt-1 text-sm">店頭では、この番号をお伝えください。</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 border-y-thick border-border py-3">
            <div>
              <p className="text-xs font-bold">呼出番号</p>
              <p className="font-headline text-4xl leading-none tabular-nums sm:text-5xl">#{receipt.orderNumber}</p>
              <p className="mt-2 text-sm font-bold">{receipt.circleName}</p>
            </div>
            <p className="text-2xl font-black tabular-nums">¥{receipt.totalPrice.toLocaleString()}</p>
          </div>
          <ul className="space-y-2 text-sm">
            {receipt.items.map((item, index) => (
              <li key={`${item.menuName}-${index}`} className="border-b-thin border-border pb-2 last:border-0">
                <div className="flex justify-between gap-3">
                  <span className="font-bold">{item.menuName} ×{item.quantity}</span>
                  <span className="shrink-0">¥{(item.unitPrice * item.quantity).toLocaleString()}</span>
                </div>
                {item.toppings && item.toppings.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">トッピング: {item.toppings.join("、")}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {queuedOrders.length > 0 && (
        <section aria-labelledby="queued-orders-heading" className="space-y-3">
          <h2 id="queued-orders-heading" className="flex items-center gap-2 border-b-thick border-border pb-2 text-lg font-black uppercase">
            <Clock className="h-5 w-5" />送信待ちの注文
          </h2>
          <p className="border-thick border-warning bg-warning/10 p-3 text-xs font-bold" role="status">
            通信が切れた場合、サークル側で受付済みの可能性があります。受付確認待ちの注文は、同じキーで結果を確認します。
          </p>
          {queuedOrders.map((order: MobileOrderOutboxEntry) => (
            <article key={order.idempotencyKey} className="space-y-3 border-thick border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black">{order.circleName}</h3>
                  <p className="text-[11px] text-muted-foreground">{new Date(order.createdAt).toLocaleString("ja-JP")}</p>
                </div>
                <span className={`border-thin border-border px-2 py-1 text-xs font-black ${order.state === "attention" ? "bg-destructive text-destructive-foreground" : order.state === "confirmed" ? "bg-success text-success-foreground" : "bg-warning text-foreground"}`}>
                  {order.state === "attention" ? "受付状態を確認してください" : order.state === "confirmed" ? `受付済み · 呼出番号 ${order.result?.orderNumber ?? "確認中"}` : "受付確認待ち"}
                </span>
              </div>
              <ul className="space-y-1 text-xs">
                {(order.displayItems ?? order.input.items.map((item) => ({ menuName: `メニュー ${item.menuId.slice(-6)}`, quantity: item.quantity, unitPrice: 0, toppings: [] }))).map((item, index) => (
                  <li key={`${item.menuName}-${index}`} className="flex justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate">{item.menuName}</span>
                      {item.toppings && item.toppings.length > 0 && <span className="block text-[10px] text-muted-foreground">トッピング: {item.toppings.join("、")}</span>}
                    </span>
                    <span className="shrink-0">×{item.quantity} · ¥{(item.unitPrice * item.quantity).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              {order.errorMessage && <p className="text-xs text-destructive">{order.errorMessage}</p>}
              {order.errorMessage?.includes("価格が変更") && <p className="text-xs font-bold">未受付です。モバイル注文画面に戻り、現在の価格を確認してください。</p>}
              {order.state !== "confirmed" && !order.errorMessage?.includes("価格が変更") && <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={async () => { try { await retryMobileOrder(order.idempotencyKey); } catch { /* 2026-10-21: 失敗はキュー状態に表示し、未処理Promiseを作らない。 */ } finally { await refetchQueuedOrders(); } }} className="min-h-11 border-thick border-border">
                  送信を再試行
                </Button>
              </div>}
            </article>
          ))}
        </section>
      )}

      {/* 2026-09-27: 注文履歴から自分の体験レビューを投稿する導線を維持する。 */}
      <button onClick={() => navigate("/visitor/reviews")} className="inline-flex items-center gap-2 border-thick border-border px-4 py-3 text-xs font-bold uppercase hover:bg-primary hover:text-primary-foreground">
        <Receipt className="h-4 w-4" />体験したサークルをレビューする
      </button>

      {/* どちらも無い & エラーも無いときは1つの空状態にまとめる */}
      {!hasHistory && !hasPreOrders && !historyError && !preOrdersError && !historyLoading && !preOrdersLoading ? (
        <EmptyState icon={Receipt} message="まだ注文履歴はありません" />
      ) : null}
      {!hasHistory && !hasPreOrders && (historyLoading || preOrdersLoading) && (
        <p role="status" className="border-thin border-border bg-muted p-3 text-xs">サーバーの注文履歴を読み込んでいます。端末に保存した注文は先に表示しています。</p>
      )}

      {/* 受取待ちの事前注文 (まだレジを通していない pending) */}
      {(hasPreOrders || preOrdersError) && (
        <div className="space-y-4">
          <h2 className="text-lg sm:text-2xl font-black uppercase border-b-thick border-border pb-2">
            [受取待ちの事前注文]
          </h2>

          {preOrdersError ? (
            <ErrorState error={preOrdersErrorObj} onRetry={() => refetchPreOrders()} />
          ) : (
            <div className="space-y-4">
              {preOrders!.map((po) => (
                <div
                  key={po.id}
                  className="border-thick border-border bg-background p-5 space-y-3"
                >
                  <div className="flex justify-between items-start border-b-[2px] border-border pb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-warning text-foreground border-thin border-border px-2 py-0.5 text-xs font-black uppercase flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> 店頭未受取
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(po.createdAt).toLocaleTimeString("ja-JP")}
                      </span>
                    </div>
                    <span className="text-xl font-black">
                      ¥{po.totalPrice.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-muted p-3 border-thick border-border">
                    <ul className="divide-y divide-border/10 text-sm">
                      {po.items.map((item) => (
                        <li key={item.id} className="py-1 flex justify-between">
                          <span className="font-bold">{item.menu?.name || "メニュー"}</span>
                          <span>x {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      )}

      {/* 注文履歴 (レジを通った注文) */}
      {(hasHistory || historyError) && (
        <div className="space-y-4">
          <h2 className="text-lg sm:text-2xl font-black uppercase border-b-thick border-border pb-2">
            [過去の注文]
          </h2>

          {historyError ? (
            <ErrorState error={historyErrorObj} onRetry={() => refetchHistory()} />
          ) : (
            <div className="space-y-4">
              {displayedHistory.map((o) => {
                const badge = orderStatusBadge(o.status);
                const Icon = badge.icon;
                return (
                  <div
                    key={o.id}
                    className="border-thick border-border bg-background p-5 space-y-3"
                  >
                    <div className="flex flex-col gap-3 border-b-thick border-border pb-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="flex flex-col items-start gap-2">
                        <span className={`px-2 py-0.5 text-xs font-black uppercase flex items-center gap-1 ${badge.cls}`}>
                          <Icon className="h-3.5 w-3.5" /> {badge.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleTimeString("ja-JP")}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-end justify-between gap-3 sm:justify-end">
                        <div>
                          <span className="block text-[10px] font-bold uppercase">呼出番号</span>
                          <span className="block font-headline text-3xl leading-none tabular-nums">#{o.orderNumber}</span>
                        </div>
                        <span className="text-xl font-black">
                          ¥{o.totalPrice.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm font-bold flex items-center gap-2">
                      <span className="text-muted-foreground font-normal">店舗:</span>
                      {o.circleName || "サークル"}
                    </div>

                    <div className="bg-muted p-3 border-thick border-border">
                      <ul className="divide-y divide-border/10 text-sm">
                        {o.items.map((item) => (
                          <li key={item.id} className="py-1">
                            <div className="flex justify-between">
                              <span className="font-bold">{item.menuName}</span>
                              <span>x {item.quantity}</span>
                            </div>
                            {item.toppings.length > 0 && (
                              <div className="text-xs text-muted-foreground pl-2 mt-0.5">
                                + {item.toppings.map((t) => t.name).join(", ")}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 外部モッドの動的インジェクション (マイオーダー画面用) */}
      {modHooks.map((m) => {
        const { id, hook } = m;
        return (
          <div key={`${id}-body-bottom`} className="w-full">
            <ModSandbox
              modId={id}
              hookName="myOrderBodyBottom"
              html={typeof hook === "string" ? hook : undefined}
              jsUrl={typeof hook === "object" ? hook.js : undefined}
              cssUrl={typeof hook === "object" ? hook.css : undefined}
              data={history}
            />
          </div>
        );
      })}
    </div>
  );
}
