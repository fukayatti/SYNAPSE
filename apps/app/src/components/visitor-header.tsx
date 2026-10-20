import { Link, useLocation } from "react-router-dom";
import { PRODUCT_NAME } from "@fesflow/config";
import { QrCode, Receipt, Ticket, UtensilsCrossed } from "lucide-react";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { visitorApi } from "@/lib/api";
import { useVisitor } from "@/hooks/useVisitor";
import { ConnectionStatusBanner } from "@/components/ConnectionStatus";

// 2026-10-16: モバイルでも行き先が分かるよう、ナビ項目はアイコンだけにせず名称を表示する。
export default function VisitorHeader() {
  const { pathname } = useLocation();
  const { isEntered, session, userId } = useVisitor();
  const notificationQuery = useQuery({
    queryKey: ["visitorNotifications", userId],
    queryFn: () => visitorApi.notifications(userId!),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
    retry: false,
  });
  const unreadCount = notificationQuery.data?.filter((item) => !item.readAt).length ?? 0;

  const links = [
    { to: "/visitor/events", label: "お店", icon: UtensilsCrossed, match: ["/visitor/events", "/visitor/menu"] },
    { to: "/visitor/mypage", label: "マイQR", icon: QrCode, match: ["/visitor/mypage", "/visitor/account"] },
    { to: "/visitor/stamps", label: "スタンプ", icon: Ticket, match: ["/visitor/stamps"] },
    { to: "/visitor/orders", label: "注文", icon: Receipt, match: ["/visitor/orders"] },
  ];

  const isActive = (matchPaths: string[]) => matchPaths.some((path) => pathname.startsWith(path));

  return (
    <header className="sticky top-0 z-50 border-b-thick border-border bg-background pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-foreground font-mono">
      {/* 2026-10-21: safe area を確保したヘッダー内に接続状態を置き、PWAでも状態表示を維持する。 */}
      <ConnectionStatusBanner />
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:flex-nowrap sm:px-4">
        <Link
          to="/visitor"
          aria-label={`${PRODUCT_NAME} 来場者トップ`}
          className="flex min-h-10 min-w-0 flex-1 items-center text-sm font-black uppercase tracking-[2px] hover:opacity-80"
        >
          <span className="border-thick border-border bg-primary px-2 py-1 text-primary-foreground">
            {PRODUCT_NAME.toUpperCase()}
          </span>
          {isEntered && session?.displayId != null && (
            <span className="ml-2 border-thin border-border bg-muted px-2 py-1 text-[11px] font-bold">
              来場者 <span className="tabular-nums">#{session.displayId}</span>
            </span>
          )}
        </Link>

        {userId && (
          <Link
            to="/visitor/notifications"
            aria-current={pathname.startsWith("/visitor/notifications") ? "page" : undefined}
            aria-label={unreadCount ? `通知、未読${unreadCount}件` : "通知"}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 border-thick border-border px-2 text-[10px] font-bold ${pathname.startsWith("/visitor/notifications") ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            <span className="relative">
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadCount > 0 && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center border border-background bg-destructive px-1 text-[8px] text-destructive-foreground">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </span>
            <span>通知</span>
          </Link>
        )}

        <nav aria-label="来場者メニュー" className="flex w-full min-w-0 gap-1 sm:ml-auto sm:w-auto sm:justify-end">
          {links.map(({ to, label, icon: Icon, match }) => {
            const active = isActive(match);
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                aria-label={label === "注文" ? "注文履歴" : label}
                className={`flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-thick border-border px-1 py-1 text-center text-[10px] font-bold leading-tight transition-colors sm:flex-initial sm:flex-row sm:gap-1.5 sm:px-2.5 sm:text-xs ${
                  active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="break-words">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
