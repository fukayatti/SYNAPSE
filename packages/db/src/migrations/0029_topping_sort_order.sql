-- 2026-10-16: トッピング管理画面で調整した一覧順を保存するための非破壊的な列追加。
ALTER TABLE `topping` ADD `sort_order` integer DEFAULT 0 NOT NULL;
