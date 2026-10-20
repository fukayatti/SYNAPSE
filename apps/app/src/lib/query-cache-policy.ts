// 2026-10-21: 画面遷移で取得済みデータをすぐ再表示しつつ、運用状態や個人履歴を長く残さない。
// QueryClient はメモリー内だけで保持し、注文・在庫・レビューは staleTime 0 で再訪時に再確認する。
// カタログは在庫/売切情報を含むため短い fresh window のみ許可し、保存操作では既存どおり invalidate する。
export const queryCachePolicy = {
  catalog: {
    staleTime: 5_000,
    gcTime: 24 * 60 * 60 * 1_000,
  },
  live: {
    staleTime: 0,
    gcTime: 5 * 60 * 1_000,
  },
  reviews: {
    staleTime: 0,
    gcTime: 5 * 60 * 1_000,
  },
  credentials: {
    staleTime: 0,
    // 2026-10-21: 招待 URL に使えるトークンは、画面間の短い移動だけ再利用して早めに破棄する。
    gcTime: 60 * 1_000,
  },
} as const;
