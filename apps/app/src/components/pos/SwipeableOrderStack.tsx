import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CheckCircle, Clock, List, Rows3, Users, XCircle } from "lucide-react";
import { displayOrderNumber } from "@/lib/order-number";

export interface SwipeableOrder {
  id: string;
  orderNumber: string;
  createdAt: string | Date | null;
  status: string;
  receivedAt?: string | Date | null;
  source?: "pos" | "mobile";
  totalPrice?: number;
  peopleCount?: number;
  items: Array<{
    id: string;
    menuName: string;
    quantity: number;
    menuPrice?: number;
    toppings?: Array<{
      id: string;
      toppingName: string;
      price: number;
      category?: string;
      sortOrder?: number;
    }>;
  }>;
}

export type KitchenOrderView = "horizontal" | "list";

interface SwipeableOrderStackProps {
  orders: SwipeableOrder[];
  view: KitchenOrderView;
  openAtLatest?: boolean;
  onViewChange: (view: KitchenOrderView) => void;
  onStart: (id: string) => Promise<unknown>;
  onComplete: (id: string) => Promise<unknown>;
  onMarkReceived: (id: string) => Promise<unknown>;
  onCancelRequest: (id: string, orderNumber: string) => void;
  cancelAnimationOrderId?: string | null;
  isUpdating?: boolean;
}

const VERTICAL_SWIPE_THRESHOLD = 72;
const EXIT_ANIMATION_MS = 300;

function orderTime(date: string | Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string) {
  const config: Record<string, { label: string; variant: "default" | "warning" | "active" | "error" }> = {
    pending: { label: "未着手", variant: "default" },
    preparing: { label: "調理中", variant: "warning" },
    ready: { label: "受け取り待ち", variant: "active" },
    completed: { label: "完成", variant: "active" },
    cancelled: { label: "キャンセル", variant: "error" },
  };
  return config[status] ?? { label: status, variant: "default" as const };
}

function orderAction(status: string): { label: string; icon: typeof Clock; kind: "start" | "complete" } | null {
  if (status === "pending") return { label: "調理開始", icon: Clock, kind: "start" };
  if (status === "preparing") return { label: "完成", icon: CheckCircle, kind: "complete" };
  return null;
}

function groupedToppings(toppings: NonNullable<SwipeableOrder["items"][number]["toppings"]>) {
  const groups = new Map<string, typeof toppings>();
  for (const topping of toppings) {
    const category = topping.category?.trim() || "未分類";
    groups.set(category, [...(groups.get(category) ?? []), topping]);
  }
  // 2026-10-16: 管理画面で調整したトッピング順をカテゴリの出現順にも反映する。
  return [...groups.entries()]
    .map(([category, options]) => ({
      category,
      firstSortOrder: Math.min(...options.map((option) => option.sortOrder ?? 0)),
      options: [...options].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.toppingName.localeCompare(b.toppingName, "ja")),
    }))
    .sort((a, b) => a.firstSortOrder - b.firstSortOrder || a.category.localeCompare(b.category, "ja"))
    .map(({ category, options }) => [category, options] as const);
}

