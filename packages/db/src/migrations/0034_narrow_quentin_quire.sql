CREATE TABLE `discount` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "discount_kind_valid" CHECK("discount"."kind" IN ('percentage', 'amount')),
	CONSTRAINT "discount_value_valid" CHECK(("discount"."kind" = 'percentage' AND "discount"."value" BETWEEN 1 AND 100) OR ("discount"."kind" = 'amount' AND "discount"."value" > 0))
);
--> statement-breakpoint
CREATE INDEX `discount_circle_status_idx` ON `discount` (`circle_id`,`status`);--> statement-breakpoint
CREATE TABLE `order_discount` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`discount_id` text NOT NULL,
	`discount_applied` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`discount_id`) REFERENCES `discount`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_discount_order_unique` ON `order_discount` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_discount_discount_idx` ON `order_discount` (`discount_id`);