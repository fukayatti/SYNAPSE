ALTER TABLE `orders` ADD `payment_status` text DEFAULT 'paid' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_at` integer;--> statement-breakpoint
CREATE INDEX `orders_circle_user_payment_idx` ON `orders` (`circle_id`,`user_id`,`payment_status`);