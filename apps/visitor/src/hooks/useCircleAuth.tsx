/**
 * useCircleAuth 互換シム (2026-07-04)。
 *
 * 来場者アプリにはサークル/イベントの権限ログインは存在しない。移植した MyPage が
 * `useAuth()` を参照するため、常に「未ログイン」を返す最小シムを提供し、MyPage は
 * 来場者セッション (useGuestUser) 側の ID にフォールバックする。
 */
export function useAuth() {
  return {
    userId: null as string | null,
    isAuthenticated: false,
    isLoading: false,
  };
}
