CREATE TABLE `stamp_rally_redemption` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_user_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_user_id`) REFERENCES `event_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stamp_rally_redemption_event_created_idx` ON `stamp_rally_redemption` (`event_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `stamp_rally_redemption_event_user_unique` ON `stamp_rally_redemption` (`event_id`,`event_user_id`);--> statement-breakpoint
ALTER TABLE `circle` ADD `deleted_with_event_id` text;--> statement-breakpoint
ALTER TABLE `event` ADD `official_website_url` text;--> statement-breakpoint
ALTER TABLE `event` ADD `store_areas` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `menu` ADD `allergens` text;--> statement-breakpoint
ALTER TABLE `topping` ADD `allergens` text;--> statement-breakpoint
ALTER TABLE `event_user` ADD `allergies` text;--> statement-breakpoint
ALTER TABLE `wristband` ADD `nickname` text;--> statement-breakpoint
ALTER TABLE `wristband` ADD `birthday_month_day` text;--> statement-breakpoint
ALTER TABLE `wristband` ADD `age` integer;--> statement-breakpoint
ALTER TABLE `wristband` ADD `onboarded_at` integer;