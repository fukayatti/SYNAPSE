-- 2026-10-22: 旧注文には決済状態がないため、店頭支払いのモバイル注文を未会計として移行する。
-- 過去のモバイル注文に保存された支払方法は選択値で、実際の受領記録ではないため消去する。
UPDATE orders
SET payment_status = 'unpaid', payment_method = NULL, paid_at = NULL
WHERE source = 'mobile';
