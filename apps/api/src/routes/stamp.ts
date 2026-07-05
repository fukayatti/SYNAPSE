import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db, userStamp, rewardRedemption } from "@fesflow/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getSession } from "../utils/auth";

const stampRoutes = new Hono();

// ユーザーのスタンプ取得
// 2026-07-05: フロント(apps/register, apps/visitor)を grep した結果、現時点では
// `/api/stamps/:userId` を呼び出すコンポーネント・APIラッパーは存在しない(未消費)。
// 想定用途は来場者マイページでの自分のスタンプ確認であり、他のマイページ系エンドポイント
// (例: pre-orders/user/:code)と同様に userId(=リストバンド/ゲストID) の保持自体が
// 実質的な本人確認手段となる設計のため、現状維持（認可なし）とする。
// スタンプ数・景品交換済みフラグのみを返しており、他ユーザーの決済情報等の機微情報は含まない。
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
