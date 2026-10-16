import { Hono } from "hono";
import { zBody } from "../z-validator";
import { apiError } from "../http-error";
import { z } from "zod";
import {
  stampRallyRedemption,
  rewardRedemption,
  eventUser,
  wristband,
  event,
  circle,
  order,
  orderItem,
  orderItemTopping,
} from "@fesflow/db";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { ulid } from "ulidx";
import { getSession, hasPermission } from "../utils/auth";
import type { AppEnv } from "../types";

// 2026-07-08 (Phase5): db はモジュール Proxy ではなく c.get("db") で受け取る (ALS撤去)。
const stampRoutes = new Hono<AppEnv>();

type StoreArea = { id: string; name: string };
type LegacyArea = {
  id: string;
  name: string;
  requiredCount: number;
  circleIds: string[];
  rewardTitle?: string;
  rewardDescription?: string;
};
type StampRallyReward = { id: string; name: string; stockQuantity: number | null };
type StampRallySettings = {
  enabled: boolean;
  targetAreaIds: string[];
  requiredCount: number;
  rewardTitle: string;
  rewards: StampRallyReward[];
  redemptionLocation: string;
  rulesUrl: string;
  legacyAreas: LegacyArea[];
};

function parseStoreAreas(raw: string | null | undefined): StoreArea[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((area): area is StoreArea =>
      !!area && typeof area === "object" &&
      typeof area.id === "string" && typeof area.name === "string" && area.name.trim().length > 0
    );
  } catch {
    return [];
  }
}

// 2026-10-15 (#123): 旧 areas[].circleIds 設定を読み取り専用の互換形式として保持する。
// 新しい保存形式は event.storeAreas と circles.settings.storeAreaId から対象を導出する。
function parseStampRallySettings(raw: string | null | undefined): StampRallySettings {
  const defaults: StampRallySettings = {
    enabled: false,
    targetAreaIds: [],
    requiredCount: 3,
    rewardTitle: "景品交換",
    rewards: [{ id: "default", name: "景品交換", stockQuantity: null }],
    redemptionLocation: "",
    rulesUrl: "",
    legacyAreas: [],
  };
  try {
    const value = JSON.parse(raw || "{}") as Record<string, unknown>;
    const legacyAreas = Array.isArray(value.areas)
      ? value.areas.filter((area): area is LegacyArea =>
          !!area && typeof area === "object" &&
          typeof area.id === "string" && typeof area.name === "string" &&
          Number.isInteger(area.requiredCount) && Number(area.requiredCount) > 0 &&
          Array.isArray(area.circleIds) && area.circleIds.every((id: unknown) => typeof id === "string")
        )
      : [];
    const rewardTitle = typeof value.rewardTitle === "string"
      ? value.rewardTitle
      : (legacyAreas[0]?.rewardTitle || defaults.rewardTitle);
    const rewards = Array.isArray(value.rewards)
      ? value.rewards.flatMap((reward): StampRallyReward[] => {
          if (!reward || typeof reward !== "object") return [];
          const item = reward as Record<string, unknown>;
          if (typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim()) return [];
          return [{
            id: item.id,
            name: item.name.trim(),
            stockQuantity: Number.isInteger(item.stockQuantity) && Number(item.stockQuantity) >= 0
              ? Number(item.stockQuantity)
              : null,
          }];
        })
      : [{ id: "default", name: rewardTitle, stockQuantity: null }];
    return {
      enabled: value.enabled === true,
      targetAreaIds: Array.isArray(value.targetAreaIds)
        ? value.targetAreaIds.filter((id): id is string => typeof id === "string")
        : [],
      requiredCount: Number.isInteger(value.requiredCount) && Number(value.requiredCount) > 0
        ? Number(value.requiredCount)
        : (legacyAreas[0]?.requiredCount ?? defaults.requiredCount),
      rewardTitle,
      rewards: rewards.length > 0 ? rewards : [{ id: "default", name: rewardTitle, stockQuantity: null }],
      redemptionLocation: typeof value.redemptionLocation === "string"
        ? value.redemptionLocation
        : (legacyAreas[0]?.rewardDescription || ""),
      rulesUrl: typeof value.rulesUrl === "string" ? value.rulesUrl : "",
      legacyAreas,
    };
  } catch {
    return defaults;
  }
}

