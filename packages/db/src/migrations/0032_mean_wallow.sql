CREATE TABLE `order_coupon` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`coupon_id` text NOT NULL,
	`discount_applied` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupon`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_coupon_order_unique` ON `order_coupon` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_coupon_coupon_idx` ON `order_coupon` (`coupon_id`);--> statement-breakpoint
ALTER TABLE `coupon` ADD `register_only` integer DEFAULT false NOT NULL;