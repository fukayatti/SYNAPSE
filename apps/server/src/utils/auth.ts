import { auth } from "@fesflow/auth";
import { db, membership } from "@fesflow/db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { Context } from "hono";
import { ROLE_PERMISSIONS, type Permission } from "@fesflow/db";

export async function getSession(c: Context) {
  return await auth.api.getSession({
    headers: c.req.raw.headers,
  });
}


export async function getAdminSession(c: Context) {
  // Better Auth からセッションを取得
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session || !session.user) {
    return null;
  }

  const email = session.user.email;
  const initialAdminEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL;

  // 初期管理者メールアドレスに一致する場合、自動昇格/登録チェック
  if (initialAdminEmail && email.toLowerCase() === initialAdminEmail.toLowerCase()) {
    const existing = await db
      .select()
      .from(membership)
      .where(
        and(
          eq(membership.userEmail, email),
          eq(membership.role, "event_admin"),
          eq(membership.isActive, true)
        )
      );

    if (existing.length === 0) {
      // event_admin としてメンバーシップを自動作成
      await db.insert(membership).values({
        id: nanoid(),
        userEmail: email,
        userName: session.user.name || "Super Admin",
        role: "event_admin",
        isActive: true,
      });
    }
    return session;
  }

  // データベースから event_admin 権限を持っているかチェック
  const adminMembership = await db
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.userEmail, email),
        eq(membership.role, "event_admin"),
        eq(membership.isActive, true)
      )
    );

  if (adminMembership.length === 0) {
    return null;
  }

  return session;
}

export async function hasPermission(
  c: Context,
  circleId: string,
  requiredPermission: Permission
): Promise<boolean> {
  const session = await getSession(c);
  if (!session || !session.user) return false;

  const email = session.user.email;

  // Check if they are event_admin (either via INITIAL_SUPER_ADMIN_EMAIL or db)
  const adminSession = await getAdminSession(c);
  if (adminSession) {
    return true; // event_admin has all permissions
  }

  // Check specific circle membership
  const members = await db
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.userEmail, email),
        eq(membership.circleId, circleId),
        eq(membership.isActive, true)
      )
    );

  if (members.length === 0) return false;

  // Check permissions based on role
  const role = members[0]!.role as keyof typeof ROLE_PERMISSIONS;
  if (!role || !ROLE_PERMISSIONS[role]) return false;

  const permissions = ROLE_PERMISSIONS[role];
  return (permissions as readonly string[]).includes(requiredPermission);
}