function parseCircleStoreAreaId(raw: string | null | undefined): string | null {
  try {
    const settings = JSON.parse(raw || "{}") as { storeAreaId?: unknown };
    return typeof settings.storeAreaId === "string" ? settings.storeAreaId : null;
  } catch {
    return null;
  }
}

async function resolveVisitor(db: AppEnv["Variables"]["db"], eventId: string, code: string) {
  const direct = await db.select({
    id: eventUser.id,
    eventId: eventUser.eventId,
    displayId: eventUser.displayId,
    nickname: eventUser.nickname,
  }).from(eventUser).where(and(
    eq(eventUser.id, code),
    eq(eventUser.eventId, eventId),
    eq(eventUser.status, "available"),
  )).limit(1);
  if (direct[0]) return direct[0];

  const banded = await db.select({
    id: eventUser.id,
    eventId: eventUser.eventId,
    displayId: eventUser.displayId,
    nickname: eventUser.nickname,
  }).from(wristband)
    .innerJoin(eventUser, eq(wristband.userId, eventUser.id))
    .where(and(
      eq(wristband.id, code),
      or(eq(wristband.status, "active"), eq(wristband.status, "smartphone")),
      eq(eventUser.eventId, eventId),
      eq(eventUser.status, "available"),
    )).limit(1);
  return banded[0] ?? null;
}

async function resolveVisitorFromAnyEvent(db: AppEnv["Variables"]["db"], code: string) {
  const direct = await db.select({
    id: eventUser.id,
    eventId: eventUser.eventId,
    displayId: eventUser.displayId,
    nickname: eventUser.nickname,
  }).from(eventUser).where(and(eq(eventUser.id, code), eq(eventUser.status, "available"))).limit(1);
  if (direct[0]) return direct[0];

  const banded = await db.select({
    id: eventUser.id,
    eventId: eventUser.eventId,
    displayId: eventUser.displayId,
    nickname: eventUser.nickname,
  }).from(wristband)
    .innerJoin(eventUser, eq(wristband.userId, eventUser.id))
    .where(and(
      eq(wristband.id, code),
      or(eq(wristband.status, "active"), eq(wristband.status, "smartphone")),
      eq(eventUser.status, "available"),
    )).limit(1);
  return banded[0] ?? null;
}

async function resolveVisitorFromCode(db: AppEnv["Variables"]["db"], code: string) {
  const direct = await db.select({ id: eventUser.id, eventId: eventUser.eventId })
    .from(eventUser).where(and(eq(eventUser.id, code), eq(eventUser.status, "available"))).limit(1);
  if (direct[0]) return direct[0];

  const banded = await db.select({ id: eventUser.id, eventId: eventUser.eventId })
    .from(wristband)
    .innerJoin(eventUser, eq(wristband.userId, eventUser.id))
    .where(and(
      eq(wristband.id, code),
      or(eq(wristband.status, "active"), eq(wristband.status, "smartphone")),
      eq(eventUser.status, "available"),
    )).limit(1);
  return banded[0] ?? null;
}

