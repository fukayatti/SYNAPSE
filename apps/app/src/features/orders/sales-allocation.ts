import type { OrderWithItems } from "@/lib/api";

/**
 * 2026-10-22: 商品別の売上内訳も会計済み注文総額に一致させるため、
 * トッピングを含む商品行の金額比で割引後の注文合計を円単位で配分する。
 */
export function allocateOrderRevenueByItem(
  order: Pick<OrderWithItems, "totalPrice" | "items">,
): number[] {
  const totalPrice = Number.isFinite(order.totalPrice)
    ? Math.max(0, Math.trunc(order.totalPrice))
    : 0;
  const weights = order.items.map((item) => {
    const quantity = Number.isFinite(item.quantity)
      ? Math.max(0, Math.trunc(item.quantity))
      : 0;
    const menuPrice = Number.isFinite(item.menuPrice)
      ? Math.max(0, Math.trunc(item.menuPrice))
      : 0;
    const toppingPrice = (item.toppings ?? []).reduce((sum, topping) => {
      const price = Number.isFinite(topping.price)
        ? Math.max(0, Math.trunc(topping.price))
        : 0;
      return sum + price;
    }, 0);
    return (menuPrice + toppingPrice) * quantity;
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  // 価格スナップショットが全て0の古い/不整合データは商品へ根拠なく配分しない。
  if (weightTotal === 0 || totalPrice === 0) return weights.map(() => 0);

  const allocations = weights.map((weight) => Math.floor((totalPrice * weight) / weightTotal));
  let remainder = totalPrice - allocations.reduce((sum, amount) => sum + amount, 0);
  const remainderOrder = weights
    .map((weight, index) => ({
      index,
      fraction: ((totalPrice * weight) / weightTotal) % 1,
    }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  // 最大剰余法で端数の円を配り、商品別合計とレジ会計額を必ず一致させる。
  for (let index = 0; remainder > 0; index++, remainder--) {
    const recipient = remainderOrder[index % remainderOrder.length];
    if (recipient) allocations[recipient.index] = (allocations[recipient.index] ?? 0) + 1;
  }

  return allocations;
}
