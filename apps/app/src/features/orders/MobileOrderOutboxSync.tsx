import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVisitor } from "@/hooks/useVisitor";
import { publishOutboxState, syncMobileOrderOutbox } from "./mobile-order-outbox";

// 2026-10-21: 来場者の注文だけを本人のセッションで再送し、完了後に履歴を更新する。
export function MobileOrderOutboxSync() {
  const { userId } = useVisitor();
  const queryClient = useQueryClient();

  useEffect(() => {
    void publishOutboxState();
    if (!userId) return;

    const sync = () => {
      void syncMobileOrderOutbox(userId).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["myOrders", userId] });
      }).catch(() => {
        // 2026-10-21: IndexedDB障害などを未処理Promiseにせず、共通ヘッダーの状態表示に任せる。
      });
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("fesflow:mobile-order-retry", sync);
    const retryTimer = window.setInterval(sync, 15_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("fesflow:mobile-order-retry", sync);
      window.clearInterval(retryTimer);
    };
  }, [userId, queryClient]);

  return null;
}