async function getRallyProgress(db: AppEnv["Variables"]["db"], eventId: string, eventUserId: string) {
  const eventRows = await db.select({
    stampRallySettings: event.stampRallySettings,
    storeAreas: event.storeAreas,
  }).from(event).where(and(eq(event.id, eventId), isNull(event.deletedAt))).limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  const settings = parseStampRallySettings(eventRow.stampRallySettings);
  // 2026-10-16: 1イベント来場者IDを共有する有効な家族バンド数を、世帯の交換上限として扱う。
  const familyRows = await db.select({ count: sql<number>`count(*)` }).from(wristband).where(and(
    eq(wristband.userId, eventUserId),
    or(eq(wristband.status, "active"), eq(wristband.status, "smartphone")),
  ));
  const familyMemberCount = familyRows[0]?.count ?? 0;
  const configuredAreas = parseStoreAreas(eventRow.storeAreas);
  const circles = await db.select({
    id: circle.id,
    name: circle.name,
    iconImagePath: circle.iconImagePath,
    settings: circle.settings,
  }).from(circle).where(and(eq(circle.eventId, eventId), isNull(circle.deletedAt)));
  const circleById = new Map(circles.map((row) => [row.id, row]));

  const validTargetAreaIds = settings.targetAreaIds.filter((id) => configuredAreas.some((area) => area.id === id));
  const hasNewTargeting = validTargetAreaIds.length > 0;
  const useLegacyAreas = !hasNewTargeting && settings.legacyAreas.length > 0;
  const targetCircleIds = hasNewTargeting
    ? circles.filter((row) => validTargetAreaIds.includes(parseCircleStoreAreaId(row.settings) || ""))
        .map((row) => row.id)
    : useLegacyAreas
      ? settings.legacyAreas.flatMap((area) => area.circleIds.filter((id) => circleById.has(id)))
      : [];
  const uniqueTargetCircleIds = [...new Set(targetCircleIds)];
  // 2026-10-15 (#123): 店舗数が多いイベントでもD1の bind 上限を超えないよう、
  // 対象ID一覧を JSON 1引数で渡してSQL側で照合する。
  const targetCircleFilter = sql`${circle.id} in (select value from json_each(${JSON.stringify(uniqueTargetCircleIds)}))`;
  const completedOrders = uniqueTargetCircleIds.length > 0
    ? await db.select({
        id: order.id,
        circleId: order.circleId,
        orderNumber: order.orderNumber,
        completedAt: order.completedAt,
        createdAt: order.createdAt,
      }).from(order).innerJoin(circle, eq(order.circleId, circle.id)).where(and(
        eq(order.userId, eventUserId),
        eq(circle.eventId, eventId),
        isNull(circle.deletedAt),
        targetCircleFilter,
        ne(order.status, "cancelled"),
        or(eq(order.status, "completed"), eq(order.completed, true)),
      ))
    : [];
  const stampedCircleIds = [...new Set(completedOrders.map((row) => row.circleId))];
  const stamped = new Set(stampedCircleIds);

  // 2026-10-15 (#123): スタンプ詳細には注文作成時点のスナップショットを返し、
  // 来場者が各サークルで購入した品目を短いモーダル内で確認できるようにする。
  const completedOrderIds = completedOrders.map((row) => row.id);
  const itemRows = completedOrderIds.length > 0
    ? await db.select({
        id: orderItem.id,
        orderId: orderItem.orderId,
        menuName: orderItem.menuName,
        quantity: orderItem.quantity,
      }).from(orderItem).innerJoin(order, eq(orderItem.orderId, order.id))
        .innerJoin(circle, eq(order.circleId, circle.id)).where(and(
        eq(order.userId, eventUserId),
        eq(circle.eventId, eventId),
        isNull(circle.deletedAt),
        targetCircleFilter,
        ne(order.status, "cancelled"),
        or(eq(order.status, "completed"), eq(order.completed, true)),
      ))
    : [];
  const toppingRows = completedOrderIds.length > 0
    ? await db.select({
        orderItemId: orderItemTopping.orderItemId,
        name: orderItemTopping.toppingName,
      }).from(orderItemTopping)
        .innerJoin(orderItem, eq(orderItemTopping.orderItemId, orderItem.id))
        .innerJoin(order, eq(orderItem.orderId, order.id))
        .innerJoin(circle, eq(order.circleId, circle.id)).where(and(
          eq(order.userId, eventUserId),
          eq(circle.eventId, eventId),
          isNull(circle.deletedAt),
          targetCircleFilter,
          ne(order.status, "cancelled"),
          or(eq(order.status, "completed"), eq(order.completed, true)),
        ))
    : [];
  const toppingsByItem = new Map<string, string[]>();
  for (const row of toppingRows) {
    const toppings = toppingsByItem.get(row.orderItemId) ?? [];
    toppings.push(row.name);
    toppingsByItem.set(row.orderItemId, toppings);
  }
  const itemsByOrder = new Map<string, Array<{ menuName: string; quantity: number; toppings: string[] }>>();
  for (const row of itemRows) {
    const items = itemsByOrder.get(row.orderId) ?? [];
    items.push({ menuName: row.menuName, quantity: row.quantity, toppings: toppingsByItem.get(row.id) ?? [] });
    itemsByOrder.set(row.orderId, items);
  }
  const ordersByCircle = new Map<string, Array<{
    orderNumber: string;
    completedAt: Date | null;
    createdAt: Date;
    items: Array<{ menuName: string; quantity: number; toppings: string[] }>;
  }>>();
  for (const row of completedOrders) {
    const orders = ordersByCircle.get(row.circleId) ?? [];
    orders.push({
      orderNumber: row.orderNumber,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      items: itemsByOrder.get(row.id) ?? [],
    });
    ordersByCircle.set(row.circleId, orders);
  }
  for (const orders of ordersByCircle.values()) {
    orders.sort((a, b) => (b.completedAt ?? b.createdAt).getTime() - (a.completedAt ?? a.createdAt).getTime());
  }

  const circleProgress = (row: typeof circles[number]) => ({
    id: row.id,
    name: row.name,
    iconImagePath: row.iconImagePath,
    stamped: stamped.has(row.id),
    orders: ordersByCircle.get(row.id) ?? [],
  });

  const areas = hasNewTargeting
    ? configuredAreas.filter((area) => validTargetAreaIds.includes(area.id)).map((area) => ({
        id: area.id,
        name: area.name,
        requiredCount: null as number | null,
        circles: circles
          .filter((row) => parseCircleStoreAreaId(row.settings) === area.id)
          .map(circleProgress),
      }))
    : useLegacyAreas
      ? settings.legacyAreas.map((area) => ({
          id: area.id,
          name: area.name,
          requiredCount: area.requiredCount,
          circles: [...new Set(area.circleIds)].flatMap((id) => {
            const row = circleById.get(id);
            return row ? [circleProgress(row)] : [];
          }),
        }))
      : [];

  const isQualified = useLegacyAreas
    ? areas.some((area) => area.circles.filter((item) => item.stamped).length >= (area.requiredCount ?? Infinity))
    : settings.enabled && stampedCircleIds.length >= settings.requiredCount;
  const redemptionTotals = await db.select({
    quantity: sql<number>`coalesce(sum(${stampRallyRedemption.quantity}), 0)`,
  })
    .from(stampRallyRedemption).where(and(
      eq(stampRallyRedemption.eventId, eventId),
      eq(stampRallyRedemption.eventUserId, eventUserId),
    ));
  // 2026-10-15 (#123): 旧形式で既に記録された同じ eventUser ID も引き継ぐ。
  // eventUser IDはイベントごとに別IDのため、他イベントの交換記録は影響しない。
  const legacyRedemptions = (redemptionTotals[0]?.quantity ?? 0) === 0
    ? await db.select({ createdAt: rewardRedemption.createdAt }).from(rewardRedemption)
        .where(eq(rewardRedemption.userId, eventUserId)).limit(1)
    : [];
  const latestRedemptions = redemptionTotals[0]?.quantity
    ? await db.select({ createdAt: stampRallyRedemption.createdAt }).from(stampRallyRedemption).where(and(
        eq(stampRallyRedemption.eventId, eventId),
        eq(stampRallyRedemption.eventUserId, eventUserId),
      )).orderBy(desc(stampRallyRedemption.createdAt)).limit(1)
    : [];
  const redeemedCount = Math.max(redemptionTotals[0]?.quantity ?? 0, legacyRedemptions.length);
  const remainingCount = Math.max(0, familyMemberCount - redeemedCount);

  return {
    enabled: settings.enabled && (hasNewTargeting || useLegacyAreas),
    legacy: useLegacyAreas,
    areas,
    stampedCircleIds,
    stampedCount: stampedCircleIds.length,
    targetCircleCount: uniqueTargetCircleIds.length,
    requiredCount: settings.requiredCount,
    eligible: settings.enabled && isQualified,
    rewardTitle: settings.rewardTitle,
    familyMemberCount,
    redeemedCount,
    remainingCount,
    rewards: settings.rewards,
    redemptionLocation: settings.redemptionLocation,
    rulesUrl: settings.rulesUrl,
    redeemedAt: latestRedemptions[0]?.createdAt ?? legacyRedemptions[0]?.createdAt ?? null,
  };
}

