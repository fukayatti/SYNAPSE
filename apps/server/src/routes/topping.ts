import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, topping } from "@fesflow/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const toppingRoutes = new Hono();

// トッピング一覧取得
toppingRoutes.get("/", async (c) => {
  const circleId = c.req.query("circleId");

  if (!circleId) {
    return c.json({ error: "circleIdが必要です" }, 400);
  }

  const toppings = await db
    .select()
    .from(topping)
    .where(eq(topping.circleId, circleId));

  return c.json(toppings);
});

// トッピング取得
toppingRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const toppings = await db.select().from(topping).where(eq(topping.id, id));

  if (toppings.length === 0) {
    return c.json({ error: "トッピングが見つかりません" }, 404);
  }

  return c.json(toppings[0]);
});

// トッピング作成
toppingRoutes.post(
  "/",
  zValidator(
    "json",
    z.object({
      circleId: z.string(),
      name: z.string().min(1, "トッピング名は必須です"),
      price: z.number().min(0, "価格は0以上である必要があります"),
      description: z.string().optional(),
      soldOut: z.boolean().optional(),
    })
  ),
  async (c) => {
    const input = c.req.valid("json");
    const id = nanoid();

    await db.insert(topping).values({
      id,
      circleId: input.circleId,
      name: input.name,
      price: input.price,
      description: input.description,
      soldOut: input.soldOut ?? false,
    });

    return c.json({ id }, 201);
  }
);

// トッピング更新
toppingRoutes.put(
  "/:id",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).optional(),
      price: z.number().min(0).optional(),
      description: z.string().optional(),
      soldOut: z.boolean().optional(),
    })
  ),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const updates: Partial<typeof topping.$inferSelect> = {};

    if (input.name !== undefined) updates.name = input.name;
    if (input.price !== undefined) updates.price = input.price;
    if (input.description !== undefined)
      updates.description = input.description;
    if (input.soldOut !== undefined) updates.soldOut = input.soldOut;

    await db.update(topping).set(updates).where(eq(topping.id, id));

    return c.json({ success: true });
  }
);

// トッピング削除
toppingRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(topping).where(eq(topping.id, id));
  return c.json({ success: true });
});

export default toppingRoutes;
