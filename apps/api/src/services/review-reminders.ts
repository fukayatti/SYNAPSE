import { and, eq, inArray, isNull, isNotNull, lte, or } from "drizzle-orm";
import { circle, createDb, event, eventUser, order, review, type WorkerEnv } from "@fesflow/db";
import { notifyVisitors } from "./web-push";

// 2026-10-21: 対象は注文を受け取った来場者のうち、レビュー可能な店舗に未投稿レビューがある人に絞る。
export async function sendEndedEventReviewReminders(env: WorkerEnv) {
  const db = createDb(env.DB);
  const now = new Date();
  const endedEvents = await db.select({ id: event.id, eventName: event.eventName })
    .from(event)
    .where(and(
      isNull(event.deletedAt),
      isNull(event.reviewReminderSentAt),
      or(
        inArray(event.lifecycleStatus, ["ended", "archived"]),
        and(isNotNull(event.endDate), lte(event.endDate, now)),
      ),
    ));

  for (const endedEvent of endedEvents) {
    // 2026-10-22: 注文登録だけでレビュー依頼を送らず、店頭会計済みの購入を対象にする。
    const completedOrders = await db.select({
      visitorId: eventUser.id,
      eventId: eventUser.eventId,
      circleId: circle.id,
    }).from(order)
      .innerJoin(circle, eq(circle.id, order.circleId))
      .innerJoin(eventUser, eq(eventUser.id, order.userId))
      .where(and(
        eq(circle.eventId, endedEvent.id),
        eq(eventUser.eventId, endedEvent.id),
        eq(eventUser.status, "available"),
        isNull(circle.deletedAt),
        eq(order.paymentStatus, "paid"),
        or(eq(order.status, "completed"), eq(order.completed, true)),
      ));

    const reviewedRows = await db.select({ visitorId: review.eventUserId, circleId: review.circleId })
      .from(review)
      .innerJoin(circle, eq(circle.id, review.circleId))
      .where(and(eq(circle.eventId, endedEvent.id), isNull(circle.deletedAt)));
    const reviewed = new Set(reviewedRows.map((row) => `${row.visitorId}:${row.circleId}`));
    const eligible = new Map<string, { id: string; eventId: string }>();
    for (const row of completedOrders) {
      if (!reviewed.has(`${row.visitorId}:${row.circleId}`)) {
        eligible.set(row.visitorId, { id: row.visitorId, eventId: row.eventId });
      }
    }

    const recipients = [...eligible.values()];
    if (recipients.length > 0) {
      await notifyVisitors(db, env, recipients, {
        type: "review_reminder",
        title: "文化祭のレビューをお願いします",
        message: `${endedEvent.eventName}で利用したお店のレビューを投稿できます。ご感想をお聞かせください。`,
        href: "/visitor/reviews",
        dedupeKey: (visitorId) => `review-reminder:${endedEvent.id}:${visitorId}`,
      }, {
        title: "お店のレビューをお願いします",
        body: `${endedEvent.eventName}で利用したお店の感想を投稿できます。`,
        url: "/visitor/reviews",
        tag: `review-reminder-${endedEvent.id}`,
      });
    }

    // in-app履歴が保存された後に完了印を付け、失敗時は次のCronで再試行できるようにする。
    await db.update(event).set({ reviewReminderSentAt: now }).where(eq(event.id, endedEvent.id));
  }
}
