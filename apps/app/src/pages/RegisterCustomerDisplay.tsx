import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { registerDisplaySnapshotSchema, type RegisterDisplaySnapshot } from "@fesflow/config/register-display-contract";
import { orderApi } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { REGISTER_DISPLAY_CHANNEL } from "@/features/orders/register-display-sync";

function yen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

export default function RegisterCustomerDisplay() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const token = useMemo(() => window.location.hash.slice(1), []);
  const localOnly = Boolean(sessionId?.startsWith("local-") && !token);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [localSnapshot, setLocalSnapshot] = useState<RegisterDisplaySnapshot | null>(null);
  const localUpdatedAt = useRef(0);
  const localRevision = useRef(0);
  const localReceivedAt = useRef(0);
  const displayQuery = useQuery({
    queryKey: ["register-display", sessionId],
    queryFn: () => orderApi.getRegisterDisplay(sessionId!, token),
    enabled: Boolean(sessionId && token),
    refetchInterval: isOnline ? 2_000 : false,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!sessionId || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(REGISTER_DISPLAY_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as { sessionId?: unknown; snapshot?: unknown; revision?: unknown; sentAt?: unknown };
      if (message.sessionId !== sessionId || typeof message.sentAt !== "number" || typeof message.revision !== "number") return;
      const parsed = registerDisplaySnapshotSchema.safeParse(message.snapshot);
      if (!parsed.success || message.revision < localRevision.current || message.sentAt < localUpdatedAt.current) return;
      localRevision.current = message.revision;
      localUpdatedAt.current = message.sentAt;
      localReceivedAt.current = Date.now();
      setLocalSnapshot(parsed.data);
    };
    return () => channel.close();
  }, [sessionId]);

  const serverResponse = displayQuery.data;
  const shareEnded = displayQuery.error instanceof ApiError && displayQuery.error.code === "NOT_FOUND";
  const serverIsNewer = Boolean(serverResponse && serverResponse.revision >= localRevision.current);
  const snapshot = shareEnded ? null : serverIsNewer ? serverResponse?.snapshot : localSnapshot ?? serverResponse?.snapshot;
  const lastContact = Math.max(
    serverResponse?.updatedAt ?? 0,
    localReceivedAt.current,
  );
  const freshLocalSync = localReceivedAt.current > 0 && Date.now() - localReceivedAt.current <= 8_000;
  const stale = !freshLocalSync && (!isOnline || displayQuery.isError || !lastContact || Date.now() - lastContact > 45_000);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "お客さま用カート表示 | FesFlow";
    return () => { document.title = previousTitle; };
  }, []);

  if (!sessionId || (!token && !localOnly)) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-center text-foreground">
        <div>
          <h1 className="font-headline text-3xl uppercase">画面を開けません</h1>
          <p className="mt-3 font-mono text-sm">レジ画面から共有用QRコードをもう一度開いてください。</p>
        </div>
      </main>
    );
  }

  if (shareEnded) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-center text-foreground">
        <div>
          <h1 className="font-headline text-3xl uppercase">共有画面は終了しました</h1>
          <p className="mt-3 font-mono text-sm">レジで新しい共有画面を開いてください。</p>
        </div>
      </main>
    );
  }

  if (!snapshot && displayQuery.isError) {
    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-center text-foreground">
        <div>
          <h1 className="font-headline text-3xl uppercase">レジに接続できません</h1>
          <p className="mt-3 font-mono text-sm">通信を回復しています。お支払い前にレジの表示をご確認ください。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh w-full flex-col bg-background text-foreground">
      <header className="border-b-heavy border-foreground bg-primary px-4 py-4 text-primary-foreground sm:px-8 sm:py-6">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] sm:text-sm">{snapshot?.circleName || "FesFlow"}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <h1 className="font-headline text-2xl uppercase sm:text-4xl">{snapshot?.displayState === "submitted" ? "ご注文を受け付けました" : "お会計内容"}</h1>
          <span className={`px-2 py-1 font-mono text-sm font-bold text-white ${stale ? "bg-error" : "bg-success"}`} role="status" aria-live="polite">
            {stale ? "● 表示の更新を確認してください" : "● レジと同期中"}
          </span>
        </div>
      </header>

      {stale && (
        <p role="alert" className="bg-error px-4 py-2 text-center font-mono text-sm font-bold text-white sm:text-base">
          最新のカート内容を受信できていません。お支払い前にレジの表示をご確認ください。
        </p>
      )}

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 sm:px-8 sm:py-6">
        {snapshot?.displayState === "submitted" && (
          <section aria-label="注文番号" className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-thick border-foreground bg-success px-4 py-3 text-white sm:mb-6 sm:px-6 sm:py-4">
            <span className="font-mono text-sm font-bold uppercase sm:text-lg">注文番号</span>
            <strong className="break-all font-mono text-2xl font-black tabular-nums sm:text-4xl">{snapshot.orderNumber ?? "確認中"}</strong>
          </section>
        )}
        <section aria-label="カート内の商品" className="min-h-0 flex-1 overflow-y-auto">
          {displayQuery.isLoading && !snapshot ? (
            <p className="py-10 text-center font-mono text-lg">レジに接続しています…</p>
          ) : snapshot?.items.length ? snapshot.items.map((item, index) => (
            <article key={`${item.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b-thin border-foreground py-4 sm:gap-x-8 sm:py-5">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-bold sm:text-2xl">{item.name}</h2>
                <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground sm:text-base">
                  {snapshot.isPreOrder ? `数量 ${item.quantity}` : `${yen(item.unitPrice)} × ${item.quantity}`}
                </p>
              {item.toppings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {item.toppings.map((topping, toppingIndex) => (
                      <li key={`${topping.name}-${toppingIndex}`} className="break-words">
                        + {topping.name}{topping.unitPrice > 0 ? ` (${yen(topping.unitPrice)} × ${item.quantity})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {!snapshot.isPreOrder && <p className="shrink-0 self-start font-mono text-lg font-bold tabular-nums sm:text-2xl">{yen(item.subtotal)}</p>}
            </article>
          )) : (
            <p className="grid min-h-40 place-items-center py-10 text-center font-mono text-lg text-muted-foreground sm:text-2xl">
              商品を選ぶと、こちらに表示されます。
            </p>
          )}
        </section>

        {snapshot && (
          <section aria-label="お会計" className="mt-4 shrink-0 border-t-heavy border-foreground pt-4 sm:mt-6 sm:pt-5">
            {!snapshot.isPreOrder && <div className="ml-auto w-full max-w-md space-y-2 font-mono text-sm sm:text-base">
              <div className="flex justify-between gap-4"><span>小計</span><span className="tabular-nums">{yen(snapshot.subtotal)}</span></div>
              {snapshot.discount > 0 && <div className="flex justify-between gap-4 text-success"><span>割引</span><span className="tabular-nums">−{yen(snapshot.discount)}</span></div>}
            </div>}
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t-thin border-foreground pt-3 sm:mt-4 sm:pt-4">
              <span className="font-headline text-lg uppercase sm:text-2xl">{snapshot.isPreOrder ? "事前注文価格" : snapshot.displayState === "submitted" ? "注文合計" : "合計"}</span>
              <strong className="font-mono text-4xl font-black leading-none tabular-nums sm:text-6xl">{yen(snapshot.total)}</strong>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
