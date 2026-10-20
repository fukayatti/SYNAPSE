import { Link, useLocation } from "react-router-dom";
import { PRODUCT_NAME } from "@fesflow/config";
import { QrCode, Receipt, Ticket, UtensilsCrossed } from "lucide-react";
import { useVisitor } from "@/hooks/useVisitor";
import { ConnectionStatusBanner } from "@/components/ConnectionStatus";

// 2026-10-16: モバイルでも行き先が分かるよう、ナビ項目はアイコンだけにせず名称を表示する。
export default function VisitorHeader() {
  const { pathname } = useLocation();
  const { isEntered, session } = useVisitor();

  const links = [
    { to: "/visitor/events", label: "お店", icon: UtensilsCrossed, match: ["/visitor/events", "/visitor/menu"] },
    { to: "/visitor/mypage", label: "マイQR", icon: QrCode, match: ["/visitor/mypage", "/visitor/account"] },
    { to: "/visitor/stamps", label: "スタンプ", icon: Ticket, match: ["/visitor/stamps"] },
    { to: "/visitor/orders", label: "注文", icon: Receipt, match: ["/visitor/orders"] },
  ];

  const isActive = (matchPaths: string[]) => matchPaths.some((path) => pathname.startsWith(path));

  return (
    <header className="sticky top-0 z-50 border-b-thick border-border bg-background text-foreground font-mono">
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
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
