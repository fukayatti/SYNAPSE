import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CloudUpload, WifiOff } from "lucide-react";
import { useVisitor } from "@/hooks/useVisitor";

type ConnectionMode = "online" | "offline" | "unstable";
type ConnectionState = {
  mode: ConnectionMode;
  pending: number;
  attention: number;
  syncing: boolean;
  total: number;
  completed: number;
  storageError: boolean;
};

const ConnectionContext = createContext<ConnectionState>({
  mode: "online", pending: 0, attention: 0, syncing: false, total: 0, completed: 0, storageError: false,
});

// 2026-10-21: 来場者・サークル・イベント画面で通信状態と送信待ちを同じ表示にする。
export function ConnectionStatusProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useVisitor();
  const [state, setState] = useState<ConnectionState>(() => ({
    mode: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
    pending: 0,
    attention: 0,
    syncing: false,
    total: 0,
    completed: 0,
    storageError: false,
  }));

  useEffect(() => {
    const onOffline = () => setState((current) => ({ ...current, mode: "offline" }));
    const onOnline = () => setState((current) => ({ ...current, mode: "online" }));
    const onApiFailure = () => setState((current) => ({
      ...current,
      mode: navigator.onLine ? "unstable" : "offline",
    }));
    const onApiSuccess = () => setState((current) => ({ ...current, mode: navigator.onLine ? "online" : "offline" }));
    const onOutboxChange = (event: Event) => {
      const detail = (event as CustomEvent<{ byUser?: Record<string, { pending: number; attention: number }>; storageError?: boolean }>).detail;
      const counts = userId ? detail.byUser?.[userId] : undefined;
      setState((current) => ({ ...current, pending: counts?.pending ?? 0, attention: counts?.attention ?? 0, storageError: detail.storageError ?? false }));
    };
    const onSyncProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; total?: number; completed?: number }>).detail;
      setState((current) => ({
        ...current,
        syncing: detail.active ?? false,
        total: detail.total ?? 0,
        completed: detail.completed ?? 0,
      }));
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("fesflow:api-network-failure", onApiFailure);
    window.addEventListener("fesflow:api-network-success", onApiSuccess);
    window.addEventListener("fesflow:outbox-change", onOutboxChange);
    window.addEventListener("fesflow:sync-progress", onSyncProgress);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("fesflow:api-network-failure", onApiFailure);
      window.removeEventListener("fesflow:api-network-success", onApiSuccess);
      window.removeEventListener("fesflow:outbox-change", onOutboxChange);
      window.removeEventListener("fesflow:sync-progress", onSyncProgress);
    };
  }, [userId]);

  const value = useMemo(() => state, [state]);
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function ConnectionStatusBanner({ showQueue = true }: { showQueue?: boolean }) {
  const { mode, pending, attention, syncing, total, completed, storageError } = useContext(ConnectionContext);
  if (mode === "online" && (!showQueue || (!pending && !attention && !syncing && !storageError))) return null;

  const isOffline = mode === "offline";
  const isUnstable = mode === "unstable";
  const isAttention = showQueue && (attention > 0 || storageError);
  const Icon = isOffline ? WifiOff : isUnstable || isAttention ? AlertTriangle : CloudUpload;
  const style = isOffline || isAttention
    ? "bg-destructive text-destructive-foreground"
    : isUnstable
      ? "bg-warning text-foreground"
      : "bg-success text-success-foreground";
  const message = storageError && !isOffline
    ? "端末の送信待ち注文を読み込めません。注文内容を確認してください"
    : isOffline
    ? `オフライン中${showQueue && pending ? ` · 注文${pending}件は送信待ち` : ""}`
    : isUnstable
      ? "通信が不安定です。保存・取得に失敗した操作は画面に表示します"
      : isAttention
        ? `送信できない注文が${attention}件あります。注文履歴で確認してください`
        : syncing
          ? `注文を送信中 ${completed}/${total}`
          : `注文${pending}件を送信待ちに保存しています`;

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={`flex min-h-8 items-center justify-center gap-2 px-3 py-1 text-center font-mono text-[11px] font-bold ${style}`}>
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
