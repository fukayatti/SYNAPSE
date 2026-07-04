import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, userStamp, rewardRedemption } from "@fesflow/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getSession } from "../utils/auth";

const stampRoutes = new Hono();

// ユーザーのスタンプ取得
stampRoutes.get("/:userId", async (c) => {
  const userId = c.req.param("userId");

  // 獲得したスタンプ
  const stamps = await db.select().from(userStamp).where(eq(userStamp.userId, userId));

  // 景品交換履歴
  const redemptions = await db
    .select()
    .from(rewardRedemption)
    .where(eq(rewardRedemption.userId, userId));

  return c.json({
    stamps,
    isRedeemed: redemptions.length > 0,
    stampCount: stamps.length,
  });
});

// 景品引換
stampRoutes.post(
  "/redeem",
  zValidator(
    "json",
    z.object({
      userId: z.string(),
    })
  ),
  async (c) => {
    const input = c.req.valid("json");

    // 交換処理を行うにはスタッフ以上のログインが必要
    const session = await getSession(c);
    
    if (!session || !session.user) {
      return c.json({ error: "権限がありません（スタッフログインが必要です）" }, 403);
    }

    const staffId = session.user.id || session.user.email;

    // 既に交換済みかチェック
    const existing = await db
      .select()
      .from(rewardRedemption)
      .where(eq(rewardRedemption.userId, input.userId));

    if (existing.length > 0) {
      return c.json({ error: "既に景品を交換済みです" }, 400);
    }

    // 必要スタンプ数を満たしているかチェック
    // ※要件に応じて個数を変更（例: 3個以上）
    const stamps = await db
      .select()
      .from(userStamp)
      .where(eq(userStamp.userId, input.userId));

    if (stamps.length < 3) { // 仮で3個とする
      return c.json({ error: "スタンプが足りません" }, 400);
    }

    // 引換記録を作成
    await db.insert(rewardRedemption).values({
      id: nanoid(),
      userId: input.userId,
      staffId: staffId,
    });

    return c.json({ success: true }, 201);
  }
);

export default stampRoutes;
