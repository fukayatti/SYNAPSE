CREATE TABLE `circle_visit` (
	`id` text PRIMARY KEY NOT NULL,
	`event_user_id` text NOT NULL,
	`circle_id` text NOT NULL,
	`staff_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_user_id`) REFERENCES `event_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `circle_visit_user_idx` ON `circle_visit` (`event_user_id`);--> statement-breakpoint
CREATE INDEX `circle_visit_circle_idx` ON `circle_visit` (`circle_id`);--> statement-breakpoint
CREATE INDEX `circle_visit_user_circle_idx` ON `circle_visit` (`event_user_id`,`circle_id`);--> statement-breakpoint
CREATE TABLE `lottery` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`draw_at` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lottery_event_idx` ON `lottery` (`event_id`);--> statement-breakpoint
CREATE TABLE `lottery_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`lottery_id` text NOT NULL,
	`event_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_user_id`) REFERENCES `event_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lottery_entry_lottery_idx` ON `lottery_entry` (`lottery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lottery_entry_lottery_user_unique` ON `lottery_entry` (`lottery_id`,`event_user_id`);--> statement-breakpoint
CREATE TABLE `lottery_prize` (
	`id` text PRIMARY KEY NOT NULL,
	`lottery_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lottery_prize_lottery_idx` ON `lottery_prize` (`lottery_id`);--> statement-breakpoint
CREATE TABLE `lottery_winner` (
	`id` text PRIMARY KEY NOT NULL,
	`lottery_id` text NOT NULL,
	`prize_id` text NOT NULL,
	`event_user_id` text NOT NULL,
	`claimed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`lottery_id`) REFERENCES `lottery`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prize_id`) REFERENCES `lottery_prize`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_user_id`) REFERENCES `event_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lottery_winner_lottery_idx` ON `lottery_winner` (`lottery_id`);--> statement-breakpoint
CREATE INDEX `lottery_winner_user_idx` ON `lottery_winner` (`event_user_id`);--> statement-breakpoint
CREATE TABLE `numbered_ticket` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text NOT NULL,
	`event_user_id` text NOT NULL,
	`slot_start` integer,
	`slot_label` text,
	`status` text DEFAULT 'issued' NOT NULL,
	`issued_by_staff_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_user_id`) REFERENCES `event_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `numbered_ticket_circle_idx` ON `numbered_ticket` (`circle_id`);--> statement-breakpoint
CREATE INDEX `numbered_ticket_user_idx` ON `numbered_ticket` (`event_user_id`);--> statement-breakpoint
CREATE INDEX `numbered_ticket_status_idx` ON `numbered_ticket` (`status`);--> statement-breakpoint
CREATE TABLE `review` (
	`id` text PRIMARY KEY NOT NULL,
	`event_user_id` text NOT NULL,
	`circle_id` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_user_id`) REFERENCES `event_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_circle_idx` ON `review` (`circle_id`);--> statement-breakpoint
CREATE INDEX `review_user_idx` ON `review` (`event_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_user_circle_unique` ON `review` (`event_user_id`,`circle_id`);--> statement-breakpoint
ALTER TABLE `circle` ADD `stamp_secret` text;--> statement-breakpoint
ALTER TABLE `event_user` ADD `nickname` text;--> statement-breakpoint
ALTER TABLE `event_user` ADD `birthday` text;--> statement-breakpoint
ALTER TABLE `event_user` ADD `onboarded_at` integer;