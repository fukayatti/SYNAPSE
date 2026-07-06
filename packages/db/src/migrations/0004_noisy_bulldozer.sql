CREATE TABLE `auth_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`scope` text NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`first_failed_at` integer NOT NULL,
	`last_failed_at` integer NOT NULL,
	`locked_until` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_attempt_key_unique` ON `auth_attempt` (`key`);--> statement-breakpoint
CREATE INDEX `auth_attempt_locked_until_idx` ON `auth_attempt` (`locked_until`);