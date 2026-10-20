import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  circle,
  event,
  eventUser,
  membership,
  menu,
  menuTopping,
  order,
  orderItem,
  orderItemTopping,
  preOrder,
  preOrderItem,
  preOrderItemTopping,
  topping,
} from "@fesflow/db";
import { postJson, request, testDb, uid } from "./helpers";

function extractCookieHeader(res: Response): string {
  const raw =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
  return raw.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function seedToppingManager() {
  const email = `${uid("toppingmgr")}@example.com`;
  const signUp = await postJson("/api/auth/sign-up/email", {
    email,
    password: "correct-horse-battery-staple",
    name: "サークル代表",
  });
  expect(signUp.status).toBeLessThan(400);

  const db = testDb();
  const eventId = uid("ev");
  const circleId = uid("ci");
  const membershipId = uid("mem");
  const menuId = uid("me");
  const toppingId = uid("top");
  const eventUserId = uid("usr");

  await db.insert(event).values({ id: eventId, eventName: uid("テスト学園祭") });
  await db.insert(circle).values({ id: circleId, eventId, name: uid("テスト模擬店") });
  await db.insert(eventUser).values({ id: eventUserId, eventId, displayId: 1 });
  await db.insert(membership).values({
    id: membershipId,
    userEmail: email.toLowerCase(),
    userName: "サークル代表",
    circleId,
    role: "circle_manager",
    isActive: true,
  });
  await db.insert(menu).values({
    id: menuId,
    circleId,
    name: "テストやきそば",
    price: 500,
    imagePath: "dummy.png",
    soldOut: false,
  });
  await db.insert(topping).values({
    id: toppingId,
    circleId,
    name: "大盛り",
    price: 100,
    soldOut: false,
  });
  await db.insert(menuTopping).values({
    id: uid("mt"),
    menuId,
    toppingId,
  });

  return {
    db,
    circleId,
    eventUserId,
    menuId,
    toppingId,
    headers: {
      Cookie: extractCookieHeader(signUp),
      "X-Active-Membership-Id": membershipId,
    },
  };
}

describe("商品を使用停止", () => {
  it("注文履歴があるトッピングを使用停止し、参照と履歴を保つ", async () => {
    const { db, circleId, eventUserId, menuId, toppingId, headers } = await seedToppingManager();
    const orderId = uid("ord");
    const orderItemId = uid("oi");
    await db.insert(order).values({
      id: orderId,
      userId: eventUserId,
      circleId,
      orderNumber: uid("num"),
      peopleCount: 1,
      totalPrice: 600,
      status: "completed",
      completed: true,
    });
    await db.insert(orderItem).values({
      id: orderItemId,
      orderId,
      menuId,
      menuName: "テストやきそば",
      menuPrice: 500,
      quantity: 1,
    });
    await db.insert(orderItemTopping).values({
      id: uid("oit"),
      orderItemId,
      toppingId,
      toppingName: "大盛り",
      toppingPrice: 100,
    });

    const response = await request(`/api/toppings/${toppingId}`, {
      method: "DELETE",
      headers,
    });

    expect(response.status).toBe(200);
    const archivedTopping = await db.select().from(topping).where(eq(topping.id, toppingId));
    expect(archivedTopping).toHaveLength(1);
    expect(archivedTopping[0]!.isArchived).toBe(true);
    expect((await db.select().from(menuTopping).where(eq(menuTopping.toppingId, toppingId)))).toHaveLength(1);
    expect((await db.select().from(orderItemTopping).where(eq(orderItemTopping.toppingId, toppingId)))).toHaveLength(1);
    const listedToppings = await (await request(`/api/toppings?circleId=${circleId}`, { headers })).json() as Array<{ id: string }>;
    expect(listedToppings).toHaveLength(0);
  });

  it("事前注文で使われているトッピングも使用停止し、履歴を保つ", async () => {
    const { db, circleId, eventUserId, menuId, toppingId, headers } = await seedToppingManager();
    const preOrderId = uid("preorder");
    const preOrderItemId = uid("preorderitem");
    await db.insert(preOrder).values({
      id: preOrderId,
      userId: eventUserId,
      circleId,
      totalPrice: 600,
      status: "pending",
    });
    await db.insert(preOrderItem).values({
      id: preOrderItemId,
      preOrderId,
      menuId,
      quantity: 1,
    });
    await db.insert(preOrderItemTopping).values({
      id: uid("preorderitemtopping"),
      preOrderItemId,
      toppingId,
      toppingName: "大盛り",
      toppingPrice: 100,
    });

    const response = await request(`/api/toppings/${toppingId}`, {
      method: "DELETE",
      headers,
    });

    expect(response.status).toBe(200);
    const archivedTopping = await db.select().from(topping).where(eq(topping.id, toppingId));
    expect(archivedTopping).toHaveLength(1);
    expect(archivedTopping[0]!.isArchived).toBe(true);
    expect((await db.select().from(menuTopping).where(eq(menuTopping.toppingId, toppingId)))).toHaveLength(1);
    expect((await db.select().from(preOrderItemTopping).where(eq(preOrderItemTopping.toppingId, toppingId)))).toHaveLength(1);
  });

  it("履歴に使われていないトッピングも使用停止状態として残す", async () => {
    const { db, toppingId, headers } = await seedToppingManager();

    const response = await request(`/api/toppings/${toppingId}`, {
      method: "DELETE",
      headers,
    });

    expect(response.status).toBe(200);
    const archivedTopping = await db.select().from(topping).where(eq(topping.id, toppingId));
    expect(archivedTopping).toHaveLength(1);
    expect(archivedTopping[0]!.isArchived).toBe(true);
    expect((await db.select().from(menuTopping).where(eq(menuTopping.toppingId, toppingId)))).toHaveLength(1);
  });

  it("注文履歴のあるメニューも使用停止し、注文参照を保つ", async () => {
    const { db, circleId, eventUserId, menuId, headers } = await seedToppingManager();
    const orderId = uid("ord");
    const orderItemId = uid("oi");
    await db.insert(order).values({
      id: orderId,
      userId: eventUserId,
      circleId,
      orderNumber: uid("num"),
      peopleCount: 1,
      totalPrice: 500,
      status: "completed",
      completed: true,
    });
    await db.insert(orderItem).values({
      id: orderItemId,
      orderId,
      menuId,
      menuName: "テストやきそば",
      menuPrice: 500,
      quantity: 1,
    });

    const response = await request(`/api/menus/${menuId}`, { method: "DELETE", headers });

    expect(response.status).toBe(200);
    const archivedMenu = await db.select().from(menu).where(eq(menu.id, menuId));
    expect(archivedMenu).toHaveLength(1);
    expect(archivedMenu[0]!.isArchived).toBe(true);
    expect((await db.select().from(orderItem).where(eq(orderItem.menuId, menuId)))).toHaveLength(1);
    const listedMenus = await (await request(`/api/menus?circleId=${circleId}`, { headers })).json() as Array<{ id: string }>;
    expect(listedMenus).toHaveLength(0);
  });
});
