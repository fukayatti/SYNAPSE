CREATE TABLE `register_display_session` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`snapshot` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `register_display_session_circle_idx` ON `register_display_session` (`circle_id`);--> statement-breakpoint
CREATE INDEX `register_display_session_expires_idx` ON `register_display_session` (`expires_at`);