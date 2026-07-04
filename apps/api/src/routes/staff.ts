import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, staff } from "@fesflow/db";
import { eq, and, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

const staffRoutes = new Hono();

// スタッフ一覧取得
staffRoutes.get("/", async (c) => {
  const circleId = c.req.query("circleId");

  if (!circleId) {
    return c.json({ error: "circleIdが必要です" }, 400);
  }

  const staffList = await db
    .select()
    .from(staff)
    .where(eq(staff.circleId, circleId));

  return c.json(staffList);
});

// スタッフ取得
staffRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const staffList = await db.select().from(staff).where(eq(staff.id, id));

  if (staffList.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 404);
  }

  return c.json(staffList[0]);
});

// スタッフ作成
staffRoutes.post(
  "/",
  zValidator(
    "json",
    z.object({
      circleId: z.string(),
      name: z.string().min(1, "スタッフ名は必須です"),
    })
  ),
  async (c) => {
    const input = c.req.valid("json");
    const id = nanoid();

    await db.insert(staff).values({
      id,
      circleId: input.circleId,
      name: input.name,
    });

    return c.json({ id }, 201);
  }
);

// スタッフ更新
staffRoutes.put(
  "/:id",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).optional(),
    })
  ),
  async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    if (input.name) {
      await db.update(staff).set({ name: input.name }).where(eq(staff.id, id));
    }

    return c.json({ success: true });
  }
);

// スタッフ削除
staffRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(staff).where(eq(staff.id, id));
  return c.json({ success: true });
});

// 現在のシフト（出勤中で退勤していないスタッフ）
staffRoutes.get("/shift/current", async (c) => {
  const circleId = c.req.query("circleId");

  if (!circleId) {
    return c.json({ error: "circleIdが必要です" }, 400);
  }

  const staffList = await db
    .select()
    .from(staff)
    .where(and(eq(staff.circleId, circleId), isNull(staff.shiftEnd)));

  // shiftStartがnullでないスタッフのみ
  const currentShiftStaff = staffList.filter((s) => s.shiftStart !== null);

  return c.json(currentShiftStaff);
});

// 出勤
staffRoutes.post("/:id/clock-in", async (c) => {
  const id = c.req.param("id");

  await db
    .update(staff)
    .set({ shiftStart: new Date(), shiftEnd: null })
    .where(eq(staff.id, id));

  return c.json({ success: true });
});

// 退勤
staffRoutes.post("/:id/clock-out", async (c) => {
  const id = c.req.param("id");

  await db.update(staff).set({ shiftEnd: new Date() }).where(eq(staff.id, id));

  return c.json({ success: true });
});

export default staffRoutes;
