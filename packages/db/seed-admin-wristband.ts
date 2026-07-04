import { db, user as authUser, event, eventUser, wristband } from "./src";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  const adminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL || "me@fukayatti0.dev";
  console.log(`管理者メール (${adminEmail}) へのリストバンド直接紐付けを開始します...`);

  // 0. イベント存在チェック
  const existingEvents = await db.select().from(event).where(eq(event.id, "evt_default"));
  if (existingEvents.length === 0) {
    await db.insert(event).values({
      id: "evt_default",
      eventName: "メインイベント (学園祭・フェス)",
    });
  }

  // 1. authUser テーブルから me@fukayatti0.dev を検索
  const usersInAuth = await db.select().from(authUser).where(eq(authUser.email, adminEmail));
  let adminAuthUserId = "usr_admin";
  if (usersInAuth.length > 0) {
    adminAuthUserId = usersInAuth[0]!.id;
    console.log(`Authユーザーが見つかりました: ID = ${adminAuthUserId}`);
  }

  const targetUserIds = Array.from(new Set([adminAuthUserId, adminEmail, "usr_admin"]));
  let baseDisplayId = 990;

  for (const targetId of targetUserIds) {
    baseDisplayId += 1;
    // eventUser 存在チェック＆作成
    const existingEU = await db.select().from(eventUser).where(eq(eventUser.id, targetId));
    if (existingEU.length === 0) {
      await db.insert(eventUser).values({
        id: targetId,
        eventId: "evt_default",
        displayId: baseDisplayId,
        status: "available",
      });
      console.log(`[eventUser] ID: ${targetId} (#${baseDisplayId}) を作成しました。`);
    } else {
      console.log(`[eventUser] ID: ${targetId} は既に存在します。`);
    }

    // wristband (wb_admin_001) 存在チェック＆紐付け
    const wbCode = targetId === adminAuthUserId ? "wb_admin_001" : `wb_${targetId.slice(0, 10)}`;
    const existingWb = await db.select().from(wristband).where(eq(wristband.id, wbCode));
    if (existingWb.length === 0) {
      await db.insert(wristband).values({
        id: wbCode,
        userId: targetId,
        status: "active",
        assignedAt: new Date(),
      });
      console.log(`[wristband] ${wbCode} -> ${targetId} を登録しました。`);
    } else {
      await db
        .update(wristband)
        .set({ userId: targetId, status: "active" })
        .where(eq(wristband.id, wbCode));
      console.log(`[wristband] ${wbCode} -> ${targetId} に更新・アクティブ化しました。`);
    }
  }

  // 特に AuthID (lTkBEJtn1G88NFZ2bsLdATuSrjjLuaTG) に wb_admin_001 を確実に紐付ける
  await db
    .insert(wristband)
    .values({
      id: "wb_admin_001",
      userId: adminAuthUserId,
      status: "active",
      assignedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: wristband.id,
      set: { userId: adminAuthUserId, status: "active" },
    });
  console.log(`⭐ wb_admin_001 を管理者アカウント (${adminAuthUserId} / ${adminEmail}) にアクティブバインド完了！`);

  console.log("🎉 管理者リストバンドの直接DB登録が正常完了しました！");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
