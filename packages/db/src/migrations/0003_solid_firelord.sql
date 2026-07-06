ALTER TABLE `circle` ADD `settings` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `circle` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `event` ADD `deleted_at` integer;