import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { circle, event, eventUser, membership, menu, order, orderRefund, userStamp } from "@fesflow/db";
import { postJson, request, testDb, uid } from "./helpers";

const USER_AGENT = "OpenAI File Downloader, XaiImageApiFetch/1.0";

function extractCookieHeader(res: Response): string {
  const raw =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
  return raw.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function seed() {
  const db = testDb();
  const eventId = uid("settlement-event");
  const circleId = uid("settlement-circle");
  const userId = uid("settlement-visitor");
  const menuId = uid("settlement-menu");
  const email = `${uid("settlement-staff")}@example.com`;
  const signUp = await postJson("/api/auth/sign-up/email", {
    email,
    password: "correct-horse-battery-staple",
    name: "会計テスト担当",
  }, { "User-Agent": USER_AGENT });
  expect(signUp.status).toBeLessThan(400);
  const cookie = extractCookieHeader(signUp);

  await db.insert(event).values({
    id: eventId,
    eventName: "モバイル注文会計テスト",
    paymentMethods: JSON.stringify(["現金", "PayPay"]),
  });
  await db.insert(circle).values({
    id: circleId,
    eventId,
    name: "会計テスト店舗",
    settings: JSON.stringify({ mobileOrderEnabled: true, acceptedPayments: ["現金", "PayPay"] }),
  });
  await db.insert(eventUser).values({ id: userId, eventId, displayId: 1 });
  await db.insert(menu).values({
    id: menuId,
    circleId,
    name: "テスト商品",
    price: 500,
    imagePath: "",
    inventoryEnabled: true,
    stockQuantity: 5,
  });
  const membershipId = uid("settlement-membership");
  await db.insert(membership).values({
    id: membershipId,
    userEmail: email.toLowerCase(),
    userName: "会計テスト担当",
    circleId,
    eventId,
    role: "circle_manager",
    isActive: true,
  });

  const staffHeaders = {
    Cookie: cookie,
    "X-Active-Membership-Id": membershipId,
    "User-Agent": USER_AGENT,
  };
  const eventManagerMembershipId = uid("settlement-event-manager-membership");
  const eventManagerEmail = `${uid("settlement-event-manager")}@example.com`;
  const eventManagerSignUp = await postJson("/api/auth/sign-up/email", {
    email: eventManagerEmail,
    password: "correct-horse-battery-staple",
    name: "イベント精算テスト担当",
  }, { "User-Agent": USER_AGENT });
  expect(eventManagerSignUp.status).toBeLessThan(400);
  const eventManagerCookie = extractCookieHeader(eventManagerSignUp);
  await db.insert(membership).values({
    id: eventManagerMembershipId,
    userEmail: eventManagerEmail.toLowerCase(),
    userName: "イベント精算テスト担当",
    eventId,
    role: "event_manager",
    isActive: true,
  });
  const eventManagerHeaders = {
    Cookie: eventManagerCookie,
    "X-Active-Membership-Id": eventManagerMembershipId,
    "User-Agent": USER_AGENT,
  };
  return { db, eventId, circleId, userId, menuId, staffHeaders, eventManagerHeaders, email };
}

async function createMobileOrder(fixture: Awaited<ReturnType<typeof seed>>) {
  const response = await postJson("/api/orders/mobile", {
    circleId: fixture.circleId,
    userId: fixture.userId,
    peopleCount: 1,
    items: [{ menuId: fixture.menuId, quantity: 1 }],
  }, {
    "User-Agent": USER_AGENT,
    "Idempotency-Key": uid("mobile-order-key"),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string; orderNumber: string };
}

describe("モバイル注文の店頭会計", () => {
  it("未会計一覧から既存注文を一度だけ会計し、在庫と注文を増やさない", async () => {
    const fixture = await seed();
    const created = await createMobileOrder(fixture);
    const mobileOrder = (await fixture.db.select().from(order).where(eq(order.id, created.id)))[0]!;
    expect(mobileOrder.source).toBe("mobile");
    expect(mobileOrder.paymentStatus).toBe("unpaid");
    expect(mobileOrder.paymentMethod).toBeNull();
    expect(mobileOrder.paidAt).toBeNull();
    expect((await fixture.db.select().from(menu).where(eq(menu.id, fixture.menuId)))[0]!.stockQuantity).toBe(4);

    const listPath = `/api/orders/mobile/unpaid?circleId=${encodeURIComponent(fixture.circleId)}&userId=${encodeURIComponent(fixture.userId)}`;
    expect((await request(listPath, { headers: { "User-Agent": USER_AGENT } })).status).toBe(403);
    const list = await request(listPath, { headers: fixture.staffHeaders });
    expect(list.status).toBe(200);
    const unpaid = await list.json() as Array<{ id: string; items: unknown[]; paymentStatus: string }>;
    expect(unpaid).toHaveLength(1);
    expect(unpaid[0]).toMatchObject({ id: created.id, paymentStatus: "unpaid" });
    expect(unpaid[0]!.items).toHaveLength(1);
    const visitorHistory = await request(`/api/orders/user/${fixture.userId}`, { headers: { "User-Agent": USER_AGENT } });
    expect(visitorHistory.status).toBe(200);
    expect(await visitorHistory.json()).toMatchObject([{ id: created.id, paymentStatus: "unpaid" }]);

    const statusResponse = await request(`/api/orders/${created.id}/status`, {
      method: "PATCH",
      headers: { ...fixture.staffHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "preparing" }),
    });
    expect(statusResponse.status).toBe(200);
    expect(await fixture.db.select().from(userStamp).where(and(
      eq(userStamp.userId, fixture.userId), eq(userStamp.circleId, fixture.circleId),
    ))).toHaveLength(0);

    const settlePath = `/api/orders/${created.id}/settle`;
    const concurrent = await Promise.all([
      postJson(settlePath, { paymentMethod: "現金", cashierId: "forged@example.com" }, fixture.staffHeaders),
      postJson(settlePath, { paymentMethod: "PayPay", cashierId: "forged@example.com" }, fixture.staffHeaders),
    ]);
    expect(concurrent.map((response) => response.status)).toEqual([200, 200]);
    const outcomes = await Promise.all(concurrent.map((response) => response.json() as Promise<{ alreadyPaid: boolean }>));
    expect(outcomes.filter((outcome) => !outcome.alreadyPaid)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.alreadyPaid)).toHaveLength(1);

    const settled = (await fixture.db.select().from(order).where(eq(order.id, created.id)))[0]!;
    expect(settled.paymentStatus).toBe("paid");
    expect(settled.cashierId).toBe(fixture.email);
    expect(["現金", "PayPay"]).toContain(settled.paymentMethod);
    expect(settled.paidAt).toBeInstanceOf(Date);
    expect(settled.status).toBe("preparing");
    expect(await fixture.db.select().from(userStamp).where(and(
      eq(userStamp.userId, fixture.userId), eq(userStamp.circleId, fixture.circleId),
    ))).toHaveLength(1);
    expect(await fixture.db.select().from(order).where(eq(order.circleId, fixture.circleId))).toHaveLength(1);
    expect((await fixture.db.select().from(menu).where(eq(menu.id, fixture.menuId)))[0]!.stockQuantity).toBe(4);
    const afterPayment = await request(listPath, { headers: fixture.staffHeaders });
    expect(await afterPayment.json()).toEqual([]);
  });

  it("許可外の支払い方法では未会計のまま残す", async () => {
    const fixture = await seed();
    const created = await createMobileOrder(fixture);
    const response = await postJson(`/api/orders/${created.id}/settle`, {
      paymentMethod: "金券",
    }, fixture.staffHeaders);
    expect(response.status).toBe(400);
    const unchanged = (await fixture.db.select().from(order).where(eq(order.id, created.id)))[0]!;
    expect(unchanged.paymentStatus).toBe("unpaid");
    expect(unchanged.paymentMethod).toBeNull();
    expect(unchanged.paidAt).toBeNull();
  });

  it("日次精算は注文受付日ではなく店頭会計日に計上する", async () => {
    const fixture = await seed();
    const created = await createMobileOrder(fixture);
    await fixture.db.update(order).set({ createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(order.id, created.id));

    const settleResponse = await postJson(`/api/orders/${created.id}/settle`, {
      paymentMethod: "現金",
    }, fixture.staffHeaders);
    expect(settleResponse.status).toBe(200);

    const dateInJst = (time: number) => new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const paidDate = dateInJst(Date.now());
    const previousDate = dateInJst(Date.parse(`${paidDate}T00:00:00+09:00`) - 24 * 60 * 60 * 1000);
    const todayClose = await request(`/api/festivals/${fixture.eventId}/daily-close?date=${paidDate}`, {
      headers: fixture.eventManagerHeaders,
    });
    const previousClose = await request(`/api/festivals/${fixture.eventId}/daily-close?date=${previousDate}`, {
      headers: fixture.eventManagerHeaders,
    });
    expect(todayClose.status).toBe(200);
    expect(previousClose.status).toBe(200);
    const todayTotals = await todayClose.json() as { totals: { orders: number; revenue: number } };
    const previousTotals = await previousClose.json() as { totals: { orders: number; revenue: number } };
    expect(todayTotals.totals).toMatchObject({ orders: 1, revenue: 500 });
    expect(previousTotals.totals).toMatchObject({ orders: 0, revenue: 0 });
  });

  it("返金記録のない旧取消注文を会計売上や返金へ推定計上しない", async () => {
    const fixture = await seed();
    const created = await createMobileOrder(fixture);
    await fixture.db.update(order).set({
      status: "cancelled",
      paymentStatus: "paid",
      paymentMethod: "現金",
      paidAt: new Date(),
    }).where(eq(order.id, created.id));

    const date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dailyClose = await request(`/api/festivals/${fixture.eventId}/daily-close?date=${date}`, {
      headers: fixture.eventManagerHeaders,
    });
    expect(dailyClose.status).toBe(200);
    const dailyCloseBody = await dailyClose.json() as { totals: Record<string, number> };
    expect(dailyCloseBody.totals).toMatchObject({
      orders: 0,
      grossRevenue: 0,
      refundOrders: 0,
      refundAmount: 0,
      revenue: 0,
    });

    const analyticsResponse = await request(`/api/festivals/${fixture.eventId}/analytics`, {
      headers: fixture.eventManagerHeaders,
    });
    expect(analyticsResponse.status).toBe(200);
    const analytics = await analyticsResponse.json() as { totals: Record<string, number> };
    expect(analytics.totals).toMatchObject({
      orders: 0,
      grossRevenue: 0,
      refundOrders: 0,
      refundAmount: 0,
      revenue: 0,
    });
  });

  it("支払済み注文は返金確認なしでは取消できず、全額返金と取消を一度だけ記録する", async () => {
    const fixture = await seed();
    const created = await createMobileOrder(fixture);
    const settleResponse = await postJson(`/api/orders/${created.id}/settle`, {
      paymentMethod: "現金",
    }, fixture.staffHeaders);
    expect(settleResponse.status).toBe(200);

    const statusPath = `/api/orders/${created.id}/status`;
    const unconfirmed = await request(statusPath, {
      method: "PATCH",
      headers: { ...fixture.staffHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    expect(unconfirmed.status).toBe(400);
    expect((await fixture.db.select().from(order).where(eq(order.id, created.id)))[0]!.paymentStatus).toBe("paid");
    expect(await fixture.db.select().from(orderRefund).where(eq(orderRefund.orderId, created.id))).toHaveLength(0);

    const cancelled = await request(statusPath, {
      method: "PATCH",
      headers: { ...fixture.staffHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", refundConfirmed: true }),
    });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      success: true,
      refund: { amount: 500 },
    });

    const savedOrder = (await fixture.db.select().from(order).where(eq(order.id, created.id)))[0]!;
    expect(savedOrder).toMatchObject({ status: "cancelled", paymentStatus: "refunded" });
    const refunds = await fixture.db.select().from(orderRefund).where(eq(orderRefund.orderId, created.id));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      amount: 500,
      originalPaymentMethod: "現金",
      refundedBy: fixture.email,
    });
    expect(refunds[0]!.refundedAt).toBeInstanceOf(Date);

    const duplicateCancellation = await request(statusPath, {
      method: "PATCH",
      headers: { ...fixture.staffHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", refundConfirmed: true }),
    });
    expect(duplicateCancellation.status).toBe(409);
    const completeCancelled = await postJson(`/api/orders/${created.id}/complete`, {}, fixture.staffHeaders);
    expect(completeCancelled.status).toBe(409);
    expect((await fixture.db.select().from(order).where(eq(order.id, created.id)))[0]!.status).toBe("cancelled");
    expect(await fixture.db.select().from(orderRefund).where(eq(orderRefund.orderId, created.id))).toHaveLength(1);

    const staffOrders = await request(`/api/orders?circleId=${encodeURIComponent(fixture.circleId)}`, {
      headers: fixture.staffHeaders,
    });
    expect(await staffOrders.json()).toMatchObject([{ id: created.id, refund: { amount: 500, refundedBy: fixture.email } }]);
    const visitorHistory = await request(`/api/orders/user/${fixture.userId}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    expect(await visitorHistory.json()).toMatchObject([{ id: created.id, status: "cancelled", paymentStatus: "refunded" }]);

    // 2026-10-22: 返金日は入金日から独立させ、日次締めと開催後分析で両方照合できることを確認する。
    const now = Date.now();
    const yesterday = now - 24 * 60 * 60 * 1000;
    await fixture.db.update(order).set({ paidAt: new Date(yesterday) }).where(eq(order.id, created.id));
    await fixture.db.update(orderRefund).set({ refundedAt: new Date(now) }).where(eq(orderRefund.orderId, created.id));
    const jstDate = (time: number) => new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const salesDay = await request(`/api/festivals/${fixture.eventId}/daily-close?date=${jstDate(yesterday)}`, {
      headers: fixture.eventManagerHeaders,
    });
    const refundDay = await request(`/api/festivals/${fixture.eventId}/daily-close?date=${jstDate(now)}`, {
      headers: fixture.eventManagerHeaders,
    });
    const salesDayBody = await salesDay.json() as { totals: Record<string, number> };
    const refundDayBody = await refundDay.json() as { totals: Record<string, number> };
    expect(salesDayBody.totals).toMatchObject({
      orders: 1,
      grossRevenue: 500,
      refundOrders: 0,
      refundAmount: 0,
      revenue: 500,
    });
    expect(refundDayBody.totals).toMatchObject({
      orders: 0,
      grossRevenue: 0,
      refundOrders: 1,
      refundAmount: 500,
      revenue: -500,
    });

    const analyticsResponse = await request(`/api/festivals/${fixture.eventId}/analytics`, {
      headers: fixture.eventManagerHeaders,
    });
    const analytics = await analyticsResponse.json() as {
      totals: Record<string, number>;
      refundBreakdown: Array<{ method: string; orders: number; amount: number }>;
      byHour: Array<{ refunds: number }>;
    };
    expect(analytics.totals).toMatchObject({ grossRevenue: 500, refundOrders: 1, refundAmount: 500, revenue: 0 });
    expect(analytics.refundBreakdown).toMatchObject([{ method: "現金", orders: 1, amount: 500 }]);
    expect(analytics.byHour.reduce((sum: number, row: { refunds: number }) => sum + row.refunds, 0)).toBe(500);
  });

  it("未会計注文の取消は返金記録を作らず、既存の会計と競合しても取消済み有料注文を作らない", async () => {
    const fixture = await seed();
    const created = await createMobileOrder(fixture);
    const cancelPath = `/api/orders/${created.id}/status`;
    const [cancelResponse, settleResponse] = await Promise.all([
      request(cancelPath, {
        method: "PATCH",
        headers: { ...fixture.staffHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      }),
      postJson(`/api/orders/${created.id}/settle`, { paymentMethod: "現金" }, fixture.staffHeaders),
    ]);

    expect([200, 400, 409]).toContain(cancelResponse.status);
    expect([200, 409]).toContain(settleResponse.status);
    const current = (await fixture.db.select().from(order).where(eq(order.id, created.id)))[0]!;
    expect(
      (current.status === "cancelled" && current.paymentStatus === "unpaid") ||
      (current.status !== "cancelled" && current.paymentStatus === "paid"),
    ).toBe(true);
    expect(await fixture.db.select().from(orderRefund).where(eq(orderRefund.orderId, created.id))).toHaveLength(0);
  });
});
