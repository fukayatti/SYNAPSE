ALTER TABLE `event_user` ADD `age_group` text;--> statement-breakpoint
ALTER TABLE `event_user` DROP COLUMN `birthday_month_day`;--> statement-breakpoint
ALTER TABLE `event_user` DROP COLUMN `age`;--> statement-breakpoint
ALTER TABLE `wristband` ADD `age_group` text;--> statement-breakpoint
ALTER TABLE `wristband` DROP COLUMN `birthday_month_day`;--> statement-breakpoint
ALTER TABLE `wristband` DROP COLUMN `age`;