import { z } from "zod";
import { router, publicProcedure } from "../index";
import { db, menu, menuTopping } from "@fesflow/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const menuRouter = router({
  // メニュー一覧取得
  list: publicProcedure
    .input(z.object({ circleId: z.string() }))
    .query(async ({ input }) => {
      const menus = await db.query.menu.findMany({
        where: eq(menu.circleId, input.circleId),
        with: {
          menuToppings: {
            with: {
              topping: true,
            },
          },
        },
      });

      return menus;
    }),

  // メニュー詳細取得
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const menuItem = await db.query.menu.findFirst({
        where: eq(menu.id, input.id),
        with: {
          menuToppings: {
            with: {
              topping: true,
            },
          },
        },
      });

      if (!menuItem) {
        throw new Error("メニューが見つかりません");
      }

      return menuItem;
    }),

  // メニュー作成
  create: publicProcedure
    .input(
      z.object({
        circleId: z.string(),
        name: z.string(),
        price: z.number(),
        imagePath: z.string(),
        description: z.string().optional(),
        additionalInfo: z.string().optional(),
        soldOut: z.boolean().optional(),
        stockQuantity: z.number().optional(),
        toppingIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = nanoid();

      await db.insert(menu).values({
        id,
        circleId: input.circleId,
        name: input.name,
        price: input.price,
        imagePath: input.imagePath,
        description: input.description,
        additionalInfo: input.additionalInfo,
        soldOut: input.soldOut ?? false,
        stockQuantity: input.stockQuantity ?? 0,
      });

      // トッピングの関連付け
      if (input.toppingIds && input.toppingIds.length > 0) {
        await db.insert(menuTopping).values(
          input.toppingIds.map((toppingId) => ({
            id: nanoid(),
            menuId: id,
            toppingId,
          }))
        );
      }

      return { id };
    }),

  // メニュー更新
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        price: z.number().optional(),
        imagePath: z.string().optional(),
        description: z.string().optional(),
        additionalInfo: z.string().optional(),
        soldOut: z.boolean().optional(),
        stockQuantity: z.number().optional(),
        toppingIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, toppingIds, ...updateData } = input;

      await db.update(menu).set(updateData).where(eq(menu.id, id));

      // トッピングの関連付けを更新
      if (toppingIds) {
        // 既存の関連を削除
        await db.delete(menuTopping).where(eq(menuTopping.menuId, id));

        // 新しい関連を追加
        if (toppingIds.length > 0) {
          await db.insert(menuTopping).values(
            toppingIds.map((toppingId) => ({
              id: nanoid(),
              menuId: id,
              toppingId,
            }))
          );
        }
      }

      return { success: true };
    }),

  // メニュー削除
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(menu).where(eq(menu.id, input.id));
      return { success: true };
    }),

  // 在庫更新
  updateStock: publicProcedure
    .input(
      z.object({
        id: z.string(),
        stockQuantity: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await db
        .update(menu)
        .set({ stockQuantity: input.stockQuantity })
        .where(eq(menu.id, input.id));

      return { success: true };
    }),
});
