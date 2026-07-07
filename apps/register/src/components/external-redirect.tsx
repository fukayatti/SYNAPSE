import { useEffect } from "react";

/**
 * 別オリジンのアプリ (来場者アプリ等) へリダイレクトするための小コンポーネント。
 * 来場者機能は apps/visitor に分離したため、register 側の旧 /visitor パスや
 * /menu・/my-order へのアクセスを来場者アプリへ転送する (2026-07-04 アプリ分離)。
 */
export default function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    // 2026-07-06: 現在の URL のクエリ文字列を引き継ぐ (?circleId 等が転送で落ちないように)。
    // 遷移先が既にクエリを持つ場合はそのまま尊重する。
    const search = typeof window !== "undefined" ? window.location.search : "";
    const dest = to.includes("?") || !search ? to : `${to}${search}`;
    window.location.replace(dest);
  }, [to]);
  return null;
}

/** 来場者アプリのベースURL。未設定時はローカル dev の :3001。 */
export const VISITOR_BASE_URL =
  (import.meta.env.VITE_VISITOR_URL as string) || "http://localhost:3001";
