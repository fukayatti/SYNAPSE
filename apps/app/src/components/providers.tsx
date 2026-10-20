import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";
import { UploadTray } from "./upload-tray";
import { useState } from "react";
import { handleApiErrorToast } from "@/lib/api-error";
import { ConnectionStatusProvider } from "@/components/ConnectionStatus";
import PwaLifecycle from "@/components/PwaLifecycle";
import { RegisterDisplayConnectionProvider } from "@/features/orders/RegisterDisplayConnectionProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  // 2026-07-06: 例外は必ずトーストで可視化する。
  // - クエリ失敗: 従来サイレントだったのでグローバルにトースト (id 固定で連投を抑制)。
  // - ミューテーション失敗: 独自 onError を持たないものだけグローバルにトースト
  //   (二重トースト防止)。
  // 2026-07-07 (Phase4): トースト一辺倒から ApiError.code による UX 分岐
  // (401→ログイン誘導 / 403→権限メッセージ / 429→再試行秒数 / VALIDATION→fields) に変更。
  // handleApiErrorToast (lib/api-error.ts) に集約し、ここでは呼ぶだけにする。
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // 2026-10-21: 圏外でも既存データを保ち、画面を無期限ローディングにせず通信失敗へ進める。
        // 更新操作は汎用キューへ積まず即時失敗させ、古い権限・在庫・状態を復帰後に再送しない。
        defaultOptions: {
          queries: {
            networkMode: "always",
            gcTime: 24 * 60 * 60 * 1000,
            retry: (failureCount) => typeof navigator === "undefined" || (navigator.onLine && failureCount < 1),
          },
          mutations: { networkMode: "always", retry: false },
        },
        queryCache: new QueryCache({
          onError: (error) => {
            handleApiErrorToast(error, { toastId: "query-error" });
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (!mutation.options.onError) {
              handleApiErrorToast(error);
            }
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionStatusProvider>
      {/* 2026-10-21: レジから移動してもお客さま画面への同期を続ける。 */}
      <RegisterDisplayConnectionProvider />
      <ThemeProvider>
        {children}
        <ReactQueryDevtools />
      </ThemeProvider>
      <Toaster />
      <PwaLifecycle />
      {/* 2026-10-05 Issue #97: モーダルを閉じても続くアップロードの進行表示 */}
      <UploadTray />
      </ConnectionStatusProvider>
    </QueryClientProvider>
  );
}
