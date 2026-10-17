// 2026-10-17: 店頭会計で使う割引はクーポン配布と分離し、注文操作権限の範囲で管理する。
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulidx";
import { discount } from "@fesflow/db";
import { hasPermission } from "../utils/auth";
import { apiError } from "../http-error";
import { zBody } from "../z-validator";
import type { AppEnv } from "../types";

const discountRoutes = new Hono<AppEnv>();
const createDiscountSchema = z.object({
  title: z.string().trim().min(1).max(100),
  kind: z.enum(["percentage", "amount"]),
  value: z.number().int().positive(),
}).refine((input) => input.kind !== "percentage" || input.value <= 100, {
  path: ["value"],
  message: "割引率は1〜100％で指定してください",
});

discountRoutes.get("/circle/:circleId", async (c) => {
  const circleId = c.req.param("circleId");
  if (!(await hasPermission(c, circleId, "discount:read"))) {
    apiError("FORBIDDEN", "割引を閲覧する権限がありません");
  }
  const db = c.get("db");
  const rows = await db.select().from(discount)
    .where(eq(discount.circleId, circleId))
    .orderBy(desc(discount.createdAt));
  return c.json(rows);
});

discountRoutes.get("/circle/:circleId/register-options", async (c) => {
  const circleId = c.req.param("circleId");
  if (!(await hasPermission(c, circleId, "order:write"))) {
    apiError("FORBIDDEN", "レジを操作する権限がありません");
  }
  const db = c.get("db");
  const rows = await db.select({
    id: discount.id,
    title: discount.title,
    kind: discount.kind,
    value: discount.value,
  }).from(discount)
    .where(and(eq(discount.circleId, circleId), eq(discount.status, "active")))
    .orderBy(desc(discount.createdAt));
  return c.json(rows.filter((item) => item.kind === "percentage" || item.kind === "amount"));
});

discountRoutes.post("/circle/:circleId", zBody(createDiscountSchema), async (c) => {
  const circleId = c.req.param("circleId");
  if (!(await hasPermission(c, circleId, "discount:write"))) {
    apiError("FORBIDDEN", "割引を作成する権限がありません");
  }
  const input = c.req.valid("json");
  const db = c.get("db");
  const id = ulid();
  await db.insert(discount).values({
    id,
    circleId,
    title: input.title,
    kind: input.kind,
    value: input.value,
    status: "active",
  });
  const rows = await db.select().from(discount).where(eq(discount.id, id)).limit(1);
  return c.json(rows[0], 201);
});

discountRoutes.post("/:id/disable", async (c) => {
  const db = c.get("db");
  const rows = await db.select().from(discount).where(eq(discount.id, c.req.param("id"))).limit(1);
  const existing = rows[0];
  if (!existing) apiError("NOT_FOUND", "割引が見つかりません");
  if (!(await hasPermission(c, existing.circleId, "discount:write"))) {
    apiError("FORBIDDEN", "割引を変更する権限がありません");
  }
  await db.update(discount).set({ status: "disabled" }).where(eq(discount.id, existing.id));
  return c.json({ success: true });
});

export default discountRoutes;
