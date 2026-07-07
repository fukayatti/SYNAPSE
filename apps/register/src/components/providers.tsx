import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { toast } from "sonner";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";
import { useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  // 2026-07-06: 例外は必ずトーストで可視化する。
  // - クエリ失敗: 従来サイレントだったのでグローバルにトースト (id 固定で連投を抑制)。
  // - ミューテーション失敗: 独自 onError を持たないものだけグローバルにトースト
  //   (二重トースト防止)。
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            toast.error(
              error instanceof Error ? error.message : "データの取得に失敗しました",
              { id: "query-error" },
            );
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (!mutation.options.onError) {
              toast.error(
                error instanceof Error ? error.message : "操作に失敗しました",
              );
            }
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children}
        <ReactQueryDevtools />
      </ThemeProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