async function getVisitorRally(db: AppEnv["Variables"]["db"], visitor: { id: string; eventId: string }) {
  const progress = await getRallyProgress(db, visitor.eventId, visitor.id);
  return progress ?? {
    enabled: false,
    legacy: false,
    areas: [],
    stampedCircleIds: [],
    stampedCount: 0,
    targetCircleCount: 0,
    requiredCount: 3,
    eligible: false,
    rewardTitle: "景品交換",
    familyMemberCount: 0,
    redeemedCount: 0,
    remainingCount: 0,
    rewards: [],
    redemptionLocation: "",
    rulesUrl: "",
    redeemedAt: null,
  };
}

async function recordRedemption(
  db: AppEnv["Variables"]["db"],
  eventId: string,
  eventUserId: string,
  staffId: string,
  rewardId: string,
  quantity: number,
) {
  const progress = await getRallyProgress(db, eventId, eventUserId);
  if (!progress?.enabled || !progress.eligible) {
    return { error: "この来場者は景品交換の条件を満たしていません" } as const;
  }
  if (quantity > progress.remainingCount) return { error: "家族人数を超える個数は交換できません" } as const;
  const reward = progress.rewards.find((item) => item.id === rewardId) ??
    (rewardId === "default" ? progress.rewards[0] : undefined);
  if (!reward) return { error: "選択された景品は登録されていません" } as const;
  if (reward.stockQuantity !== null) {
    const stockRows = await db.select({ quantity: sql<number>`coalesce(sum(${stampRallyRedemption.quantity}), 0)` })
      .from(stampRallyRedemption).where(and(
        eq(stampRallyRedemption.eventId, eventId),
        eq(stampRallyRedemption.rewardId, reward.id),
      ));
    if ((stockRows[0]?.quantity ?? 0) + quantity > reward.stockQuantity) {
      return { error: "この景品の登録在庫を超える個数は交換できません" } as const;
    }
  }
  const inserted = await db.insert(stampRallyRedemption).values({
    id: ulid(),
    eventId,
    eventUserId,
    staffId,
    rewardId: reward.id,
    rewardName: reward.name,
    quantity,
  }).onConflictDoNothing().returning({ id: stampRallyRedemption.id, createdAt: stampRallyRedemption.createdAt });
  if (inserted.length === 0) return { error: "景品交換を記録できませんでした。再照会してください" } as const;
  return { redemption: inserted[0] } as const;
}

