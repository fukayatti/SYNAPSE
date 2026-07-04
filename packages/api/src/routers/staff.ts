import { z } from "zod";
import { router, publicProcedure } from "../index";
import { db, staff } from "@fesflow/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const staffRouter = router({
  // スタッフ一覧取得
  list: publicProcedure
    .input(z.object({ circleId: z.string() }))
    .query(async ({ input }) => {
      return await db
        .select()
        .from(staff)
        .where(eq(staff.circleId, input.circleId));
    }),

  // スタッフ詳細取得
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const staffMembers = await db
        .select()
        .from(staff)
        .where(eq(staff.id, input.id));

      if (staffMembers.length === 0) {
        throw new Error("スタッフが見つかりません");
      }

      return staffMembers[0];
    }),

  // スタッフ作成
  create: publicProcedure
    .input(
      z.object({
        circleId: z.string(),
        name: z.string().min(1, "名前は必須です"),
        shiftStart: z.string().optional(),
        shiftEnd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = nanoid();

      await db.insert(staff).values({
        id,
        circleId: input.circleId,
        name: input.name,
        shiftStart: input.shiftStart ? new Date(input.shiftStart) : undefined,
        shiftEnd: input.shiftEnd ? new Date(input.shiftEnd) : undefined,
      });

      return { id };
    }),

  // スタッフ更新
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        shiftStart: z.string().nullable().optional(),
        shiftEnd: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, shiftStart, shiftEnd, ...rest } = input;

      const updateData: Record<string, unknown> = { ...rest };

      if (shiftStart !== undefined) {
        updateData.shiftStart = shiftStart ? new Date(shiftStart) : null;
      }
      if (shiftEnd !== undefined) {
        updateData.shiftEnd = shiftEnd ? new Date(shiftEnd) : null;
      }

      await db.update(staff).set(updateData).where(eq(staff.id, id));

      return { success: true };
    }),

  // スタッフ削除
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(staff).where(eq(staff.id, input.id));
      return { success: true };
    }),

  // 現在シフト中のスタッフ取得
  getCurrentShift: publicProcedure
    .input(z.object({ circleId: z.string() }))
    .query(async ({ input }) => {
      const now = new Date();
      const staffMembers = await db
        .select()
        .from(staff)
        .where(eq(staff.circleId, input.circleId));

      return staffMembers.filter((s) => {
        if (!s.shiftStart || !s.shiftEnd) return false;
        return s.shiftStart <= now && now <= s.shiftEnd;
      });
    }),
});
