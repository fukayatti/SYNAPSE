import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import {
  db,
  membership,
  ROLE_PERMISSIONS,
  type RoleType,
} from "@fesflow/db";
import { eq, and, or, sql } from "drizzle-orm";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

// 権限チェックヘルパー関数
function hasPermission(role: RoleType, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] as readonly string[];
  return permissions?.includes(permission) ?? false;
}

// ロールベースのプロシージャを作成するファクトリー関数
export function createRoleBasedProcedure(requiredPermission: string) {
  return t.procedure.use(async ({ ctx, next }) => {
    // セッションからユーザー情報を取得
    if (!ctx.session?.user?.email) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const userEmail = ctx.session.user.email;

    // メンバーシップを取得
    const memberships = await db
      .select()
      .from(membership)
      .where(
        and(eq(membership.userEmail, userEmail), eq(membership.isActive, true))
      );

    if (memberships.length === 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No active membership found",
      });
    }

    // 最も高い権限を持つロールを使用
    const roleHierarchy: Record<string, number> = {
      event_admin: 100,
      circle_manager: 80,
      stock_manager: 60,
      cashier: 50,
      kitchen_staff: 50,
      waiter: 40,
      viewer: 10,
    };

    const highestMembership = memberships.reduce((highest, m) => {
      return (roleHierarchy[m.role] ?? 0) > (roleHierarchy[highest.role] ?? 0)
        ? m
        : highest;
    }, memberships[0]!);

    // 権限チェック
    if (
      !hasPermission(highestMembership.role as RoleType, requiredPermission)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission denied: ${requiredPermission} required`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
        membership: highestMembership,
        role: highestMembership.role as RoleType,
      },
    });
  });
}

// サークル固有の権限チェック用プロシージャ
export function createCircleRoleBasedProcedure(requiredPermission: string) {
  return t.procedure
    .input((val: unknown) => {
      if (typeof val !== "object" || val === null || !("circleId" in val)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "circleId is required",
        });
      }
      return val as { circleId: string };
    })
    .use(async ({ ctx, input, next }) => {
      // セッションからユーザー情報を取得
      if (!ctx.session?.user?.email) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Authentication required",
        });
      }

      const userEmail = ctx.session.user.email;
      const circleId = (input as { circleId: string }).circleId;

      // サークル固有のメンバーシップを取得
      const memberships = await db
        .select()
        .from(membership)
        .where(
          and(
            eq(membership.userEmail, userEmail),
            eq(membership.isActive, true),
            or(
              eq(membership.circleId, circleId),
              // イベント管理者はすべてのサークルにアクセス可能
              sql`${membership.eventId} IS NOT NULL`
            )
          )
        );

      if (memberships.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No membership found for this circle",
        });
      }

      // 最も高い権限を持つロールを使用
      const roleHierarchy: Record<string, number> = {
        event_admin: 100,
        circle_manager: 80,
        stock_manager: 60,
        cashier: 50,
        kitchen_staff: 50,
        waiter: 40,
        viewer: 10,
      };

      const highestMembership = memberships.reduce((highest, m) => {
        return (roleHierarchy[m.role] ?? 0) > (roleHierarchy[highest.role] ?? 0)
          ? m
          : highest;
      }, memberships[0]!);

      // 権限チェック
      if (
        !hasPermission(highestMembership.role as RoleType, requiredPermission)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Permission denied: ${requiredPermission} required`,
        });
      }

      return next({
        ctx: {
          ...ctx,
          session: ctx.session,
          membership: highestMembership,
          role: highestMembership.role as RoleType,
          circleId,
        },
      });
    });
}
