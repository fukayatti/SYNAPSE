CREATE TABLE `event_user_sequence` (
	`event_id` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `event` ADD `allow_self_issue` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `source` text DEFAULT 'pos' NOT NULL;