-- メンバーシップテーブル
CREATE TABLE IF NOT EXISTS `membership` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`user_name` text NOT NULL,
	`circle_id` text,
	`event_id` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`pin` text,
	`is_active` integer DEFAULT true NOT NULL,
	`invited_at` integer,
	`accepted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);

-- 招待トークンテーブル
CREATE TABLE IF NOT EXISTS `invite_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`circle_id` text,
	`event_id` text,
	`role` text NOT NULL,
	`max_uses` integer DEFAULT 1,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS `membership_userEmail_idx` ON `membership` (`user_email`);
CREATE INDEX IF NOT EXISTS `membership_circleId_idx` ON `membership` (`circle_id`);
CREATE INDEX IF NOT EXISTS `membership_eventId_idx` ON `membership` (`event_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `membership_user_circle_unique` ON `membership` (`user_email`,`circle_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `membership_user_event_unique` ON `membership` (`user_email`,`event_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `invite_token_token_unique` ON `invite_token` (`token`);
CREATE INDEX IF NOT EXISTS `invite_token_token_idx` ON `invite_token` (`token`);
CREATE INDEX IF NOT EXISTS `invite_token_circleId_idx` ON `invite_token` (`circle_id`);
CREATE INDEX IF NOT EXISTS `invite_token_eventId_idx` ON `invite_token` (`event_id`);
