export type RegisterDiscountKind = "percentage" | "amount";

// 2026-10-17: 管理画面のプレビューと注文確定で同じ切り捨て・上限規則を共有する。
export function calculateDiscount(subtotal: number, kind: RegisterDiscountKind, value: number): number {
  if (subtotal <= 0 || value <= 0) return 0;
  if (kind === "percentage") return Math.min(subtotal, Math.floor((subtotal * value) / 100));
  return Math.min(subtotal, value);
}
