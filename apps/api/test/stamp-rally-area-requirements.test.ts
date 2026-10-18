import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { circle, event, eventUser, membership, order } from "@fesflow/db";
import { request, testDb, uid } from "./helpers";

function cookieOf(res: Response): string {
  const raw =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
  return raw.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function signUp() {
  const email = `${uid("stamp-area-owner")}@example.com`;
  const res = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-horse-battery-staple", name: "エリア条件テスト" }),
  });
  expect(res.status).toBeLessThan(400);
  return cookieOf(res);
}

describe("スタンプラリーのエリア別利用条件", () => {
  it("来場者と実績にエリア別の必要数を反映し、すべてのエリア達成で景品対象にする", async () => {
    const cookie = await signUp();
    const db = testDb();
    const eventResponse = await request("/api/festivals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ eventName: uid("エリア別スタンプ祭") }),
    });
    expect(eventResponse.status).toBeLessThan(400);
    const { id: eventId } = (await eventResponse.json()) as { id: string };
    const managers = await db.select().from(membership).where(and(
      eq(membership.eventId, eventId),
      eq(membership.role, "event_manager"),
    ));
    const activeMembershipId = managers[0]!.id;
    const areaA = uid("area-a");
    const areaB = uid("area-b");
    const areaAStores = [uid("area-a-store"), uid("area-a-store")];
    const areaBStore = uid("area-b-store");
    await db.insert(circle).values([
      ...areaAStores.map((id) => ({ id, eventId, name: id, settings: JSON.stringify({ storeAreaId: areaA }) })),
      { id: areaBStore, eventId, name: areaBStore, settings: JSON.stringify({ storeAreaId: areaB }) },
    ]);
    const areas = [{ id: areaA, name: "エリアA" }, { id: areaB, name: "エリアB" }];
    const requiredCountByArea = { [areaA]: 2, [areaB]: 1 };
    await db.update(event).set({
      storeAreas: JSON.stringify(areas),
      stampRallySettings: JSON.stringify({
        enabled: true,
        targetAreaIds: [areaA, areaB],
        requiredCount: 3,
        requiredCountByArea,
        redemptionLocation: "本部",
      }),
    }).where(eq(event.id, eventId));
    const visitorId = uid("event-user");
    await db.insert(eventUser).values({ id: visitorId, eventId, displayId: 1 });

    const addCompletedOrder = (circleId: string) => db.insert(order).values({
      id: uid("order"),
      userId: visitorId,
      circleId,
      orderNumber: uid("order-number"),
      peopleCount: 1,
      totalPrice: 100,
      status: "completed",
      completed: true,
      cashierId: "test",
      paymentMethod: "cash",
    });
    await addCompletedOrder(areaAStores[0]!);
    await addCompletedOrder(areaBStore);

    const visitorUrl = `/api/stamps/visitor/${visitorId}`;
    const progressBefore = (await (await request(visitorUrl)).json()) as {
      eligible: boolean;
      requiredCount: number;
      areas: Array<{ id: string; requiredCount: number | null }>;
    };
    expect(progressBefore.eligible).toBe(false);
    expect(progressBefore.requiredCount).toBe(3);
    expect(progressBefore.areas.map((area) => [area.id, area.requiredCount])).toEqual([[areaA, 2], [areaB, 1]]);

    await addCompletedOrder(areaAStores[1]!);
    const progressAfter = (await (await request(visitorUrl)).json()) as { eligible: boolean };
    expect(progressAfter.eligible).toBe(true);

    const usageResponse = await request(`/api/stamps/event/${eventId}/usage`, {
      headers: { Cookie: cookie, "X-Active-Membership-Id": activeMembershipId },
    });
    expect(usageResponse.status).toBe(200);
    const usage = (await usageResponse.json()) as {
      qualifiedAccountCount: number;
      requiredCountByArea: Record<string, number>;
    };
    expect(usage.qualifiedAccountCount).toBe(1);
    expect(usage.requiredCountByArea).toEqual(requiredCountByArea);
  });
});
