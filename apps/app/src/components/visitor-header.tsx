import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { PRODUCT_NAME } from "@fesflow/config";
import BrandLogo from "@/components/BrandLogo";
import { QrCode, Receipt, Ticket, UtensilsCrossed } from "lucide-react";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { visitorApi } from "@/lib/api";
import { useVisitor } from "@/hooks/useVisitor";
import { useSessionState } from "@/hooks/useSessionState";
import { ConnectionStatusBanner } from "@/components/ConnectionStatus";

// 2026-10-16: モバイルでも行き先が分かるよう、ナビ項目はアイコンだけにせず名称を表示する。
export default function VisitorHeader() {
  const { pathname, search } = useLocation();
  const { isEntered, session, userId } = useVisitor();
  const visitorStateKey = "fesflow:last-visitor-path";
  const [lastShopsPath, setLastShopsPath] = useSessionState<string>(`${visitorStateKey}:shops`, "/visitor/events");
  const [lastMyQrPath, setLastMyQrPath] = useSessionState<string>(`${visitorStateKey}:my-qr`, "/visitor/mypage");
  const notificationQuery = useQuery({
    queryKey: ["visitorNotifications", userId],
    queryFn: () => visitorApi.notifications(userId!),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
    retry: false,
  });
  const unreadCount = notificationQuery.data?.filter((item) => !item.readAt).length ?? 0;

  const visitorArea = visitorNavigationArea(pathname);
  useEffect(() => {
    const lastPath = visitorPathForNavigation(pathname, search);
    if (visitorArea === "shops") setLastShopsPath(lastPath);
    else if (visitorArea === "my-qr") setLastMyQrPath(lastPath);
  }, [pathname, search, setLastMyQrPath, setLastShopsPath, visitorArea]);

  const links = [
    { to: lastShopsPath, label: "お店", icon: UtensilsCrossed, area: "shops" },
    { to: lastMyQrPath, label: "マイQR", icon: QrCode, area: "my-qr" },
    { to: "/visitor/stamps", label: "スタンプ", icon: Ticket, match: ["/visitor/stamps"] },
    { to: "/visitor/orders", label: "注文", icon: Receipt, match: ["/visitor/orders"] },
  ];

  const isActive = (link: typeof links[number]) => "area" in link
    ? visitorArea === link.area
    : link.match.some((path) => pathname.startsWith(path));

  return (
    <header className="sticky top-0 z-50 border-b-thick border-border bg-background pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-foreground font-mono">
      {/* 2026-10-21: safe area を確保したヘッダー内に接続状態を置き、PWAでも状態表示を維持する。 */}
      <ConnectionStatusBanner />
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:flex-nowrap sm:px-4">
        <Link
          to="/visitor"
          aria-label={`${PRODUCT_NAME} 来場者トップ`}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-sm font-black uppercase tracking-[2px] hover:opacity-80"
        >
          {/* 2026-10-22: Keep the visitor navigation on the shared icon-and-name lockup. */}
          <BrandLogo size="small" />
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
          {links.map((link) => {
            const { to, label, icon: Icon } = link;
            const active = isActive(link);
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

// 2026-10-21: タブ移動から戻った時に見ていた店/詳細画面へ戻し、発行などの一回限りの query は保存しない。
function visitorNavigationArea(pathname: string): "shops" | "my-qr" | "stamps" | "orders" | null {
  if (pathname === "/visitor/mypage" || pathname.startsWith("/visitor/account")) return "my-qr";
  if (pathname === "/visitor/stamps") return "stamps";
  if (pathname === "/visitor/orders") return "orders";

  const excludedPaths = [
    "/visitor/onboarding",
    "/visitor/reviews",
    "/visitor/notifications",
    "/visitor/coupon",
    "/visitor/data-use",
  ];
  if (pathname === "/visitor" || excludedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;
  return pathname.startsWith("/visitor/") ? "shops" : null;
}

// 2026-10-21: 戻り先には画面選択に必要なIDだけを残し、発行アクション等の一回限りの query は再実行しない。
function visitorPathForNavigation(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const safeParams = new URLSearchParams();
  for (const key of ["circleId", "eventId"]) {
    const value = params.get(key);
    if (value && /^[A-Za-z0-9_-]{1,128}$/.test(value)) safeParams.set(key, value);
  }
  const query = safeParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
