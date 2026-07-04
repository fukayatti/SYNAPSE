import { db, event, eventUser, wristband } from "./src";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("DBへの直接登録を開始します...");

  // 0. 親イベントレコード (evt_default) の存在保証
  const existingEvents = await db.select().from(event).where(eq(event.id, "evt_default"));
  if (existingEvents.length === 0) {
    await db.insert(event).values({
      id: "evt_default",
      eventName: "メインイベント (学園祭・フェス)",
    });
    console.log("[EVENT] evt_default を作成しました。");
  }

  const testData = [
    { wbId: "wb_admin_001", userId: "usr_admin", displayId: 999 },
    { wbId: "wb_test_001", userId: "usr_test_001", displayId: 101 },
    { wbId: "wb_test_002", userId: "usr_test_002", displayId: 102 },
    { wbId: "wb_test_003", userId: "usr_test_003", displayId: 103 },
  ];

  for (const item of testData) {
    // 1. eventUser 登録
    const existingUsers = await db.select().from(eventUser).where(eq(eventUser.id, item.userId));
    if (existingUsers.length === 0) {
      await db.insert(eventUser).values({
        id: item.userId,
        eventId: "evt_default",
        displayId: item.displayId,
        status: "available",
      });
      console.log(`[USER] ${item.userId} (ID: #${item.displayId}) を作成しました。`);
    } else {
      console.log(`[USER] ${item.userId} は既に存在します。`);
    }

    // 2. wristband 登録
    const existingWbs = await db.select().from(wristband).where(eq(wristband.id, item.wbId));
    if (existingWbs.length === 0) {
      await db.insert(wristband).values({
        id: item.wbId,
        userId: item.userId,
        status: "active",
        assignedAt: new Date(),
      });
      console.log(`[WRISTBAND] ${item.wbId} -> ${item.userId} を登録・アクティブ化しました。`);
    } else {
      await db.update(wristband).set({ status: "active" }).where(eq(wristband.id, item.wbId));
      console.log(`[WRISTBAND] ${item.wbId} のステータスを active に更新しました。`);
    }
  }

  console.log("🎉 DBへの直接登録が正常完了しました！");
  process.exit(0);
}

seed().catch((err) => {
  console.error("シード実行エラー:", err);
  process.exit(1);
});
