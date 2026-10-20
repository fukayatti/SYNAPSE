// visitor.ts: 来場者(eventUser)まわりのドメイン。
// リストバンド紐付け、サークル体験ログ、スタンプ/景品交換、整理券、レビューを扱う。
// 事前オーダー (preOrder) は注文ドメインとの結合が強いため order.ts 側に置く。
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { event, circle } from "./core";
import { ulid } from "ulidx";

// 2026-10-17: イベント内の表示番号を同時発行でも重複させないため、最後に確保した番号を保存する。
export const eventUserSequence = sqliteTable("event_user_sequence", {
  eventId: text("event_id")
    .primaryKey()
    .references(() => event.id, { onDelete: "cascade" }),
  value: integer("value").notNull(),
});

// イベント来場ユーザーテーブル
export const eventUser = sqliteTable(
  "event_user",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    displayId: integer("display_id").notNull(), // 表示用呼出ID (1, 2, 3...)
    status: text("status").notNull().default("available"), // available / banned
    // 2026-10-20: 入場時は年代区分とニックネームのみを保持し、誕生日や実年齢は収集しない。
    nickname: text("nickname"),
    favoriteDate: text("favorite_date"), // YYYY-MM-DD (旧 birthday)
    ageGroup: text("age_group"),
    // 2026-10-15 (#124): 家族全員の申告をまとめたJSON配列。null=未登録、[]=該当なし。
    allergies: text("allergies"),
    onboardedAt: integer("onboarded_at", { mode: "timestamp_ms" }), // 初回入力完了時刻
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("event_user_eventId_idx").on(table.eventId),
    uniqueIndex("event_user_event_display_unique").on(
      table.eventId,
      table.displayId
    ),
  ]
);

// 2026-10-21: 来場者向け通知を端末のPush購読と独立して保存し、圏外中も復帰後に履歴を確認できるようにする。
export const visitorNotification = sqliteTable(
  "visitor_notification",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    eventUserId: text("event_user_id")
      .notNull()
      .references(() => eventUser.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull().unique(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    href: text("href").notNull().default("/visitor/notifications"),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("visitor_notification_user_created_idx").on(table.eventUserId, table.createdAt),
    index("visitor_notification_event_created_idx").on(table.eventId, table.createdAt),
  ],
);

// リストバンド管理テーブル (ユーザーとリストバンドの1:N紐付け)
export const wristband = sqliteTable(
  "wristband",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()), // リストバンドの物理コード / QR値
    userId: text("user_id")
      .notNull()
      .references(() => eventUser.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // active / lost / replaced / revoked
    // 2026-10-20: 家族の受付プロフィールも年代区分とニックネームだけをバンド単位で保持する。
    nickname: text("nickname"),
    ageGroup: text("age_group"),
    onboardedAt: integer("onboarded_at", { mode: "timestamp_ms" }),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    deactivatedAt: integer("deactivated_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("wristband_userId_idx").on(table.userId),
    index("wristband_status_idx").on(table.status),
  ]
);

// 2026-10-06: 印刷後に再取得・中断後に再開できるよう、発行単位と元URLをD1へ保存する。
// URLはチャンク保存にし、D1の1行2MB上限と大量生成時の巨大な単一行を避ける。
export const wristbandBatch = sqliteTable(
  "wristband_batch",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // generated / csv
    prefix: text("prefix"),
    suffixLength: integer("suffix_length"),
    totalCount: integer("total_count").notNull(),
    processedCount: integer("processed_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    conflictCount: integer("conflict_count").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending / processing / completed / conflict
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("wristband_batch_event_created_idx").on(table.eventId, table.createdAt)]
);

export const wristbandBatchChunk = sqliteTable(
  "wristband_batch_chunk",
  {
    batchId: text("batch_id")
      .notNull()
      .references(() => wristbandBatch.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    urlsJson: text("urls_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.batchId, table.chunkIndex] })]
);

// ==========================================
// 来場者マイページ機能 (2026-07-04 追加)
//  - スタンプは既存 user_stamp、事前オーダーは既存 pre_order を利用。
//  - ここでは 体験ログ / 整理券 / レビュー / 抽選 を追加する。
//    (抽選テーブル本体は lottery.ts に分離済み)
// ==========================================

// 体験ログ: レジ/受付でリストバンドをスキャンした記録。
// レビュー投稿の可否・抽選口数の根拠になる (「体験したものだけ」)。
export const circleVisit = sqliteTable(
  "circle_visit",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()),
    eventUserId: text("event_user_id")
      .notNull()
      .references(() => eventUser.id, { onDelete: "cascade" }),
    circleId: text("circle_id")
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    staffId: text("staff_id"), // 対応スタッフ (任意)
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("circle_visit_user_idx").on(table.eventUserId),
    index("circle_visit_circle_idx").on(table.circleId),
    index("circle_visit_user_circle_idx").on(table.eventUserId, table.circleId),
  ]
);

// 整理券: サークルの端末で来場者に時間指定で発行する。
export const numberedTicket = sqliteTable(
  "numbered_ticket",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()),
    circleId: text("circle_id")
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    eventUserId: text("event_user_id")
      .notNull()
      .references(() => eventUser.id, { onDelete: "cascade" }),
    slotStart: integer("slot_start", { mode: "timestamp_ms" }), // 案内時間帯の開始
    slotLabel: text("slot_label"), // 表示用ラベル (例 "13:00-13:30")
    status: text("status").notNull().default("issued"), // issued / used / expired / cancelled
    issuedByStaffId: text("issued_by_staff_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("numbered_ticket_circle_idx").on(table.circleId),
    index("numbered_ticket_user_idx").on(table.eventUserId),
    index("numbered_ticket_status_idx").on(table.status),
  ]
);

// レビュー: 体験したサークルへの任意投稿。1ユーザー1サークル1件。
export const review = sqliteTable(
  "review",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()),
    eventUserId: text("event_user_id")
      .notNull()
      .references(() => eventUser.id, { onDelete: "cascade" }),
    circleId: text("circle_id")
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(), // 1-5
    comment: text("comment"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("review_circle_idx").on(table.circleId),
    index("review_user_idx").on(table.eventUserId),
    uniqueIndex("review_user_circle_unique").on(
      table.eventUserId,
      table.circleId
    ),
  ]
);

// スタンプテーブル
export const userStamp = sqliteTable(
  "user_stamp",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()),
    userId: text("user_id").notNull(), // ゲストの匿名ID
    circleId: text("circle_id")
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("user_stamp_userId_idx").on(table.userId),
    index("user_stamp_circleId_idx").on(table.circleId),
    uniqueIndex("user_stamp_user_circle_unique").on(
      table.userId,
      table.circleId
    ),
  ]
);

// 2026-10-16: 1アカウントが家族人数分の景品を受け取れるよう、交換ごとの数量と
// 景品名スナップショットを記録する。重複制約を外し、来場者・景品単位で複数回記録できる。
export const stampRallyRedemption = sqliteTable(
  "stamp_rally_redemption",
  {
    id: text("id").primaryKey().$defaultFn(() => ulid()),
    eventId: text("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    eventUserId: text("event_user_id")
      .notNull()
      .references(() => eventUser.id, { onDelete: "cascade" }),
    staffId: text("staff_id").notNull(),
    rewardId: text("reward_id").notNull().default("default"),
    rewardName: text("reward_name").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("stamp_rally_redemption_event_created_idx").on(table.eventId, table.createdAt),
    index("stamp_rally_redemption_event_user_idx").on(table.eventId, table.eventUserId),
    index("stamp_rally_redemption_event_reward_idx").on(table.eventId, table.rewardId),
  ]
);
