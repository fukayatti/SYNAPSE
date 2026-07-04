"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Menu, X } from "lucide-react";
import {
  useAuth,
  clearAuthInfo,
  hasPermission,
} from "@/hooks/useCircleAuth";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, userName, circleName, isLoading, isAuthenticated, isEventAdmin } =
    useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    clearAuthInfo();
    localStorage.removeItem("circleName");
    localStorage.removeItem("eventName");
    toast.success("ログアウトしました");
    router.push("/circle-login");
    setMobileOpen(false);
  };

  const allLinks: Array<{
    to: "/" | "/menu" | "/my-order" | "/register" | "/backyard" | "/dashboard" | "/admin";
    label: string;
    permission: string | null;
  }> = [
    { to: "/menu", label: "メニュー", permission: null },
    { to: "/my-order", label: "マイQR", permission: null },
    { to: "/register", label: "レジ", permission: "order:write" },
    { to: "/backyard", label: "厨房", permission: "order:read" },
    { to: "/dashboard", label: "ダッシュボード", permission: "circle:read" },
    { to: "/admin", label: "管理", permission: "event:write" },
  ];

  const isClientView = pathname.startsWith("/menu") || pathname.startsWith("/my-order");

  const links = isClientView
    ? [
        { to: "/menu" as const, label: "メニュー" },
        { to: "/my-order" as const, label: "マイQR" },
      ]
    : allLinks.filter(
        (link) => link.permission === null || hasPermission(role, link.permission, isEventAdmin)
      );

  const isActive = (to: string) => {
    if (to === "/") return pathname === "/";
    return pathname.startsWith(to);
  };

  return (
    <header className="sticky top-0 z-50 bg-background border-b-[3px] border-border text-foreground">
      {/* メインバー */}
      <div className="flex items-center justify-between px-4 py-2 max-w-7xl mx-auto gap-4">
        {/* ロゴ */}
        <Link
          href={isClientView ? "/menu" : "/"}
          className="font-headline text-base sm:text-lg md:text-xl uppercase tracking-[2px] leading-none select-none hover:opacity-80 flex items-center gap-2 shrink-0"
          onClick={() => setMobileOpen(false)}
        >
          <span className="font-black border-[2px] border-border px-2 py-1 bg-primary text-primary-foreground text-sm sm:text-base">
            {isClientView ? "FES_ORDER // CLIENT" : "FES_ORDER"}
          </span>
        </Link>

        {/* デスクトップナビ */}
        <nav className="hidden md:flex items-center gap-1 font-headline text-[13px] uppercase tracking-[1px]">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              href={to}
              className={`px-3 py-1.5 border-[2px] border-border transition-all whitespace-nowrap ${
                isActive(to)
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-background text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* 右サイド */}
        <div className="flex items-center gap-2 shrink-0">
          {/* ユーザー名（デスクトップのみ） */}
          {!isClientView && isAuthenticated && !isLoading && (
            <div className="hidden md:flex items-center gap-1.5 font-mono text-[11px]">
              <span className="bg-muted border-[1.5px] border-border px-2 py-1 font-bold">
                {circleName || userName || "スタッフ"}
              </span>
            </div>
          )}

          {/* ログイン/ログアウトボタン（デスクトップのみ） */}
          {!isClientView && (
            <div className="hidden md:block">
              {isAuthenticated ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="h-8 text-xs font-mono px-3"
                >
                  ログアウト
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/circle-login")}
                  className="h-8 text-xs font-mono px-3"
                >
                  ログイン
                </Button>
              )}
            </div>
          )}

          {/* ハンバーガーボタン（モバイルのみ） */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 border-[3px] border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground transition-all"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? "メニューを閉じる" : "メニューを開く"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* モバイルドロワー */}
      {mobileOpen && (
        <div className="md:hidden bg-background border-t-[3px] border-border">
          {/* ユーザー情報 */}
          {!isClientView && isAuthenticated && !isLoading && (
            <div className="px-4 py-3 border-b-[2px] border-border bg-muted">
              <span className="font-mono text-[12px] uppercase tracking-[1px] font-bold">
                {circleName || userName || "スタッフ"}
              </span>
            </div>
          )}

          {/* ナビリンク */}
          <nav className="flex flex-col">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                href={to}
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-4 border-b-[2px] border-border font-headline text-[14px] uppercase tracking-[1px] transition-all ${
                  isActive(to)
                    ? "bg-primary text-primary-foreground font-bold"
                    : "bg-background text-foreground hover:bg-muted"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* ログイン/ログアウト */}
          {!isClientView && (
            <div className="p-4">
              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="w-full py-3 border-[3px] border-border bg-background text-foreground font-mono text-sm uppercase tracking-widest font-bold hover:bg-primary hover:text-primary-foreground transition-all"
                >
                  ログアウト
                </button>
              ) : (
                <button
                  onClick={() => {
                    router.push("/circle-login");
                    setMobileOpen(false);
                  }}
                  className="w-full py-3 border-[3px] border-border bg-primary text-primary-foreground font-mono text-sm uppercase tracking-widest font-bold hover:bg-background hover:text-foreground transition-all"
                >
                  ログイン
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