// 来場者のスタンプ。対象エリアはイベント設定、サークルの場所は circle.settings.storeAreaId から解決する。
// 旧 areas[].circleIds 設定は新しい割り当てへ移るまで読み込みを維持する。
stampRoutes.get("/visitor/:code", async (c) => {
  const db = c.get("db");
  const code = c.req.param("code");
  const visitor = await resolveVisitorFromCode(db, code);
  if (!visitor) {
    return c.json({ enabled: false, legacy: false, areas: [], stampedCircleIds: [], stampedCount: 0, targetCircleCount: 0, requiredCount: 3, eligible: false, rewardTitle: "景品交換", familyMemberCount: 0, redeemedCount: 0, remainingCount: 0, rewards: [], redemptionLocation: "", rulesUrl: "", redeemedAt: null });
  }
  return c.json(await getVisitorRally(db, visitor));
});

// イベントスタッフ向け来場者照会。入力は eventUser ID または有効なリストバンドID。
stampRoutes.get("/event/:eventId/lookup/:code", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");
  if (!(await hasPermission(c, null, "event:write", eventId))) {
    apiError("FORBIDDEN", "このイベントの景品交換を扱う権限がありません");
  }
  const visitor = await resolveVisitor(db, eventId, c.req.param("code"));
  if (!visitor) apiError("NOT_FOUND", "このイベントの来場者が見つかりません");
  return c.json({ visitor, progress: await getVisitorRally(db, visitor) });
});

