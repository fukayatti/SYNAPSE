DROP INDEX `stamp_rally_redemption_event_user_unique`;--> statement-breakpoint
ALTER TABLE `stamp_rally_redemption` ADD `reward_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `stamp_rally_redemption` ADD `reward_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `stamp_rally_redemption` ADD `quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `stamp_rally_redemption_event_user_idx` ON `stamp_rally_redemption` (`event_id`,`event_user_id`);--> statement-breakpoint
CREATE INDEX `stamp_rally_redemption_event_reward_idx` ON `stamp_rally_redemption` (`event_id`,`reward_id`);