// system.ts: プラットフォーム全体の運用系テーブル。
// システム設定・お知らせ・ユーザー通知・認証レート制限を扱う。
// event/circle 等への外部キーを持たない、独立したテーブル群。
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// 通知テーブル (2026-07-04 SaaS通知対応)
export const notification = sqliteTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(), // 受信者のメールアドレス
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type").notNull(), // "invite" | "info" など
    status: text("status").default("unread").notNull(), // "unread" | "read"
    circleName: text("circle_name"),
    eventName: text("event_name"),
    token: text("token"), // 招待の場合のトークン値
    role: text("role"), // 招待の場合の付与ロール
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("notification_user_idx").on(table.userEmail),
    index("notification_status_idx").on(table.status),
  ]
);

// ==========================================
// 認証レート制限 / アカウントロックアウト (2026-07-05 追加, 監査 High: H4)
//  - 目的: PIN 総当たり (POST /api/memberships/authenticate-pin) と
//    サークルパスワード総当たり (POST /api/festivals/login) の「オンライン総当たり」を抑止する。
//  - 方針: bcrypt のコストは上げない (bcryptjs は純JSで低速。Workers の CPU 制約下で
//    コストを上げると認証1回で CPU 予算を超え得るため)。代わりに「失敗回数の計数 + 一定回数で
//    ロックアウト」で対処する。既定は 5 回失敗 / 15 分ロック (helper 側の定数)。
//  - キー設計: 1 バケット = 1 行。key は scope と識別子を結合した文字列
//    (例 "pin:ip:1.2.3.4" / "pin:target:<circleId>:<email>" / "circle_login:ip:...")。
//    IP バケットと対象 (circle/event) バケットを独立に持ち、どちらかがロックしたら拒否する
//    (単一 IP からの多対象攻撃・多 IP からの単一対象攻撃の双方を捕捉するため)。
//  - 注意: D1(SQLite) の read-modify-write は厳密なアトミック性を持たないため、極端な高並列時に
//    計数が数回甘くなり得るが、ロックアウトという緩和目的では許容範囲。行は (ip, 対象) の
//    組の数に比例して有限で、文化祭は短命なため定期削除は設けていない (必要なら scope で一括削除可)。
// システム全体設定 (2026-07-06)。key-value。super_admin のみ更新可、公開値のみ配信。
// 例: key="maintenance" value=JSON{enabled,message} / key="announcement" value=JSON{enabled,message,level}
export const systemSetting = sqliteTable("system_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

// お知らせ (2026-07-06)。super_admin が CMS 的に複数管理。公開分を全アプリの
// [お知らせ・通知] やバナーに配信する。maintenance は system_setting 側で管理。
export const announcement = sqliteTable(
  "announcement",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    // 表示レベル: info | warning | critical
    level: text("level").notNull().default("info"),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("announcement_published_idx").on(table.published)],
);

export const authAttempt = sqliteTable(
  "auth_attempt",
  {
    id: text("id").primaryKey(),
    // レート制限バケットキー (scope + 識別子を結合)。1 バケット 1 行。
    key: text("key").notNull(),
    // 分類ラベル (可観測性 / 一括クリーンアップ用): "pin" | "circle_login" など
    scope: text("scope").notNull(),
    // 現在の計数ウィンドウ内での失敗回数
    failedCount: integer("failed_count").notNull().default(0),
    // 計数ウィンドウの起点。ここから windowMs 経過 (かつ非ロック) で失敗回数をリセットする。
    firstFailedAt: integer("first_failed_at", { mode: "timestamp_ms" }).notNull(),
    lastFailedAt: integer("last_failed_at", { mode: "timestamp_ms" }).notNull(),
    // ロックアウト解除時刻 (null=未ロック)。この時刻まで当該バケットへの試行を全拒否する。
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_attempt_key_unique").on(table.key),
    index("auth_attempt_locked_until_idx").on(table.lockedUntil),
  ]
);
