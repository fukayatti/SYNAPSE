import { buildPushPayload, type PushSubscription as WebPushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";
import { and, eq, or } from "drizzle-orm";
import { circle, event, membership, notification, pushSubscription, visitorNotification, type DB, type WorkerEnv } from "@fesflow/db";
import { ulid } from "ulidx";

export type PushTarget = { ownerType: "staff" | "visitor"; ownerId: string; eventId?: string | null };
export type NotificationContent = { type: string; title: string; message: string; href: string; dedupeKey: (eventUserId: string) => string };
export type PushPayload = { title: string; body: string; url: string; tag?: string };

// 2026-10-21: 配信不能は本体操作を失敗させず、期限切れ endpoint だけを回収する。
export async function sendPushToTargets(
  db: DB,
  env: WorkerEnv,
  targets: PushTarget[],
  payload: PushPayload,
) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || targets.length === 0) return;

  const uniqueTargets = [...new Map(targets.map((target) => [
    `${target.ownerType}:${target.ownerId}:${target.eventId ?? ""}`,
    target,
  ])).values()];
  const predicates = uniqueTargets.map((target) => and(
    eq(pushSubscription.ownerType, target.ownerType),
    eq(pushSubscription.ownerId, target.ownerId),
    target.ownerType === "visitor" && target.eventId
      ? eq(pushSubscription.eventId, target.eventId)
      : undefined,
  ));
  const rows = await db.select().from(pushSubscription).where(or(...predicates));
  const targetsByOwner = new Map(uniqueTargets.map((target) => [
    `${target.ownerType}:${target.ownerId}`,
    target,
  ]));
  const eligible = rows.filter((row) => {
    const target = targetsByOwner.get(`${row.ownerType}:${row.ownerId}`);
    return target && (target.ownerType !== "visitor" || !target.eventId || target.eventId === row.eventId);
  });
  const vapid: VapidKeys = {
    subject: env.VAPID_SUBJECT || "mailto:admin@fesflow.shikosai.net",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  for (let offset = 0; offset < eligible.length; offset += 10) {
    await Promise.all(eligible.slice(offset, offset + 10).map(async (row) => {
      const subscription: WebPushSubscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        const init = await buildPushPayload({ data: JSON.stringify(payload), options: { ttl: 3600 } }, subscription, vapid);
        const response = await fetch(row.endpoint, init);
        if (response.status === 404 || response.status === 410) {
          await db.delete(pushSubscription).where(eq(pushSubscription.id, row.id));
        } else if (!response.ok) {
          console.warn("web_push_delivery_rejected", { status: response.status });
        }
      } catch {
        // endpoint と鍵は通知先の能力情報なので、例外ログへ含めない。
        console.warn("web_push_delivery_failed");
      }
    }));
  }
}

export async function saveVisitorNotifications(
  db: DB,
  recipients: Array<{ id: string; eventId: string }>,
  content: NotificationContent,
) {
  const values = recipients.map((recipient) => ({
    id: ulid(),
    eventId: recipient.eventId,
    eventUserId: recipient.id,
    dedupeKey: content.dedupeKey(recipient.id),
    type: content.type,
    title: content.title,
    message: content.message,
    href: content.href,
  }));
  const added: Array<{ id: string; eventId: string }> = [];
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
  for (let offset = 0; offset < values.length; offset += 50) {
    const inserted = await db.insert(visitorNotification).values(values.slice(offset, offset + 50))
      .onConflictDoNothing()
      .returning({ eventUserId: visitorNotification.eventUserId });
    for (const row of inserted) {
      const recipient = recipientById.get(row.eventUserId);
      if (recipient) added.push(recipient);
    }
  }
  return added;
}

export function visitorPushTargets(recipients: Array<{ id: string; eventId: string }>): PushTarget[] {
  return recipients.map(({ id, eventId }) => ({ ownerType: "visitor", ownerId: id, eventId }));
}

export async function notifyVisitors(
  db: DB,
  env: WorkerEnv,
  recipients: Array<{ id: string; eventId: string }>,
  content: NotificationContent,
  payload: PushPayload,
) {
  const added = await saveVisitorNotifications(db, recipients, content);
  await sendPushToTargets(db, env, visitorPushTargets(added), payload);
}

export async function notifyVisitorOrderComplete(
  db: DB,
  env: WorkerEnv,
  input: { eventId: string; visitorId: string; orderId: string; orderNumber: string },
) {
  await notifyVisitors(db, env, [{ id: input.visitorId, eventId: input.eventId }], {
    type: "order_completed",
    title: `注文番号 ${input.orderNumber} が完成しました`,
    message: "お店で受取番号をお伝えください。注文履歴でも確認できます。",
    href: "/visitor/orders",
    dedupeKey: (visitorId) => `order-completed:${input.orderId}:${visitorId}`,
  }, {
    title: "注文ができあがりました",
    body: "注文履歴で受取番号を確認してください。",
    url: "/visitor/orders",
    tag: `order-${input.orderId}`,
  });
}

export async function notifyCircleLowStock(
  db: DB,
  env: WorkerEnv,
  circleId: string,
  items: Array<{ name: string; remaining: number }>,
) {
  if (items.length === 0) return;
  const circles = await db.select({ id: circle.id, name: circle.name, eventId: circle.eventId })
    .from(circle).where(eq(circle.id, circleId)).limit(1);
  const targetCircle = circles[0];
  if (!targetCircle) return;

  const events = await db.select({ eventName: event.eventName }).from(event).where(eq(event.id, targetCircle.eventId)).limit(1);
  const eventName = events[0]?.eventName ?? null;
  const staff = await db.select({ userEmail: membership.userEmail }).from(membership).where(and(
    eq(membership.isActive, true),
    or(eq(membership.circleId, circleId), eq(membership.eventId, targetCircle.eventId)),
  ));
  const emails = [...new Set(staff.map((row) => row.userEmail.toLowerCase()).filter(Boolean))];
  if (emails.length === 0) return;

  const message = items.map((item) => item.remaining <= 0
    ? `${item.name}の在庫がなくなりました`
    : `${item.name}の在庫が残り${item.remaining}点です`).join(" / ");
  const createdAt = new Date();
  for (const email of emails) {
    await db.insert(notification).values({
      id: ulid(),
      userEmail: email,
      title: "在庫アラート",
      message,
      type: "inventory_alert",
      status: "unread",
      circleName: targetCircle.name,
      eventName,
      createdAt,
    });
  }
  await sendPushToTargets(db, env, emails.map((ownerId) => ({ ownerType: "staff" as const, ownerId })), {
    title: "在庫アラート",
    body: "販売中の商品の在庫が少なくなっています。管理画面をご確認ください。",
    url: "/circle/dashboard/stock",
    tag: `stock-${circleId}-${Math.floor(Date.now() / 60_000)}`,
  });
}
