import { useEffect, useState } from "react";
import { orderApi } from "@/lib/api";
import { publishRegisterDisplaySnapshot } from "@/features/orders/register-display-sync";
import { readRegisterDisplayConnection, REGISTER_DISPLAY_ACTIVE_KEY, type RegisterDisplayConnection } from "@/features/orders/register-display-connection";

function latestConnection(): RegisterDisplayConnection | null {
  return readRegisterDisplayConnection();
}

/** 2026-10-21: 共有カートの接続をページ寿命から切り離し、レジ外へ移動しても同じ画面を更新する。 */
export function RegisterDisplayConnectionProvider() {
  const [connection, setConnection] = useState(latestConnection);

  useEffect(() => {
    const refresh = () => setConnection(latestConnection());
    window.addEventListener("fesflow:register-display-updated", refresh);
    window.addEventListener("storage", refresh);
    refresh();
    return () => {
      window.removeEventListener("fesflow:register-display-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!connection) return;
    let revision = connection.revision;
    let cancelled = false;
    const send = () => {
      const latest = latestConnection();
      if (cancelled || !latest || latest.id !== connection.id) return;
      revision = Math.max(revision, latest.revision) + 1;
      const next = { ...latest, revision };
      try {
        window.sessionStorage.setItem(REGISTER_DISPLAY_ACTIVE_KEY, JSON.stringify(next));
        window.sessionStorage.setItem("fesflow-register-display:" + next.circleId, JSON.stringify(next));
      } catch {
        // 共有中の画面更新は BroadcastChannel で続ける。
      }
      publishRegisterDisplaySnapshot(next.id, next.snapshot, next.revision);
      if (next.localOnly) return;

      orderApi.updateRegisterDisplay(next.id, next.snapshot, next.revision)
        .then(() => {
          const current = latestConnection();
          if (!cancelled && current?.id === next.id && current.revision === next.revision) {
            window.dispatchEvent(new CustomEvent("fesflow:register-display-sync", { detail: { sessionId: next.id, ok: true } }));
          }
        })
        .catch(() => {
          const current = latestConnection();
          if (!cancelled && current?.id === next.id && current.revision === next.revision) {
            window.dispatchEvent(new CustomEvent("fesflow:register-display-sync", { detail: { sessionId: next.id, ok: false } }));
          }
        });
    };

    send();
    const timer = window.setInterval(send, connection.localOnly ? 4_000 : 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connection]);

  return null;
}
