CREATE TABLE `invite_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`circle_id` text,
	`event_id` text,
	`role` text NOT NULL,
	`max_uses` integer DEFAULT 1,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token_token_unique` ON `invite_token` (`token`);--> statement-breakpoint
CREATE INDEX `invite_token_token_idx` ON `invite_token` (`token`);--> statement-breakpoint
CREATE INDEX `invite_token_circleId_idx` ON `invite_token` (`circle_id`);--> statement-breakpoint
CREATE INDEX `invite_token_eventId_idx` ON `invite_token` (`event_id`);--> statement-breakpoint
CREATE TABLE `membership` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`user_name` text NOT NULL,
	`circle_id` text,
	`event_id` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`pin` text,
	`is_active` integer DEFAULT true NOT NULL,
	`invited_at` integer,
	`accepted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `membership_userEmail_idx` ON `membership` (`user_email`);--> statement-breakpoint
CREATE INDEX `membership_circleId_idx` ON `membership` (`circle_id`);--> statement-breakpoint
CREATE INDEX `membership_eventId_idx` ON `membership` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user_circle_unique` ON `membership` (`user_email`,`circle_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user_event_unique` ON `membership` (`user_email`,`event_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text NOT NULL,
	`order_number` text NOT NULL,
	`people_count` integer NOT NULL,
	`total_price` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`estimated_time` integer,
	`cashier_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `order_circleId_idx` ON `orders` (`circle_id`);--> statement-breakpoint
CREATE INDEX `order_orderNumber_idx` ON `orders` (`order_number`);--> statement-breakpoint
DROP TABLE `order`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_order_item` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`menu_id` text NOT NULL,
	`menu_name` text NOT NULL,
	`menu_price` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_id`) REFERENCES `menu`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_order_item`("id", "order_id", "menu_id", "menu_name", "menu_price", "quantity", "created_at") SELECT "id", "order_id", "menu_id", "menu_name", "menu_price", "quantity", "created_at" FROM `order_item`;--> statement-breakpoint
DROP TABLE `order_item`;--> statement-breakpoint
ALTER TABLE `__new_order_item` RENAME TO `order_item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `order_item_orderId_idx` ON `order_item` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_item_menuId_idx` ON `order_item` (`menu_id`);