import { z } from "zod";

// 2026-10-21: 顧客表示には注文者情報を含めず、レジが見せる商品と金額だけを共有する。
export const registerDisplaySnapshotSchema = z.object({
  circleName: z.string().max(120),
  isPreOrder: z.boolean(),
  displayState: z.enum(["cart", "submitted"]),
  orderNumber: z.string().max(80).nullable(),
  items: z.array(z.object({
    name: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(999),
    unitPrice: z.number().int().min(0).max(10_000_000),
    subtotal: z.number().int().min(0).max(10_000_000),
    toppings: z.array(z.object({
      name: z.string().min(1).max(120),
      unitPrice: z.number().int().min(0).max(10_000_000),
    })).max(50),
  })).max(100),
  subtotal: z.number().int().min(0).max(100_000_000),
  discount: z.number().int().min(0).max(100_000_000),
  total: z.number().int().min(0).max(100_000_000),
});

export type RegisterDisplaySnapshot = z.infer<typeof registerDisplaySnapshotSchema>;
