import { describe, expect, it } from "bun:test";
import type { OrderItem } from "../src/lib/api";
import { allocateOrderRevenueByItem } from "../src/features/orders/sales-allocation";

const item = (input: Partial<OrderItem> & Pick<OrderItem, "id" | "menuName" | "menuPrice">): OrderItem => ({
  orderId: "order-1",
  menuId: input.id,
  quantity: 1,
  ...input,
});

describe("allocateOrderRevenueByItem", () => {
  it("includes topping prices and apportions the discounted paid total exactly", () => {
    const items = [
      { ...item({ id: "noodle", menuName: "焼きそば", menuPrice: 500, quantity: 2 }), toppings: [{ id: "t1", orderItemId: "noodle", toppingId: "egg", toppingName: "目玉焼き", price: 100 }] },
      item({ id: "drink", menuName: "飲み物", menuPrice: 200 }),
    ];

    const allocations = allocateOrderRevenueByItem({ totalPrice: 1_260, items });

    expect(allocations).toEqual([1_080, 180]);
    expect(allocations.reduce((sum, amount) => sum + amount, 0)).toBe(1_260);
  });

  it("distributes fractional yen deterministically and keeps the line sum equal to the order total", () => {
    const items = ["a", "b", "c"].map((id) => item({ id, menuName: id, menuPrice: 100 }));

    expect(allocateOrderRevenueByItem({ totalPrice: 100, items })).toEqual([34, 33, 33]);
  });

  it("does not invent item revenue when line price snapshots are unavailable", () => {
    const items = [item({ id: "free", menuName: "無料", menuPrice: 0 })];

    expect(allocateOrderRevenueByItem({ totalPrice: 0, items })).toEqual([0]);
    expect(allocateOrderRevenueByItem({ totalPrice: 500, items })).toEqual([0]);
  });
});
