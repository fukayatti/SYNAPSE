-- 2026-10-16: カート全体の割合引きクーポンを保持する列を追加。
ALTER TABLE `coupon` ADD `discount_percent` integer;
