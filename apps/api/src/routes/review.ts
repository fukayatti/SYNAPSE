import { Hono } from "hono";
import { z } from "zod";
import { and, avg, count, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { circle, circleVisit, eventUser, order, review, wristband, type DB } from "@fesflow/db";
import { zBody } from "../z-validator";
import { apiError } from "../http-error";
import { hasPermission } from "../utils/auth";
import type { AppEnv } from "../types";

const reviewRoutes = new Hono<AppEnv>();

type ReviewPublicationSettings = {
  publishReviews: boolean;
  showAverageRating: boolean;
  showStars: boolean;
  showComments: boolean;
};

const HIDDEN_REVIEW_PUBLICATION: ReviewPublicationSettings = {
  publishReviews: false,
  showAverageRating: false,
  showStars: false,
  showComments: false,
};

// 2026-10-21: サークル設定JSONは部分保存されるため、欠損・不正値はすべて非公開へ倒す。
function parseReviewPublication(settings: string): ReviewPublicationSettings {
  try {
    const publication = JSON.parse(settings)?.reviewPublication;
    return {
      publishReviews: publication?.publishReviews === true,
      showAverageRating: publication?.showAverageRating === true,
      showStars: publication?.showStars === true,
      showComments: publication?.showComments === true,
    };
  } catch {
    return HIDDEN_REVIEW_PUBLICATION;
  }
}

async function listPublicStoreReviewSummaries(db: DB, eventId: string) {
  const stores = await db.select({ circleId: circle.id, circleName: circle.name, settings: circle.settings })
    .from(circle)
    .where(and(eq(circle.eventId, eventId), isNull(circle.deletedAt)))
    .orderBy(circle.name);
  const publicStores = stores.flatMap((store) => {
    const publication = parseReviewPublication(store.settings);
    return publication.publishReviews ? [{ ...store, publication }] : [];
  });
  const averageCircleIds = publicStores.filter((store) => store.publication.showAverageRating).map((store) => store.circleId);
  const averages = averageCircleIds.length > 0
    ? await db.select({ circleId: review.circleId, averageRating: avg(review.rating), reviewCount: count(review.id) })
      .from(review).where(inArray(review.circleId, averageCircleIds)).groupBy(review.circleId)
    : [];
  const ratings = averageCircleIds.length > 0
    ? await db.select({ circleId: review.circleId, rating: review.rating, count: count(review.id) })
      .from(review).where(inArray(review.circleId, averageCircleIds)).groupBy(review.circleId, review.rating)
    : [];
  const averageByCircle = new Map(averages.map((row) => [row.circleId, row]));
  const distributionByCircle = new Map<string, number[]>(averageCircleIds.map((id) => [id, [0, 0, 0, 0, 0]]));
  for (const row of ratings) {
    const distribution = distributionByCircle.get(row.circleId);
    if (distribution && row.rating >= 1 && row.rating <= 5) distribution[row.rating - 1] = row.count;
  }

  return publicStores.map(({ circleId, circleName, publication }) => {
    const showAverageRating = publication.showAverageRating;
    const average = averageByCircle.get(circleId);
    return {
      circleId,
      circleName,
      showAverageRating,
      // 平均を隠す設定では件数や内訳も返さず、合計値から評価を推測できないようにする。
      averageRating: showAverageRating && average?.averageRating != null ? Number(average.averageRating) : null,
      reviewCount: showAverageRating ? (average?.reviewCount ?? 0) : 0,
      ratingDistribution: showAverageRating ? (distributionByCircle.get(circleId) ?? [0, 0, 0, 0, 0]) : [0, 0, 0, 0, 0],
    };
  });
}

async function getStoreReviewPublication(db: DB, eventId: string, circleId: string) {
  const store = await db.select({ settings: circle.settings }).from(circle).where(and(
    eq(circle.id, circleId), eq(circle.eventId, eventId), isNull(circle.deletedAt),
  ));
  return store[0] ? parseReviewPublication(store[0].settings) : null;
}

async function resolveVisitor(db: DB, code: string) {
  // 2026-09-27: review code は来場者IDでも検索できるため、バンド状態に加えてアカウント停止も両経路で確認する。
  const bands = await db.select({ id: eventUser.id, eventId: eventUser.eventId })
    .from(wristband)
    .innerJoin(eventUser, eq(wristband.userId, eventUser.id))
    .where(and(
      eq(wristband.id, code),
      or(eq(wristband.status, "active"), eq(wristband.status, "smartphone")),
      eq(eventUser.status, "available"),
    ));
  if (bands[0]) return bands[0];
  const users = await db.select({ id: eventUser.id, eventId: eventUser.eventId })
    .from(eventUser).where(and(eq(eventUser.id, code), eq(eventUser.status, "available")));
  return users[0] ?? null;
}

// 2026-10-21: 未登録来場者も下見できる公開一覧は、イベント内の店舗設定で公開範囲を絞る。
reviewRoutes.get("/public/events/:eventId/stores", async (c) => {
  const db = c.get("db");
  return c.json(await listPublicStoreReviewSummaries(db, c.req.param("eventId")));
});

reviewRoutes.get("/public/events/:eventId/stores/:circleId/reviews", async (c) => {
  const db = c.get("db");
  const { eventId, circleId } = c.req.param();
  const publication = await getStoreReviewPublication(db, eventId, circleId);
  // 2026-10-21: 非公開店舗と存在しない店舗は同じ空応答にし、IDの有無を公開しない。
  if (!publication?.publishReviews) return c.json({ reviewCount: 0, showStars: false, showComments: false, reviews: [] });

  const showStars = publication.showStars;
  const showComments = publication.showComments;
  if (!showStars && !showComments) {
    const totals = publication.showAverageRating
      ? await db.select({ reviewCount: count(review.id) }).from(review).where(eq(review.circleId, circleId))
      : [];
    return c.json({ reviewCount: totals[0]?.reviewCount ?? 0, showStars, showComments, reviews: [] });
  }

  const rows = await db.select({ rating: review.rating, comment: review.comment, createdAt: review.createdAt })
    .from(review).where(eq(review.circleId, circleId)).orderBy(desc(review.createdAt));
  return c.json({
    // 平均公開を切っている場合は件数も返さず、公開設定の境界を一貫させる。
    reviewCount: publication.showAverageRating ? rows.length : 0,
    showStars,
    showComments,
    reviews: rows.map((row) => ({
      rating: showStars ? row.rating : null,
      comment: showComments ? row.comment : null,
      createdAt: row.createdAt,
    })),
  });
});

// 2026-10-16: 利用候補と自身の投稿状態はこのAPIで返し、店舗集計と匿名レビュー一覧は別APIに分ける。
reviewRoutes.get("/visitor/:code", async (c) => {
  const db = c.get("db");
  const visitor = await resolveVisitor(db, c.req.param("code"));
  if (!visitor) return c.json([]);
  const userId = visitor.id;

  const visits = await db.select({ circleId: circleVisit.circleId })
    .from(circleVisit).where(and(eq(circleVisit.eventUserId, userId), isNull(circleVisit.deletedAt)));
  // 2026-10-22: 購入利用履歴として扱う注文は会計済みに限り、未会計注文だけではレビュー候補にしない。
  const completedOrders = await db.select({ circleId: order.circleId }).from(order).where(and(
    eq(order.userId, userId), eq(order.paymentStatus, "paid"), ne(order.status, "cancelled"), or(eq(order.status, "completed"), eq(order.completed, true)),
  ));
  const circleIds = [...new Set([...visits.map((visit) => visit.circleId), ...completedOrders.map((item) => item.circleId)])];
  if (circleIds.length === 0) return c.json([]);

  const visitedCircles = await db.select({ id: circle.id, name: circle.name })
    // 2026-09-27: 利用履歴の不整合があっても別イベントのサークルを投稿候補に出さない。
    .from(circle).where(and(inArray(circle.id, circleIds), eq(circle.eventId, visitor.eventId), isNull(circle.deletedAt)));
  const ownReviews = await db.select({ circleId: review.circleId, rating: review.rating, comment: review.comment })
    .from(review).where(eq(review.eventUserId, userId));
  const reviewByCircle = new Map(ownReviews.map((item) => [item.circleId, { rating: item.rating, comment: item.comment }]));
  const visited = new Set(circleIds);
  return c.json(visitedCircles.filter((item) => visited.has(item.id)).map((item) => ({
    circleId: item.id,
    circleName: item.name,
    review: reviewByCircle.get(item.id) ?? null,
  })));
});

// 2026-10-21: 既存の来場者用APIも公開設定を適用し、古い画面/API経由で非公開レビューが漏れないようにする。
reviewRoutes.get("/visitor/:code/stores", async (c) => {
  const db = c.get("db");
  const visitor = await resolveVisitor(db, c.req.param("code"));
  if (!visitor) return c.json([]);

  return c.json(await listPublicStoreReviewSummaries(db, visitor.eventId));
});

reviewRoutes.get("/visitor/:code/stores/:circleId", async (c) => {
  const db = c.get("db");
  const visitor = await resolveVisitor(db, c.req.param("code"));
  if (!visitor) return c.json([]);
  const circleId = c.req.param("circleId");
  const publication = await getStoreReviewPublication(db, visitor.eventId, circleId);
  if (!publication?.publishReviews || (!publication.showStars && !publication.showComments)) return c.json([]);

  // 2026-10-16: 店舗選択後は来場者同士で参考にできるレビューを匿名表示し、来場者IDや表示IDを公開しない。
  const rows = await db.select({ rating: review.rating, comment: review.comment, createdAt: review.createdAt })
    .from(review)
    .where(eq(review.circleId, circleId))
    .orderBy(desc(review.createdAt));
  return c.json(rows.map((row) => ({
    rating: publication.showStars ? row.rating : null,
    comment: publication.showComments ? row.comment : null,
    createdAt: row.createdAt,
  })));
});

reviewRoutes.post("/visitor/:code", zBody(z.object({
  circleId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
})), async (c) => {
  const db = c.get("db");
  const visitor = await resolveVisitor(db, c.req.param("code"));
  if (!visitor) apiError("NOT_FOUND", "来場者が見つかりません");
  const userId = visitor.id;
  const { circleId, rating, comment } = c.req.valid("json");
  const circleRow = await db.select({ id: circle.id, eventId: circle.eventId })
    .from(circle).where(and(eq(circle.id, circleId), isNull(circle.deletedAt)));
  if (!circleRow[0]) apiError("NOT_FOUND", "サークルが見つかりません");
  if (visitor.eventId !== circleRow[0].eventId) apiError("FORBIDDEN", "このサークルへのレビュー投稿権限がありません");

  // 2026-10-22: 体験ログまたは会計済みの完了注文をサーバで照合し、未会計では投稿資格を与えない。
  const visits = await db.select({ id: circleVisit.id }).from(circleVisit).where(and(
    eq(circleVisit.eventUserId, userId), eq(circleVisit.circleId, circleId), isNull(circleVisit.deletedAt),
  ));
  const completedOrders = await db.select({ id: order.id }).from(order).where(and(
    eq(order.userId, userId), eq(order.circleId, circleId), eq(order.paymentStatus, "paid"), ne(order.status, "cancelled"), or(eq(order.status, "completed"), eq(order.completed, true)),
  ));
  if (visits.length === 0 && completedOrders.length === 0) apiError("FORBIDDEN", "利用履歴のあるサークルにのみレビューできます");

  // 2026-09-27: 同じ来場者の再投稿は既存の1件を更新し、DBの一意制約と整合させる。
  await db.insert(review).values({ eventUserId: userId, circleId, rating, comment: comment || null })
    .onConflictDoUpdate({ target: [review.eventUserId, review.circleId], set: { rating, comment: comment || null } });
  return c.json({ success: true });
});

reviewRoutes.get("/circle/:circleId", async (c) => {
  const db = c.get("db");
  const circleId = c.req.param("circleId");
  if (!(await hasPermission(c, circleId, "sales:read"))) apiError("FORBIDDEN", "レビューを閲覧する権限がありません");
  const rows = await db.select({ rating: review.rating, comment: review.comment, createdAt: review.createdAt, displayId: eventUser.displayId })
    .from(review).innerJoin(eventUser, eq(review.eventUserId, eventUser.id))
    .where(eq(review.circleId, circleId)).orderBy(review.createdAt);
  return c.json(rows);
});

reviewRoutes.get("/event/:eventId", async (c) => {
  const db = c.get("db");
  const eventId = c.req.param("eventId");
  if (!(await hasPermission(c, null, "sales:read", eventId))) apiError("FORBIDDEN", "レビューを閲覧する権限がありません");
  const rows = await db.select({ circleId: review.circleId, circleName: circle.name, rating: review.rating, comment: review.comment, createdAt: review.createdAt, displayId: eventUser.displayId })
    .from(review).innerJoin(eventUser, eq(review.eventUserId, eventUser.id)).innerJoin(circle, eq(review.circleId, circle.id))
    .where(eq(circle.eventId, eventId)).orderBy(review.createdAt);
  return c.json(rows);
});

export default reviewRoutes;