function KitchenOrderCard({
  order,
  view,
  isUpdating,
  onStart,
  onComplete,
  onMarkReceived,
  onCancelRequest,
  cancelAnimationOrderId,
}: {
  order: SwipeableOrder;
  view: KitchenOrderView;
  isUpdating: boolean;
  onStart: () => Promise<unknown>;
  onComplete: () => Promise<unknown>;
  onMarkReceived: () => Promise<unknown>;
  onCancelRequest: () => void;
  cancelAnimationOrderId?: string | null;
}) {
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  const actionTimer = useRef<number | null>(null);
  const [gestureHint, setGestureHint] = useState<"start" | "complete" | "cancel" | null>(null);
  const [exitDirection, setExitDirection] = useState<"up" | "down" | null>(null);
  const action = orderAction(order.status);
  const isAwaitingPickup = (order.status === "ready" || order.status === "completed") && !order.receivedAt;
  const badge = order.receivedAt
    ? { label: "受け渡し済み", variant: "active" as const }
    : order.status === "completed"
      ? { label: "受け取り待ち", variant: "active" as const }
      : statusBadge(order.status);
  const canCancel = order.status === "pending" || order.status === "preparing";

  const performAction = async () => {
    try {
      if (action?.kind === "start") await onStart();
      else if (action?.kind === "complete") await onComplete();
    } catch {
      // 2026-10-17: 失敗通知は親のMutationが表示し、カードは操作可能な状態へ戻す。
    } finally {
      setExitDirection(null);
    }
  };

  useEffect(() => {
    if (cancelAnimationOrderId === order.id) setExitDirection("down");
    else setExitDirection((direction) => direction === "down" ? null : direction);
  }, [cancelAnimationOrderId, order.id]);

  useEffect(() => () => {
    if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
  }, []);

  // 2026-10-17: 明示ボタンを残したままカード全体で上下操作を受け、カード内に操作案内を重ねない。
  const onGestureDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (view !== "horizontal") return;
    if (isUpdating || exitDirection || (!action && !canCancel) || !event.isPrimary || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureStart.current = { x: event.clientX, y: event.clientY };
    setGestureHint(null);
  };
  const onGestureMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (view !== "horizontal") return;
    const start = gestureStart.current;
    if (!start || isUpdating) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) <= Math.abs(dx)) return;
    event.preventDefault();
    setGestureHint(dy < -16 ? (action?.kind ?? null) : dy > 16 && canCancel ? "cancel" : null);
  };
  const onGestureEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (view !== "horizontal") return;
    const start = gestureStart.current;
    gestureStart.current = null;
    setGestureHint(null);
    if (!start || isUpdating || exitDirection) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) <= Math.abs(dx)) return;
    if (dy <= -VERTICAL_SWIPE_THRESHOLD && action) {
      setExitDirection("up");
      actionTimer.current = window.setTimeout(() => void performAction(), EXIT_ANIMATION_MS);
    }
    else if (dy >= VERTICAL_SWIPE_THRESHOLD && canCancel) onCancelRequest();
  };

  const onGestureKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (view !== "horizontal") return;
    if (event.target !== event.currentTarget || isUpdating || exitDirection) return;
    if (event.key === "ArrowUp" && action) {
      event.preventDefault();
      setExitDirection("up");
      actionTimer.current = window.setTimeout(() => void performAction(), EXIT_ANIMATION_MS);
    } else if (event.key === "ArrowDown" && canCancel) {
      event.preventDefault();
      onCancelRequest();
    }
  };

  // 2026-10-17: スワイプの方向説明は表示・読み上げとも省き、状態名だけを伝える。
  return (
    <Card
      className={`relative flex h-full flex-col border-thick border-border bg-background transition-[transform,opacity,background-color] duration-300 ease-in-out motion-reduce:transition-none ${view === "horizontal" ? "snap-start" : ""} ${exitDirection === "up" ? "-translate-y-8 bg-success/30 opacity-0" : exitDirection === "down" ? "translate-y-8 bg-destructive/30 opacity-0" : ""} ${view === "horizontal" && (action || canCancel) ? "touch-pan-x cursor-grab select-none active:cursor-grabbing" : ""}`}
      data-order-id={order.id}
      onPointerDown={onGestureDown}
      onPointerMove={onGestureMove}
      onPointerUp={onGestureEnd}
      onPointerCancel={() => {
        gestureStart.current = null;
        setGestureHint(null);
      }}
      onKeyDown={onGestureKeyDown}
      tabIndex={view === "horizontal" && (action || canCancel) ? 0 : undefined}
      role="group"
      aria-label={`注文 ${displayOrderNumber(order.orderNumber)}、${badge.label}`}
    >
      {gestureHint && (
        <div className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center ${gestureHint === "cancel" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
          {gestureHint === "cancel" ? <ArrowDown className="h-8 w-8" /> : <ArrowUp className="h-8 w-8" />}
        </div>
      )}
      <CardHeader className="border-b-thin border-border p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="font-headline text-2xl uppercase leading-none sm:text-3xl">#{displayOrderNumber(order.orderNumber)}</CardTitle>
              <CardDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{orderTime(order.createdAt)}</span>
                {order.peopleCount != null && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{order.peopleCount}名</span>}
                {/* 2026-10-17: 厨房では注文受付元をカード上で即時判別できるようにする。 */}
                <span className="inline-flex rounded-none border-thin border-border bg-background px-1.5 py-0 text-[10px] font-semibold uppercase tracking-[1px]">
                  {order.source === "mobile" ? "モバイル注文" : "レジ注文"}
                </span>
                <span>{order.items.length}品目</span>
              </CardDescription>
            </div>
            <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
          </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 p-3 sm:p-4">
        {order.items.map((item) => (
          <section key={item.id} className="border-b-thin border-border pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-start gap-3">
              {/* 2026-10-16: 視覚用の「×N」と読み上げ用の数量表現を分け、注文数の誤認を防ぐ。 */}
              <span className="flex h-12 min-w-14 shrink-0 items-center justify-center border-thick border-primary bg-primary px-2 font-headline text-xl leading-none text-primary-foreground" aria-hidden="true">
                ×{item.quantity}
              </span>
              <span className="sr-only">数量 {item.quantity} 個</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="break-words text-base font-black leading-snug sm:text-lg">{item.menuName}</h3>
                  {item.menuPrice != null && <span className="shrink-0 font-mono text-xs text-muted-foreground">¥{(item.menuPrice * item.quantity).toLocaleString()}</span>}
                </div>
                {item.toppings && item.toppings.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {groupedToppings(item.toppings).map(([category, toppings]) => (
                      <div key={category}>
                        <p className="mb-1 font-mono text-xs font-black uppercase tracking-wider text-muted-foreground">{category}</p>
                        <ul className="space-y-1 border-l-thick border-border pl-2">
                          {toppings.map((topping) => (
                            <li key={topping.id} className="flex items-start justify-between gap-2 text-xs font-bold">
                              <span className="break-words">{topping.toppingName}</span>
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">各{item.quantity}個分</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}
        <div className="flex items-center justify-between border-t-thick border-border pt-3 font-mono">
          <span className="text-xs font-bold uppercase">合計</span>
          <span className="font-headline text-xl tabular-nums">¥{(order.totalPrice ?? 0).toLocaleString()}</span>
        </div>
      </CardContent>

      <CardFooter className="grid grid-cols-1 gap-2 border-t-thin border-border p-3 sm:grid-cols-2 sm:p-4">
        {isAwaitingPickup ? (
          <Button
            onClick={() => void onMarkReceived()}
            disabled={isUpdating}
            aria-label={`注文${displayOrderNumber(order.orderNumber)}を受け渡し済みにする`}
            className="h-12 w-full border-thick border-border bg-success font-mono font-black uppercase text-white hover:bg-success/90 sm:col-span-2"
          >
            <CheckCircle className="mr-2 h-4 w-4" />受け渡し済み
          </Button>
        ) : action ? (
          <Button
            onClick={() => {
              setExitDirection("up");
              actionTimer.current = window.setTimeout(() => void performAction(), EXIT_ANIMATION_MS);
            }}
            disabled={isUpdating || exitDirection !== null}
            aria-label={`注文${displayOrderNumber(order.orderNumber)}を${action.label}`}
            className="h-12 w-full border-thick border-border font-mono font-black uppercase"
          >
            <action.icon className="mr-2 h-4 w-4" />{action.label}
          </Button>
        ) : (
          <Button disabled variant="outline" className="h-12 w-full border-thick border-border font-mono font-bold uppercase sm:col-span-2">
            {order.receivedAt ? <><CheckCircle className="mr-2 h-4 w-4" />受け渡し済み</> : order.status === "completed" ? <><CheckCircle className="mr-2 h-4 w-4" />受け取り待ち</> : order.status === "cancelled" ? <><XCircle className="mr-2 h-4 w-4" />キャンセル済み</> : badge.label}
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            onClick={onCancelRequest}
            disabled={isUpdating || exitDirection !== null}
            aria-label={`注文${displayOrderNumber(order.orderNumber)}をキャンセル`}
            className="h-12 w-full border-thick border-destructive font-mono font-bold text-destructive hover:bg-destructive hover:text-primary-foreground"
          >
            <XCircle className="mr-2 h-4 w-4" />キャンセル
          </Button>
        )}
      </CardFooter>

    </Card>
  );
}

export function SwipeableOrderStack({
  orders,
  view,
  openAtLatest = false,
  onViewChange,
  onStart,
  onComplete,
  onMarkReceived,
  onCancelRequest,
  cancelAnimationOrderId,
  isUpdating = false,
}: SwipeableOrderStackProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousOrderIds = useRef("");
  const previousView = useRef<KitchenOrderView>("list");
  const previousOpenAtLatest = useRef(false);
  const ordered = useMemo(() => [...orders].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return at - bt || a.orderNumber.localeCompare(b.orderNumber, "ja", { numeric: true });
  }), [orders]);
  const orderIds = ordered.map((order) => order.id).join(",");
  const currentOrder = openAtLatest
    ? undefined
    : ordered.find((order) => order.status === "pending" || order.status === "preparing");

  // 2026-10-17: 作業キューでは最古の対応中注文を中央に置き、全件表示では最新注文から履歴を確認する。
  useEffect(() => {
    if (
      previousOrderIds.current === orderIds &&
      previousView.current === view &&
      previousOpenAtLatest.current === openAtLatest
    ) return;
    previousOrderIds.current = orderIds;
    previousView.current = view;
    previousOpenAtLatest.current = openAtLatest;
    if (view !== "horizontal") return;
    const frame = window.requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (!element) return;
      if (openAtLatest || !currentOrder) {
        element.scrollLeft = element.scrollWidth;
        return;
      }
      const focusedOrder = currentOrder && element.querySelector<HTMLElement>(`[data-order-id="${CSS.escape(currentOrder.id)}"]`);
      if (!focusedOrder) {
        element.scrollLeft = element.scrollWidth;
        return;
      }
      const orderRect = focusedOrder.getBoundingClientRect();
      const listRect = element.getBoundingClientRect();
      element.scrollTo({
        left: element.scrollLeft + orderRect.left - listRect.left - (element.clientWidth - orderRect.width) / 2,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentOrder?.id, openAtLatest, orderIds, view]);

  return (
    <section className="space-y-3" aria-label="厨房の注文一覧">
      <div className="flex flex-col gap-3 border-b-thick border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-wider">{ordered.length}件の注文</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === "horizontal" && ordered.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => scrollRef.current?.scrollBy({ left: -360, behavior: "smooth" })} className="border-thick border-border font-mono" aria-label="古い注文へ">
                <ArrowLeft className="mr-1 h-4 w-4" />古い注文
              </Button>
              <Button variant="outline" size="sm" onClick={() => scrollRef.current?.scrollBy({ left: 360, behavior: "smooth" })} className="border-thick border-border font-mono" aria-label="新しい注文へ">
                新しい注文<ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </>
          )}
          <div className="flex border-thick border-border" role="group" aria-label="注文表示形式">
            <Button type="button" size="sm" variant={view === "horizontal" ? "default" : "outline"} aria-pressed={view === "horizontal"} onClick={() => onViewChange("horizontal")} className="border-0 font-mono">
              <Rows3 className="mr-1 h-4 w-4" />横並び
            </Button>
            <Button type="button" size="sm" variant={view === "list" ? "default" : "outline"} aria-pressed={view === "list"} onClick={() => onViewChange("list")} className="border-0 font-mono">
              <List className="mr-1 h-4 w-4" />リスト
            </Button>
          </div>
        </div>
      </div>
      {/* 2026-10-16: リストは1列にして上から下の順を保ち、奇数件でも最新が左へ戻らないようにする。 */}
      <div
        ref={scrollRef}
        className={view === "horizontal" && ordered.length > 0
          ? "flex items-stretch gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin]"
          : "grid grid-cols-1 items-stretch gap-3"}
      >
        {ordered.length === 0 ? (
          <Card className="border-thick border-dashed border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <p className="font-headline text-xl uppercase text-muted-foreground">注文はありません</p>
              <p className="mt-2 text-center font-mono text-xs text-muted-foreground">この状態の注文が入るとここに表示されます。</p>
            </CardContent>
          </Card>
        ) : ordered.map((order) => (
          <div
            key={order.id}
            data-order-id={order.id}
            className={view === "horizontal" ? "w-[min(88vw,26rem)] shrink-0" : "min-w-0"}
          >
            <KitchenOrderCard
              order={order}
              view={view}
              isUpdating={isUpdating}
              onStart={() => onStart(order.id)}
              onComplete={() => onComplete(order.id)}
              onMarkReceived={() => onMarkReceived(order.id)}
              onCancelRequest={() => onCancelRequest(order.id, displayOrderNumber(order.orderNumber))}
              cancelAnimationOrderId={cancelAnimationOrderId}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
