/**
 * イベント統計 (GET /api/festivals/:id/analytics) の回帰テスト。
 * event_manager が横断集計 (来場者/売上/注文) を取得できることを確認する。
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { membership, circle, order, eventUser, circleVisit, wristband } from "@fesflow/db";
import { request, testDb, uid } from "./helpers";

function cookieOf(res: Response): string {
	const raw =
		(res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
		(res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
	return raw.map((c) => c.split(";")[0]).join("; ");
}
async function signUp(prefix: string) {
	const email = `${uid(prefix)}@example.com`;
	const res = await request("/api/auth/sign-up/email", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password: "correct-horse-battery-staple", name: prefix }),
	});
	expect(res.status).toBeLessThan(400);
	return { cookie: cookieOf(res), email };
}

describe("イベント統計 analytics", () => {
	it("入場処理済みアカウントと家族プロフィールを入場時刻・入場後の行動で集計する", async () => {
		const owner = await signUp("analytics");
		const db = testDb();

		const evRes = await request("/api/festivals", {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: owner.cookie },
			body: JSON.stringify({ eventName: uid("分析祭") }),
		});
		const { id: eventId } = (await evRes.json()) as { id: string };

		// event_manager membership の id を取得 (X-Active-Membership-Id 用)
		const em = await db
			.select()
			.from(membership)
			.where(and(eq(membership.eventId, eventId), eq(membership.role, "event_manager")));
		const activeId = em[0]!.id;

		// サークル + 注文 + 事前登録/入場済みアカウントを用意
		const cId = uid("c");
		await db.insert(circle).values({ id: cId, eventId, name: uid("店") });
		await db.insert(order).values({
			id: uid("o"),
			circleId: cId,
			orderNumber: uid("no"),
			peopleCount: 2,
			totalPrice: 800,
			status: "completed",
			completed: true,
		});
		const enteredId = uid("entered");
		const pendingId = uid("pending");
		const createdAt = new Date("2026-10-18T00:00:00.000Z"); // 09:00 JST
		const enteredAt = new Date("2026-10-18T02:00:00.000Z"); // 11:00 JST
		await db.insert(eventUser).values({
			id: enteredId,
			eventId,
			displayId: 1,
			createdAt,
			onboardedAt: enteredAt,
		});
		await db.insert(eventUser).values({
			id: pendingId,
			eventId,
			displayId: 2,
			createdAt: new Date("2026-10-18T01:00:00.000Z"), // 10:00 JST、入場処理前
		});
		await db.insert(wristband).values([
			{
				id: uid("wb-main"),
				userId: enteredId,
				status: "active",
				ageGroup: "10s",
				onboardedAt: enteredAt,
			},
			{
				id: uid("wb-family"),
				userId: enteredId,
				status: "smartphone",
				ageGroup: "30s",
				onboardedAt: enteredAt,
			},
			{ id: uid("wb-pending"), userId: pendingId, status: "active", ageGroup: "40s" },
		]);
		await db.insert(circleVisit).values([
			{
				id: uid("visit-before-entry"),
				eventUserId: enteredId,
				circleId: cId,
				createdAt: new Date(enteredAt.getTime() - 30 * 60_000),
			},
			{
				id: uid("visit-after-entry"),
				eventUserId: enteredId,
				circleId: cId,
				createdAt: new Date(enteredAt.getTime() + 60 * 60_000),
			},
			{
				id: uid("visit-pending"),
				eventUserId: pendingId,
				circleId: cId,
				createdAt: new Date(enteredAt.getTime() + 60 * 60_000),
			},
		]);

		const res = await request(`/api/festivals/${eventId}/analytics`, {
			headers: { Cookie: owner.cookie, "X-Active-Membership-Id": activeId },
		});
		expect(res.status).toBe(200);
		const a = (await res.json()) as {
			totals: {
				visitors: number;
				visitorProfiles: number;
				preRegisteredAccounts: number;
				entryRate: number;
				circleVisits: number;
				visitingUsers: number;
				revenue: number;
				orders: number;
				customers: number;
				circles: number;
			};
			byHour: { hour: number; visitors: number }[];
		};
		expect(a.totals.visitors).toBe(1);
		expect(a.totals.visitorProfiles).toBe(2);
		expect(a.totals.preRegisteredAccounts).toBe(2);
		expect(a.totals.entryRate).toBe(50);
		expect(a.totals.circleVisits).toBe(1);
		expect(a.totals.visitingUsers).toBe(1);
		expect(a.byHour.find((row) => row.hour === 11)?.visitors).toBe(1);
		expect(a.byHour.find((row) => row.hour === 9)?.visitors).toBe(0);
		expect(a.byHour.find((row) => row.hour === 10)?.visitors).toBe(0);
		expect(a.totals.revenue).toBe(800);
		expect(a.totals.orders).toBe(1);
		expect(a.totals.customers).toBe(2);
		expect(a.totals.circles).toBe(1);

		const behaviorRes = await request(`/api/festivals/${eventId}/behavior`, {
			headers: { Cookie: owner.cookie, "X-Active-Membership-Id": activeId },
		});
		expect(behaviorRes.status).toBe(200);
		const behavior = (await behaviorRes.json()) as {
			journey: { visitors: number; avgCirclesPerVisitor: number };
			byHour: { hour: number; activeUsers: number; arrivals: number }[];
		};
		expect(behavior.journey.visitors).toBe(1);
		expect(behavior.journey.avgCirclesPerVisitor).toBe(1);
		expect(behavior.byHour.find((row) => row.hour === 11)?.arrivals).toBe(1);
		expect(behavior.byHour.find((row) => row.hour === 12)?.activeUsers).toBe(1);
		expect(behavior.byHour.find((row) => row.hour === 10)?.activeUsers).toBe(0);

		const circleAnalyticsRes = await request(`/api/circles/${cId}/analytics`, {
			headers: { Cookie: owner.cookie, "X-Active-Membership-Id": activeId },
		});
		expect(circleAnalyticsRes.status).toBe(200);
		const circleAnalytics = (await circleAnalyticsRes.json()) as { totals: { visitors: number } };
		expect(circleAnalytics.totals.visitors).toBe(1);
	});

	it("super_admin かつ当該イベントの event_manager なら、active=super_admin でも analytics を見られる", async () => {
		// 自分で作ったイベントを持つ運営者(super_admin かつ event_manager)を再現する。
		const owner = await signUp("saowner");
		const db = testDb();
		const evRes = await request("/api/festivals", {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: owner.cookie },
			body: JSON.stringify({ eventName: uid("自作イベント") }),
		});
		const { id: eventId } = (await evRes.json()) as { id: string };

		// super_admin membership を付与 (active スペースとして使う)
		const saId = uid("m");
		await db.insert(membership).values({
			id: saId,
			userEmail: owner.email.toLowerCase(),
			userName: "SA",
			role: "super_admin",
			isActive: true,
		});

		// active = super_admin membership でも、本人が event_manager でもあるので 200
		const res = await request(`/api/festivals/${eventId}/analytics`, {
			headers: { Cookie: owner.cookie, "X-Active-Membership-Id": saId },
		});
		expect(res.status).toBe(200);
	});

	it("super_admin でも当該イベントに正規ロールが無ければ analytics は 403 (Phase D 分離)", async () => {
		const owner = await signUp("otherowner");
		const evRes = await request("/api/festivals", {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: owner.cookie },
			body: JSON.stringify({ eventName: uid("他人イベント") }),
		});
		const { id: eventId } = (await evRes.json()) as { id: string };

		// 別人の super_admin (このイベントには何のロールも持たない)
		const admin = await signUp("pureadmin");
		const db = testDb();
		const saId = uid("m");
		await db.insert(membership).values({
			id: saId,
			userEmail: admin.email.toLowerCase(),
			userName: "SA2",
			role: "super_admin",
			isActive: true,
		});
		const res = await request(`/api/festivals/${eventId}/analytics`, {
			headers: { Cookie: admin.cookie, "X-Active-Membership-Id": saId },
		});
		expect(res.status).toBe(403);
	});

	it("権限のないユーザーの analytics は 403", async () => {
		const owner = await signUp("aowner");
		const evRes = await request("/api/festivals", {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: owner.cookie },
			body: JSON.stringify({ eventName: uid("非公開祭") }),
		});
		const { id: eventId } = (await evRes.json()) as { id: string };

		const outsider = await signUp("aoutsider");
		const res = await request(`/api/festivals/${eventId}/analytics`, {
			headers: { Cookie: outsider.cookie },
		});
		expect(res.status).toBe(403);
	});
});
