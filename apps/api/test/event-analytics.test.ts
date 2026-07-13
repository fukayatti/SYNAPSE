/**
 * イベント統計 (GET /api/festivals/:id/analytics) の回帰テスト。
 * event_manager が横断集計 (来場者/売上/注文) を取得できることを確認する。
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { membership, circle, order, eventUser } from "@fesflow/db";
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
	it("event_manager が来場者/売上/注文の集計を取得できる", async () => {
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

		// サークル + 注文 + 来場者を用意
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
		await db.insert(eventUser).values({ id: uid("u"), eventId, displayId: 1 });
		await db.insert(eventUser).values({ id: uid("u"), eventId, displayId: 2 });

		const res = await request(`/api/festivals/${eventId}/analytics`, {
			headers: { Cookie: owner.cookie, "X-Active-Membership-Id": activeId },
		});
		expect(res.status).toBe(200);
		const a = (await res.json()) as {
			totals: { visitors: number; revenue: number; orders: number; customers: number; circles: number };
		};
		expect(a.totals.visitors).toBe(2);
		expect(a.totals.revenue).toBe(800);
		expect(a.totals.orders).toBe(1);
		expect(a.totals.customers).toBe(2);
		expect(a.totals.circles).toBe(1);
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
