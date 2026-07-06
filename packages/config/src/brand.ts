/**
 * プロダクトのブランド定義を一箇所に集約する。
 *
 * 意図 (2026-07-04):
 * - プロダクト名を「気軽に変えられる変数」として管理するため、
 *   表示名・スラッグ・npmスコープを散在させずここへ集約する。
 * - UI (register / visitor / stream) とバックエンド (api) の双方が
 *   この定数を参照することで、名称変更を1ファイルの編集で完結させる。
 * - 環境変数 PRODUCT_NAME があればそれを優先し、ビルド時にも差し替え可能にする。
 */

/** npm ワークスペースのスコープ。パッケージ名 `@fesflow/*` と一致させる。 */
export const PRODUCT_SCOPE = "@fesflow" as const;

/** 内部識別子 (スラッグ)。ドメイン・DB名・R2バケット接頭辞などに使う。 */
export const PRODUCT_SLUG = "fesflow" as const;

/**
 * ユーザー向け表示名。
 * ビルド/実行環境の PRODUCT_NAME で上書き可能。
 * (Worker では import.meta.env / c.env 経由で差し替えることを想定)
 */
export const PRODUCT_NAME: string =
  (typeof process !== "undefined" && process.env?.PRODUCT_NAME) || "FesFlow";

/** 短縮表示名 (PWA short_name 等)。既定は表示名と同じ。 */
export const PRODUCT_SHORT_NAME: string = PRODUCT_NAME;

/** アプリ種別ごとの表示サフィックス。各フロントの title に利用する。 */
export const APP_LABELS = {
  register: "模擬店",
  visitor: "来場者",
  stream: "配信",
} as const;

export type AppKey = keyof typeof APP_LABELS;

/** `FesFlow 模擬店` のようなアプリ別タイトルを組み立てる。 */
export function appTitle(app: AppKey): string {
  return `${PRODUCT_NAME} ${APP_LABELS[app]}`;
}

export const brand = {
  name: PRODUCT_NAME,
  shortName: PRODUCT_SHORT_NAME,
  slug: PRODUCT_SLUG,
  scope: PRODUCT_SCOPE,
} as const;
