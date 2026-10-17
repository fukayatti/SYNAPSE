import { describe, expect, it } from "vitest";
import { calculateDiscount } from "../src/utils/discount";

describe("register discount calculation", () => {
  it("applies a percentage to the item subtotal and rounds down", () => {
    expect(calculateDiscount(999, "percentage", 10)).toBe(99);
  });

  it("caps a fixed amount at the subtotal", () => {
    expect(calculateDiscount(350, "amount", 500)).toBe(350);
  });

  it("returns zero for an empty subtotal", () => {
    expect(calculateDiscount(0, "percentage", 100)).toBe(0);
  });
});
