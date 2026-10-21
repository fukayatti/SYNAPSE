import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
	event,
	circle,
	eventUser,
	menu,
	order,
	orderItem,
	orderItemTopping,
	topping,
	wristband,
} from "@fesflow/db";
import { request, testDb, uid } from "./helpers";

/**
 * 来場者の注文履歴 GET /api/orders/user/:code のテスト。
 * - eventUser.id / リストバンドID の双方で本人注文を取得できること
 * - トッピングのスナップショットが付くこと
 * - cashierId / paymentMethod 等の内部情報が漏れないこと
 */
async function seed() {
	const db = testDb();
	const eventId = uid("ev");
	const circleId = uid("ci");
	const menuId = uid("me");
	const userId = uid("usr");

	await db.insert(event).values({ id: eventId, eventName: "テスト学園祭" });
	await db.insert(circle).values({ id: circleId, eventId, name: "テスト模擬店" });
	await db.insert(menu).values({
		id: menuId,
		circleId,
		name: "テストやきそば",
		price: 500,
		imagePath: "dummy.png",
		soldOut: false,
	});
	await db.insert(eventUser).values({ id: userId, eventId, displayId: 1 });

	return { db, eventId, circleId, menuId, userId };
}

async function insertOrder(
	db: ReturnType<typeof testDb>,
	opts: {
		circleId: string;
		userId: string;
		menuId: string;
		withTopping?: boolean;
		status?: string;
	}
) {
	const orderId = uid("ord");
	const orderItemId = uid("oi");
	await db.insert(order).values({
		id: orderId,
		userId: opts.userId,
		circleId: opts.circleId,
		orderNumber: uid("num"),
		peopleCount: 1,
		totalPrice: opts.withTopping ? 600 : 500,
		status: opts.status ?? "completed",
		completed: (opts.status ?? "completed") === "completed",
		cashierId: "secret-cashier",
		paymentMethod: "cash",
	});
	await db.insert(orderItem).values({
		id: orderItemId,
		orderId,
		menuId: opts.menuId,
		menuName: "テストやきそば",
		menuPrice: 500,
		quantity: 1,
	});
	if (opts.withTopping) {
		// orderItemTopping.toppingId は topping.id への FK のため実体を先に作る
		const toppingId = uid("top");
		await db.insert(topping).values({
			id: toppingId,
			circleId: opts.circleId,
			name: "大盛り",
			price: 100,
			soldOut: false,
		});
		await db.insert(orderItemTopping).values({
			id: uid("oit"),
			orderItemId,
			toppingId,
			toppingName: "大盛り",
			toppingPrice: 100,
		});
	}
	return { orderId };
}

describe("来場者の注文履歴", () => {
	it("eventUser.id で本人のレジ通過注文を取得でき、内部情報は漏れない", async () => {
		const { db, circleId, menuId, userId } = await seed();
		const { orderId } = await insertOrder(db, {
			circleId,
			userId,
			menuId,
			withTopping: true,
		});

		const res = await request(`/api/orders/user/${userId}`);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any[];
		expect(data).toHaveLength(1);
		expect(data[0].id).toBe(orderId);
		expect(data[0].circleName).toBe("テスト模擬店");
		expect(data[0].items).toHaveLength(1);
		expect(data[0].items[0].toppings).toHaveLength(1);
		expect(data[0].items[0].toppings[0].name).toBe("大盛り");

		// 内部情報 (レジ担当・支払い方法) は本人ビューに含めない
		expect(data[0].cashierId).toBeUndefined();
		expect(data[0].paymentMethod).toBeUndefined();
	});

	it("リストバンドID (active) からも本人の注文を取得できる", async () => {
		const { db, circleId, menuId, userId } = await seed();
		const wbId = uid("wb");
		await db.insert(wristband).values({
			id: wbId,
			userId,
			status: "active",
		});
		const { orderId } = await insertOrder(db, { circleId, userId, menuId });

		const res = await request(`/api/orders/user/${wbId}`);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any[];
		expect(data).toHaveLength(1);
		expect(data[0].id).toBe(orderId);
	});

	it("未知のコードは空配列を返す", async () => {
		const res = await request(`/api/orders/user/${uid("nobody")}`);
		expect(res.status).toBe(200);
		const data = (await res.json()) as any[];
		expect(data).toHaveLength(0);
	});

	it("本人の受け取り待ち注文を受け取り済みにでき、繰り返し操作も成功する", async () => {
		const { db, circleId, menuId, userId } = await seed();
		const { orderId } = await insertOrder(db, { circleId, userId, menuId, status: "ready" });
		const path = `/api/orders/user/${userId}/${orderId}/received`;

		const first = await request(path, { method: "POST" });
		expect(first.status).toBe(200);
		expect(await first.json()).toEqual({ success: true });

		const saved = await db.select().from(order).where(eq(order.id, orderId));
		expect(saved[0]?.status).toBe("ready");
		expect(saved[0]?.receivedAt).toBeInstanceOf(Date);

		// 2026-10-21: 通信再試行や連打では受け取り時刻を巻き戻さず、同じ成功結果を返す。
		const receivedAt = saved[0]!.receivedAt;
		const retry = await request(path, { method: "POST" });
		expect(retry.status).toBe(200);
		const afterRetry = await db.select().from(order).where(eq(order.id, orderId));
		expect(afterRetry[0]?.receivedAt).toEqual(receivedAt);
	});

	it("他の来場者の注文は受け取り済みにできない", async () => {
		const { db, eventId, circleId, menuId, userId } = await seed();
		const otherUserId = uid("usr");
		await db.insert(eventUser).values({ id: otherUserId, eventId, displayId: 2 });
		const { orderId } = await insertOrder(db, { circleId, userId, menuId, status: "ready" });

		const res = await request(`/api/orders/user/${otherUserId}/${orderId}/received`, { method: "POST" });
		expect(res.status).toBe(404);
		const saved = await db.select().from(order).where(eq(order.id, orderId));
		expect(saved[0]?.receivedAt).toBeNull();
	});

	it("受け取り可能になる前の注文は状態を変更できない", async () => {
		const { db, circleId, menuId, userId } = await seed();
		const { orderId } = await insertOrder(db, { circleId, userId, menuId, status: "preparing" });

		const res = await request(`/api/orders/user/${userId}/${orderId}/received`, { method: "POST" });
		expect(res.status).toBe(409);
		const saved = await db.select().from(order).where(eq(order.id, orderId));
		expect(saved[0]?.status).toBe("preparing");
		expect(saved[0]?.receivedAt).toBeNull();
	});
});
