import { Hono, type Context } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { eventUser, membership, pushSubscription, visitorNotification } from "@fesflow/db";
import { zBody } from "../z-validator";
import { apiError } from "../http-error";
import { getSession } from "../utils/auth";
import type { AppEnv } from "../types";
import { ulid } from "ulidx";

const routes = new Hono<AppEnv>();
const pushSubscriptionInput = z.object({
	visitorId: z.string().min(1).optional(),
	subscription: z.object({
		endpoint: z.string().url().max(2048),
		expirationTime: z.number().nullable().optional(),
		keys: z.object({ p256dh: z.string().min(20).max(256), auth: z.string().min(8).max(128) }),
	}),
});
const pushSubscriptionDeleteInput = z.object({
	visitorId: z.string().min(1).optional(),
	endpoint: z.string().url().max(2048),
});
const pushSubscriptionStatusInput = z.object({
	visitorId: z.string().min(1).optional(),
	endpoint: z.string().url().max(2048),
});

function isSupportedPushEndpoint(endpoint: string) {
	try {
		const url = new URL(endpoint);
		const host = url.hostname.toLowerCase();
		return url.protocol === "https:" && !url.username && !url.password && (
			host === "fcm.googleapis.com" ||
			host === "updates.push.services.mozilla.com" ||
			host.endsWith(".push.apple.com") ||
			host.endsWith(".notify.windows.com")
		);
	} catch {
		return false;
	}
}

async function resolveOwner(c: Context<AppEnv>, visitorId?: string) {
	const db = c.get("db");
	if (visitorId) {
		const rows = await db.select({ id: eventUser.id, eventId: eventUser.eventId })
			.from(eventUser)
			.where(and(eq(eventUser.id, visitorId), eq(eventUser.status, "available")))
			.limit(1);
		if (!rows[0]) apiError("FORBIDDEN", "来場者セッションを確認できません");
		return { ownerType: "visitor" as const, ownerId: rows[0].id, eventId: rows[0].eventId };
	}

	const session = await getSession(c);
	if (!session?.user) apiError("UNAUTHORIZED", "通知設定にはログインが必要です");
	const email = session.user.email.toLowerCase();
	const activeMemberships = await db.select({ id: membership.id }).from(membership)
		.where(and(eq(membership.userEmail, email), eq(membership.isActive, true))).limit(1);
	if (!activeMemberships[0]) apiError("FORBIDDEN", "有効なスタッフ所属がありません");
	return { ownerType: "staff" as const, ownerId: email, eventId: null };
}

routes.get("/config", (c) => {
	const enabled = Boolean(c.env.VAPID_PUBLIC_KEY && c.env.VAPID_PRIVATE_KEY);
	return c.json({ enabled, publicKey: enabled ? c.env.VAPID_PUBLIC_KEY : null });
});

routes.post("/subscriptions/status", zBody(pushSubscriptionStatusInput), async (c) => {
	const db = c.get("db");
	const input = c.req.valid("json");
	const owner = await resolveOwner(c, input.visitorId);
	const rows = await db.select({ id: pushSubscription.id }).from(pushSubscription).where(and(
		eq(pushSubscription.ownerType, owner.ownerType),
		eq(pushSubscription.ownerId, owner.ownerId),
		eq(pushSubscription.endpoint, input.endpoint),
	)).limit(1);
	return c.json({ subscribed: Boolean(rows[0]) });
});

routes.post("/subscriptions", zBody(pushSubscriptionInput), async (c) => {
	const db = c.get("db");
	const input = c.req.valid("json");
	if (!isSupportedPushEndpoint(input.subscription.endpoint)) apiError("BAD_REQUEST", "Push endpoint を利用できません");
	const owner = await resolveOwner(c, input.visitorId);
	const now = new Date();
	await db.insert(pushSubscription).values({
		id: ulid(),
		...owner,
		endpoint: input.subscription.endpoint,
		p256dh: input.subscription.keys.p256dh,
		auth: input.subscription.keys.auth,
		createdAt: now,
		updatedAt: now,
	}).onConflictDoUpdate({
		target: pushSubscription.endpoint,
		set: {
			...owner,
			p256dh: input.subscription.keys.p256dh,
			auth: input.subscription.keys.auth,
			updatedAt: now,
		},
	});
	return c.json({ success: true });
});

routes.delete("/subscriptions", zBody(pushSubscriptionDeleteInput), async (c) => {
	const db = c.get("db");
	const input = c.req.valid("json");
	const owner = await resolveOwner(c, input.visitorId);
	await db.delete(pushSubscription).where(and(
		eq(pushSubscription.ownerType, owner.ownerType),
		eq(pushSubscription.ownerId, owner.ownerId),
		eq(pushSubscription.endpoint, input.endpoint),
	));
	return c.json({ success: true });
});

routes.get("/visitor/:userId", async (c) => {
	const db = c.get("db");
	const userId = c.req.param("userId");
	const visitor = await db.select({ id: eventUser.id })
		.from(eventUser)
		.where(and(eq(eventUser.id, userId), eq(eventUser.status, "available")))
		.limit(1);
	if (!visitor[0]) return c.json([]);
	const rows = await db.select().from(visitorNotification)
		.where(eq(visitorNotification.eventUserId, userId))
		.orderBy(desc(visitorNotification.createdAt))
		.limit(100);
	return c.json(rows);
});

routes.post("/visitor/:userId/:notificationId/read", async (c) => {
	const db = c.get("db");
	const userId = c.req.param("userId");
	const notificationId = c.req.param("notificationId");
	await db.update(visitorNotification).set({ readAt: new Date() }).where(and(
		eq(visitorNotification.id, notificationId),
		eq(visitorNotification.eventUserId, userId),
		isNull(visitorNotification.readAt),
	));
	return c.json({ success: true });
});

export default routes;
