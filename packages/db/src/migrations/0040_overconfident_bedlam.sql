CREATE TABLE `visitor_notification` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_user_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`href` text DEFAULT '/visitor/notifications' NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_user_id`) REFERENCES `event_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_notification_dedupe_key_unique` ON `visitor_notification` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `visitor_notification_user_created_idx` ON `visitor_notification` (`event_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `visitor_notification_event_created_idx` ON `visitor_notification` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`event_id` text,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscription_owner_idx` ON `push_subscription` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `push_subscription_event_idx` ON `push_subscription` (`owner_type`,`event_id`);