// イベントスタッフ向け景品交換記録。家族枠・景品在庫の残数を確認して数量を記録する。
stampRoutes.post(
  "/event/:eventId/redeem",
  zBody(z.object({
    code: z.string().trim().min(1).max(256),
    rewardId: z.string().trim().min(1).max(64).default("default"),
    quantity: z.number().int().min(1).max(500).default(1),
  })),
  async (c) => {
    const db = c.get("db");
    const eventId = c.req.param("eventId");
    if (!(await hasPermission(c, null, "event:write", eventId))) {
      apiError("FORBIDDEN", "このイベントの景品交換を記録する権限がありません");
    }
    const visitor = await resolveVisitor(db, eventId, c.req.valid("json").code);
    if (!visitor) apiError("NOT_FOUND", "このイベントの来場者が見つかりません");
    const session = await getSession(c);
    if (!session?.user) apiError("FORBIDDEN", "ログインが必要です");
    const input = c.req.valid("json");
    const result = await recordRedemption(db, eventId, visitor.id, session.user.id || session.user.email.toLowerCase(), input.rewardId, input.quantity);
    if ("error" in result && result.error) apiError("BAD_REQUEST", result.error);
    return c.json({ success: true, redemption: result.redemption }, 201);
  },
);

stampRoutes.get("/event/:eventId/redemptions", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");
  if (!(await hasPermission(c, null, "event:write", eventId))) {
    apiError("FORBIDDEN", "このイベントの景品交換記録を閲覧する権限がありません");
  }
  const settingsRows = await db.select({ stampRallySettings: event.stampRallySettings }).from(event)
    .where(and(eq(event.id, eventId), isNull(event.deletedAt))).limit(1);
  const rewards = parseStampRallySettings(settingsRows[0]?.stampRallySettings).rewards;
  const rewardNames = new Map(rewards.map((reward) => [reward.id, reward.name]));
  const summaryRows = await db.select({
    rewardId: stampRallyRedemption.rewardId,
    rewardName: stampRallyRedemption.rewardName,
    quantity: sql<number>`sum(${stampRallyRedemption.quantity})`,
  }).from(stampRallyRedemption).where(eq(stampRallyRedemption.eventId, eventId))
    .groupBy(stampRallyRedemption.rewardId, stampRallyRedemption.rewardName);
  const history = await db.select({
    id: stampRallyRedemption.id,
    createdAt: stampRallyRedemption.createdAt,
    staffId: stampRallyRedemption.staffId,
    eventUserId: eventUser.id,
    displayId: eventUser.displayId,
    nickname: eventUser.nickname,
    rewardId: stampRallyRedemption.rewardId,
    rewardName: stampRallyRedemption.rewardName,
    quantity: stampRallyRedemption.quantity,
  }).from(stampRallyRedemption)
    .innerJoin(eventUser, eq(stampRallyRedemption.eventUserId, eventUser.id))
    .where(eq(stampRallyRedemption.eventId, eventId))
    .orderBy(desc(stampRallyRedemption.createdAt))
    .limit(50);
  // 2026-10-16: 0029以前の交換記録も新しい集計に含め、既存履歴や家族枠を失わない。
  const recordedVisitors = new Set((await db.select({ eventUserId: stampRallyRedemption.eventUserId })
    .from(stampRallyRedemption).where(eq(stampRallyRedemption.eventId, eventId)))
    .map((row) => row.eventUserId));
  const legacyHistory = await db.select({
    id: rewardRedemption.id,
    createdAt: rewardRedemption.createdAt,
    staffId: rewardRedemption.staffId,
    eventUserId: eventUser.id,
    displayId: eventUser.displayId,
    nickname: eventUser.nickname,
  }).from(rewardRedemption).innerJoin(eventUser, eq(rewardRedemption.userId, eventUser.id))
    .where(eq(eventUser.eventId, eventId)).orderBy(desc(rewardRedemption.createdAt));
  const legacyRewardName = rewardNames.get("default") || rewards[0]?.name || "景品交換";
  const summaryByReward = new Map<string, { rewardId: string; rewardName: string; quantity: number }>();
  for (const row of summaryRows) {
    const current = summaryByReward.get(row.rewardId);
    summaryByReward.set(row.rewardId, {
      rewardId: row.rewardId,
      rewardName: row.rewardName || current?.rewardName || rewardNames.get(row.rewardId) || "景品交換",
      quantity: (current?.quantity ?? 0) + row.quantity,
    });
  }
  for (const row of legacyHistory) {
    if (recordedVisitors.has(row.eventUserId)) continue;
    const current = summaryByReward.get("default");
    summaryByReward.set("default", {
      rewardId: "default",
      rewardName: legacyRewardName,
      quantity: (current?.quantity ?? 0) + 1,
    });
  }
  const recentHistory = [
    ...history.map((row) => ({
      ...row,
      rewardName: row.rewardName || rewardNames.get(row.rewardId) || "景品交換",
    })),
    ...legacyHistory.filter((row) => !recordedVisitors.has(row.eventUserId)).map((row) => ({
      ...row,
      id: `legacy-${row.id}`,
      rewardId: "default",
      rewardName: legacyRewardName,
      quantity: 1,
    })),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 50);
  return c.json({
    rewards,
    totalQuantity: [...summaryByReward.values()].reduce((total, row) => total + row.quantity, 0),
    summary: [...summaryByReward.values()],
    history: recentHistory,
  });
});

// 旧APIを利用するクライアント向け互換経路。イベントを来場者IDから特定したうえで
// 同じ event:write 認可・対象条件・イベント単位の一意記録を適用し、旧グローバル表には書かない。
stampRoutes.post(
  "/redeem",
  zBody(z.object({ userId: z.string().trim().min(1).max(256) })),
  async (c) => {
    const db = c.get("db");
    const visitor = await resolveVisitorFromAnyEvent(db, c.req.valid("json").userId);
    if (!visitor) apiError("NOT_FOUND", "来場者が見つかりません");
    if (!(await hasPermission(c, null, "event:write", visitor.eventId))) {
      apiError("FORBIDDEN", "対象イベントの景品交換を扱う権限がありません");
    }
    const session = await getSession(c);
    if (!session?.user) apiError("FORBIDDEN", "ログインが必要です");
    const result = await recordRedemption(db, visitor.eventId, visitor.id, session.user.id || session.user.email.toLowerCase(), "default", 1);
    if ("error" in result && result.error) apiError("BAD_REQUEST", result.error);
    return c.json({ success: true, redemption: result.redemption }, 201);
  },
);

export default stampRoutes;
