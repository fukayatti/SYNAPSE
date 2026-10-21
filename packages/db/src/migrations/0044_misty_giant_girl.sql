ALTER TABLE `contract_payment` ADD `voided_at` integer;--> statement-breakpoint
ALTER TABLE `contract_payment` ADD `voided_by` text;--> statement-breakpoint
ALTER TABLE `event_announcement` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `staff` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `circle_visit` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `announcement` ADD `deleted_at` integer;