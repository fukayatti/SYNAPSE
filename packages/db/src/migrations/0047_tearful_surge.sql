CREATE TABLE `order_refund` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`amount` integer NOT NULL,
	`original_payment_method` text,
	`refunded_by` text,
	`refunded_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_refund_order_unique` ON `order_refund` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_refund_refundedAt_idx` ON `order_refund` (`refunded_at`);