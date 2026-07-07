/**
 * 認証・認可 Hono middleware (Phase 3a: better-auth 一本化)
 *
 * 各ルートに散在していた「セッション取得→なければ401」「super_admin判定→なければ403」の
 * 定型パターンを middleware に集約する。circleId/eventId がルートごとに動的で
 * hasPermission の呼び出し方が一様でないものは、無理に middleware 化せず既存どおり
 * ルートハンドラ内で hasPermission を直接呼ぶ (過剰な抽象化で壊さないため)。
 *
 * c.set("session", ...) で後段のハンドラにセッションを渡す。型は Hono の
 * Variables 拡張 (AppVariables, ../types.ts) で表現する。
 *
 * 2026-07-08 (Phase5): auth はモジュール Proxy シングルトンではなく、
 * index.ts の middleware が c.set("auth", ...) した実体を c.get("auth") で
 * 明示的に受け取る (ALS+Proxy 撤去)。Session 型も ../types.ts に集約した。
 */
import type { Context, Next } from "hono";
import { getAdminSession } from "../utils/auth";
import { apiError } from "../http-error";
import type { AppEnv, AppVariables, Session } from "../types";

// 後方互換: 従来 middleware/auth.ts からの re-export を参照していた箇所向けに残す。
export type { Session };
/** requireAuth/requireSuperAdmin を使うルートで共通利用する Variables 拡張。 */
export type AuthVariables = AppVariables;

/**
 * better-auth セッション必須 middleware。
 * セッションが無ければ 401 を返し、後段には進めない。
 * 成功時は c.set("session", session) で後段ハンドラに渡す。
 */
export async function requireAuth(
  c: Context<AppEnv>,
  next: Next,
) {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session || !session.user) {
    apiError("UNAUTHORIZED", "認証されていません");
  }
  c.set("session", session);
  await next();
}

/**
 * システム管理者 (super_admin) 必須 middleware。
 * getAdminSession 相当 (INITIAL_SUPER_ADMIN_EMAIL への自動昇格を含む) の判定を行い、
 * 該当しなければ 403 を返す。system.ts の adminRoutes.use で行っていたガードを移設。
 */
export async function requireSuperAdmin(
  c: Context<AppEnv>,
  next: Next,
) {
  const session = await getAdminSession(c);
  if (!session) {
    apiError("FORBIDDEN", "システム管理者権限が必要です");
  }
  c.set("session", session);
  await next();
}
