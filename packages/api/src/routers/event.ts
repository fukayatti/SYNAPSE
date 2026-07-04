import { z } from "zod";
import { router, publicProcedure } from "../index";
import { db, event, circle } from "@fesflow/db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

export const eventRouter = router({
  // イベントとサークル情報からサークルIDを取得
  getCircleId: publicProcedure
    .input(
      z.object({
        eventName: z.string(),
        circleName: z.string(),
        password: z.string(),
      })
    )
    .query(async ({ input }) => {
      // イベント名でイベントを検索
      const events = await db
        .select()
        .from(event)
        .where(eq(event.eventName, input.eventName));

      if (events.length === 0) {
        throw new Error("イベントが見つかりません");
      }

      const foundEvent = events[0];
      if (!foundEvent) {
        throw new Error("イベントが見つかりません");
      }

      // サークル名とイベントIDでサークルを検索
      const circles = await db
        .select()
        .from(circle)
        .where(
          and(
            eq(circle.eventId, foundEvent.id),
            eq(circle.name, input.circleName)
          )
        );

      if (circles.length === 0) {
        throw new Error("サークルが見つかりません");
      }

      const foundCircle = circles[0];
      if (!foundCircle) {
        throw new Error("サークルが見つかりません");
      }

      // パスワードの検証
      const isPasswordValid = await bcrypt.compare(
        input.password,
        foundCircle.password
      );

      if (!isPasswordValid) {
        throw new Error("パスワードが正しくありません");
      }

      return {
        circleId: foundCircle.id,
        circleName: foundCircle.name,
        eventId: foundEvent.id,
        eventName: foundEvent.eventName,
      };
    }),

  // イベント一覧取得
  list: publicProcedure.query(async () => {
    return await db.select().from(event);
  }),

  // イベント取得
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const events = await db
        .select()
        .from(event)
        .where(eq(event.id, input.id));

      if (events.length === 0) {
        throw new Error("イベントが見つかりません");
      }

      return events[0];
    }),

  // イベント作成
  create: publicProcedure
    .input(
      z.object({
        eventName: z.string().min(1, "イベント名は必須です"),
        description: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = nanoid();
      await db.insert(event).values({
        id,
        eventName: input.eventName,
        description: input.description,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });

      return { id };
    }),

  // イベント削除
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(event).where(eq(event.id, input.id));
      return { success: true };
    }),
});
