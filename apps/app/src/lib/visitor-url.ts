/**
 * 来場者アプリ (apps/visitor) への クロスアプリ URL を組み立てる。
 *
 * 本番は単一ドメインのパス分割 (visitor=apex `/`, register=`/circle` 等) なので
 * 同一オリジンだが、ローカル開発では visitor が別ポート (:3001) で動くため
 * VITE_VISITOR_URL を基点にする。SPA が異なるので遷移は react-router ではなく
 * フルページ遷移 (<a href> / window.location) で行うこと。
 */
export const VISITOR_BASE_URL =
	(import.meta.env.VITE_VISITOR_URL as string) || "http://localhost:3001";

export function visitorUrl(path: string): string {
	return `${VISITOR_BASE_URL}${path}`;
}
