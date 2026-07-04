import { z } from "zod";
import { router, publicProcedure } from "../index";
import { db, topping } from "@fesflow/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const toppingRouter = router({
  // トッピング一覧取得
  list: publicProcedure
    .input(z.object({ circleId: z.string() }))
    .query(async ({ input }) => {
      return await db
        .select()
        .from(topping)
        .where(eq(topping.circleId, input.circleId));
    }),

  // トッピング詳細取得
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const toppings = await db
        .select()
        .from(topping)
        .where(eq(topping.id, input.id));

      if (toppings.length === 0) {
        throw new Error("トッピングが見つかりません");
      }

      return toppings[0];
    }),

  // トッピング作成
  create: publicProcedure
    .input(
      z.object({
        circleId: z.string(),
        name: z.string(),
        price: z.number(),
        description: z.string().optional(),
        soldOut: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = nanoid();

      await db.insert(topping).values({
        id,
        circleId: input.circleId,
        name: input.name,
        price: input.price,
        description: input.description,
        soldOut: input.soldOut ?? false,
      });

      return { id };
    }),

  // トッピング更新
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        price: z.number().optional(),
        description: z.string().optional(),
        soldOut: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;
      await db.update(topping).set(updateData).where(eq(topping.id, id));

      return { success: true };
    }),

  // トッピング削除
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(topping).where(eq(topping.id, input.id));
      return { success: true };
    }),
});
