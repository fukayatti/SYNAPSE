import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Menu, X, ChevronDown, User, LogOut, Shield, Calendar, Building2, Globe } from "lucide-react";
import { PRODUCT_NAME } from "@fesflow/config";
import {
  useAuth,
  clearAuthInfo,
  hasPermission,
  useMySpaces,
  saveAuthInfo,
} from "@/hooks/useCircleAuth";

export default function Header() {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const { role, userName, circleName, isLoading, isAuthenticated, isEventAdmin, userEmail } =
    useAuth();
  const { data: spaces } = useMySpaces();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const handleLogout = () => {
    clearAuthInfo();
    localStorage.removeItem("circleName");
    localStorage.removeItem("eventName");
    toast.success("ログアウトしました");
    setProfileModalOpen(false);
    setMobileOpen(false);
    navigate("/login");
  };

  const getAvailableSpaces = () => {
    if (!spaces) return [];
    const list: Array<{
      id: string;
      type: "system" | "event" | "circle";
      name: string;
      role: string;
      circleId?: string | null;
      eventId?: string | null;
    }> = [];

    spaces.forEach((m: any) => {
      if (["super_admin"].includes(m.role)) {
        list.push({
          id: m.id,
          type: "system",
          name: "システム管理",
          role: m.role,
        });
      } else if (m.eventId && !m.circleId) {
        list.push({
          id: m.id,
          type: "event",
          name: m.event?.eventName || `イベント: ${m.eventId}`,
          role: m.role,
          eventId: m.eventId,
        });
      } else if (m.circleId) {
        list.push({
          id: m.id,
          type: "circle",
          name: m.circle?.name || `サークル: ${m.circleId}`,
          role: m.role,
          circleId: m.circleId,
          eventId: m.eventId,
        });
      }
    });
    return list;
  };

  const handleSwitchSpace = (space: any) => {
    const email = userEmail || "";
    const name = userName || null;

    if (space.type === "system") {
      saveAuthInfo({
        circleId: null,
        eventId: null,
        userEmail: email,
        userName: name,
        role: space.role,
        membershipId: space.id,
        circleName: null,
        isEventAdmin: true,
      });
      toast.success(`システム管理へ切り替えました`);
      navigate("/admin/dashboard");
    } else if (space.type === "event") {
      saveAuthInfo({
        circleId: null,
        eventId: space.eventId,
        userEmail: email,
        userName: name,
        role: space.role,
        membershipId: space.id,
        circleName: null,
        isEventAdmin: true,
      });
      toast.success(`イベント [${space.name}] の管理者へ切り替えました`);
      navigate("/event/dashboard");
    } else if (space.type === "circle") {
      saveAuthInfo({
        circleId: space.circleId,
        eventId: space.eventId,
        userEmail: email,
        userName: name,
        role: space.role,
        membershipId: space.id,
        circleName: space.name,
        isEventAdmin: false,
      });
      toast.success(`店舗 [${space.name}] へ切り替えました`);
      navigate("/circle/dashboard");
    }
    setProfileModalOpen(false);
    setMobileOpen(false);
  };

  // 表示中パスに基づく名前空間の特定
  const isVisitorView = pathname.startsWith("/visitor");
  const isCircleView = pathname.startsWith("/circle");
  const isEventView = pathname.startsWith("/event");
  const isAdminView = pathname.startsWith("/admin");

  // デフォルトナビゲーションリンクの決定
  let links: Array<{ to: string; label: string }> = [];

  if (isVisitorView || (!isAuthenticated && !role)) {
    links = [
      { to: "/visitor/menu", label: "メニュー" },
      { to: "/visitor/my-qr", label: "マイQR" },
    ];
  } else if (isAdminView && role === "super_admin") {
    links = [
      { to: "/admin/dashboard", label: "システム管理" },
    ];
  } else if (isEventView && (role === "event_manager" || role === "super_admin")) {
    links = [
      { to: "/event/dashboard", label: "イベント管理" },
    ];
  } else if (isCircleView && (role === "circle_manager" || role === "circle_staff" || role === "super_admin" || role === "event_manager")) {
    links = [
      { to: "/circle/dashboard", label: "ダッシュボード" },
      ...(hasPermission(role, "order:write", isEventAdmin) ? [{ to: "/circle/register", label: "レジ" }] : []),
      ...(hasPermission(role, "order:read", isEventAdmin) ? [{ to: "/circle/backyard", label: "厨房" }] : []),
    ];
  }

  const isActive = (to: string) => {
    return pathname.startsWith(to);
  };

  const getRoleTag = () => {
    if (!role) return "VISITOR";
    switch (role) {
      case "super_admin": return "SUPER ADMIN";
      case "event_manager": return "EVENT MGR";
      case "circle_manager": return "CIRCLE MGR";
      case "circle_staff": return "STAFF";
      default: return "USER";
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background border-b-[3px] border-border text-foreground font-mono">
      <div className="flex items-center justify-between px-4 py-2 max-w-7xl mx-auto gap-4">
        {/* ロゴ / ブランド */}
        <Link
          to={isVisitorView ? "/visitor/menu" : "/"}
          className="font-headline text-base sm:text-lg md:text-xl uppercase tracking-[2px] leading-none select-none hover:opacity-80 flex items-center gap-2 shrink-0"
        >
          <span className="font-black border-[2px] border-border px-2 py-1 bg-primary text-primary-foreground text-sm sm:text-base">
            {PRODUCT_NAME.toUpperCase()}
            {isVisitorView && " // VISITOR"}
            {isCircleView && " // BOOTH"}
            {isEventView && " // EVENT"}
            {isAdminView && " // SYSTEM"}
          </span>
        </Link>

        {/* デスクトップナビゲーション */}
        <nav className="hidden md:flex items-center gap-1 font-headline text-[13px] uppercase tracking-[1px]">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
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

        {/* アカウント制御セクション */}
        <div className="flex items-center gap-2 shrink-0">
          {isAuthenticated && !isLoading ? (
            <div className="relative">
              {/* プロフィールボタン (ログアウトは隠してここをクリックするとモーダル表示) */}
              <button
                onClick={() => setProfileModalOpen(!profileModalOpen)}
                className="flex items-center gap-2 bg-muted border-[2.5px] border-border px-3 py-1.5 font-mono text-[11px] font-bold hover:bg-muted/80 select-none cursor-pointer"
              >
                <User className="h-3.5 w-3.5" />
                <span className="hidden sm:inline truncate max-w-[80px]">
                  {circleName || userName || "スタッフ"}
                </span>
                <span className="bg-primary text-primary-foreground px-1 py-0.5 text-[8px] font-black scale-90">
                  {getRoleTag()}
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/login")}
              className="h-8 text-xs font-mono px-3"
            >
              ログイン
            </Button>
          )}

          {/* ハンバーガーメニュー (モバイルのみ) */}
          {links.length > 0 && (
            <button
              className="md:hidden flex items-center justify-center w-10 h-10 border-[3px] border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground transition-all"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? "メニューを閉じる" : "メニューを開く"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* モバイルドロワー */}
      {mobileOpen && links.length > 0 && (
        <div className="md:hidden bg-background border-t-[3px] border-border">
          <nav className="flex flex-col">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
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
        </div>
      )}

      {/* ===== プロフィール ＆ スペース切り替えポップアップモーダル (2026-07-04) ===== */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/75 p-4 backdrop-blur-sm">
          {/* モーダルコンテナ */}
          <div className="relative w-full max-w-md border-heavy border-border bg-background p-6 shadow-none font-mono">
            {/* クローズボタン */}
            <button
              onClick={() => setProfileModalOpen(false)}
              className="absolute right-4 top-4 w-8 h-8 border-thick border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all"
            >
              <X className="h-4 w-4" />
            </button>

            {/* ヘッダー */}
            <div className="mb-6 border-b-thick border-border pb-3 flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-black uppercase tracking-wider">[アカウント管理]</h2>
            </div>

            {/* ユーザー情報 */}
            <div className="space-y-4 mb-6 bg-muted/30 p-4 border-thick border-border">
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">ログインユーザー</span>
                <p className="font-bold text-sm">{userName || "スタッフ"}</p>
                <p className="text-xs text-muted-foreground">{userEmail}</p>
              </div>

              <div className="space-y-1 pt-2 border-t border-border/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">現在のアクティブロール</span>
                  <p className="font-bold text-xs">
                    {circleName ? `店舗管理者 [${circleName}]` : role === "super_admin" ? "システム最高管理者" : role === "event_manager" ? "イベント管理者" : "一般スタッフ"}
                  </p>
                </div>
                <span className="bg-primary text-primary-foreground text-[9px] font-black px-2 py-0.5 uppercase shrink-0">
                  {getRoleTag()}
                </span>
              </div>
            </div>

            {/* スペース切り替え */}
            {getAvailableSpaces().length > 1 && (
              <div className="space-y-3 mb-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">[スペースを切り替える]</h3>
                <div className="max-h-48 overflow-y-auto space-y-1 border-thick border-border p-2 bg-background">
                  {getAvailableSpaces().map((space) => (
                    <button
                      key={space.id}
                      onClick={() => handleSwitchSpace(space)}
                      className="w-full text-left p-2 hover:bg-primary hover:text-primary-foreground transition-all block border-b border-border/10 last:border-b-0 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-black uppercase tracking-wider">
                        {space.type === "system" && <Shield className="h-3 w-3" />}
                        {space.type === "event" && <Calendar className="h-3 w-3" />}
                        {space.type === "circle" && <Building2 className="h-3 w-3" />}
                        {space.type.toUpperCase()} | {space.role}
                      </div>
                      <div className="text-xs font-bold truncate mt-0.5">{space.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* アクションボタン */}
            <div className="space-y-2 border-t border-border/20 pt-4">
              <Button
                variant="destructive"
                className="w-full h-12 border-thick border-border rounded-none flex items-center justify-center gap-2 uppercase font-black"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                ログアウト
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
