/** アクティブスペースをブラウザータブごとに保存するための小さなストレージ境界。 */
export const AUTH_CONTEXT_KEY = "circleAuth";

export function readAuthContext<T>(): T | null {
  if (typeof window === "undefined") return null;

  const stored = window.sessionStorage.getItem(AUTH_CONTEXT_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as T;
  } catch {
    return null;
  }
}

export function writeAuthContext<T extends { circleId?: string | null; circleName?: string | null }>(context: T) {
  if (typeof window === "undefined") return;
  // 2026-10-20: 旧localStorage形式は読まなくなったため、再ログイン後に共有値を残さない。
  window.localStorage.removeItem(AUTH_CONTEXT_KEY);
  window.localStorage.removeItem("circleId");
  window.localStorage.removeItem("circleName");
  window.sessionStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify(context));
}

export function clearAuthContext() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(AUTH_CONTEXT_KEY);
  window.localStorage.removeItem(AUTH_CONTEXT_KEY);
  window.localStorage.removeItem("circleId");
  window.localStorage.removeItem("circleName");
}
