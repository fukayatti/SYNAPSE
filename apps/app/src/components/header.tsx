import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "./ui/button";
import { toast } from "sonner";
import {
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  User,
  Bell,
  Shield,
  Calendar,
  Building2,
  Plus,
  Settings,
  LogOut,
  Compass,
} from "lucide-react";
import AccountModal from "./account-modal";
import { PRODUCT_NAME } from "@fesflow/config";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, notificationApi, accountApi, systemApi } from "@/lib/api";
import { resolveAssetUrl } from "@/lib/asset-url";
import {
  useAuth,
  clearAuthInfo,
  hasPermission,
  useMySpaces,
  saveAuthInfo,
  getAuthInfo,
} from "@/hooks/useCircleAuth";
import { roleLabel, roleBadge } from "@/lib/roles";
import { authClient } from "@/lib/auth-client";

// 2026-07-07 単一ドメイン化: register の circle/event/sys はすべて同一オリジンの同一SPA。
// 旧来のスタッフ/管理サブドメイン (staff./admin.) 分離とクロスドメイン遷移は撤去した。

// 2026-07-16 モバイルでのヘッダー操作性改善:
// これまで通知/スペース切替/アカウントの各ボタンはアイコンのみ(ラベルは sm: 以上でのみ表示)
// だったため、スマホではアイコンの意味を推測するしかなかった。
// 「ホバーで多段メニューにしてほしい」という要望が来たが、スマホにはホバーが存在しないため
// そのまま実装すると開けなくなる。本質的な要望は「アイコンだけでは操作が分からない」ことなので、
// 以下の方針で作り直す:
//   - すべてのトリガーに常時ラベルを付ける (アイコンのみのボタンを廃止)
//   - 2026-10-07 (#70): 通知/アカウントも全環境でクリック/タップに統一し、意図しないホバー展開をなくす
//   - 開閉状態は単一の activeMenu state に統一し、常に1つしか開かないようにする
//   - 外側クリックは document 全体の mousedown 監視で判定する (フルスクリーンの透明backdrop
//     を使うと、以前のhover判定にも干渉したため廃止した)
//
// モバイルでは通知/組織切り替え/アカウントを1つのメニュートリガーへまとめる。
// 2026-10-20: 親メニューを残して選択行から横へ子ウィンドウを開き、OSメニューと同じ階層を示す。
// 画面幅が足りない場合だけ一覧を詳細ウィンドウに置き換えて、横はみ出しを防ぐ。
type MenuKey = "notif" | "space" | "account" | "nav" | null;
// 3本線メニューで開いている個別ウィンドウ (null = メニュー項目一覧)
type MobileSection = "notif" | "space" | "account" | null;

export default function Header() {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const queryClient = useQueryClient();
  const { role, eventId, userName, circleName, isLoading, isAuthenticated, isEventAdmin, userEmail, membershipAuthorityError, retryAuthorization } =
    useAuth();
  const { data: spaces } = useMySpaces();

  // アカウント自体が super_admin かどうかは「現在アクティブなロール(role)」ではなく
  // 所属(spaces)から判定する。role を基準にすると、super_admin がサークルに切り替えた
  // 瞬間に role=circle_manager となり、システム管理/全イベントのスペースが一覧から
  // 消えて元に戻れなくなる不具合が出るため (2026-07-04 スペース表示の不安定を修正)
  const isAccountSuperAdmin = useMemo(
    () => (spaces ?? []).some((m: any) => m.role === "super_admin"),
    [spaces]
  );

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [dashboardMenuOpen, setDashboardMenuOpen] = useState(false);
  // 通知/スペース切替/アカウント/モバイルナビの4つのメニューは常に1つしか開かない (2026-07-16)
  const [activeMenu, setActiveMenu] = useState<MenuKey>(null);
  const notifOpen = activeMenu === "notif";
  const spaceOpen = activeMenu === "space";
  const accountOpen = activeMenu === "account";
  const mobileNavOpen = activeMenu === "nav";

  // 2026-10-20: モバイルの管理画面切替をFesFlowロゴ横に置くため、ヘッダーと管理メニューの開閉状態を同期する。
  useEffect(() => {
    const syncDashboardMenu = (event: Event) => {
      setDashboardMenuOpen((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener("fesflow:dashboard-menu-state", syncDashboardMenu);
    return () => window.removeEventListener("fesflow:dashboard-menu-state", syncDashboardMenu);
  }, []);

  // 2026-10-20: サブメニューの位置を選択行へ結び付け、親を残せる幅があるかを保持する。
  const [mobileSection, setMobileSection] = useState<MobileSection>(null);
  const [mobileCascadeMode, setMobileCascadeMode] = useState(false);
  const [mobileSubmenuTop, setMobileSubmenuTop] = useState(0);
  const [mobileSubmenuLeft, setMobileSubmenuLeft] = useState(0);
  const [mobileSubmenuWidth, setMobileSubmenuWidth] = useState(0);
  const [mobileSubmenuRowOffset, setMobileSubmenuRowOffset] = useState(0);
  const [mobileSubmenuKeyboardFocus, setMobileSubmenuKeyboardFocus] = useState(false);
  const [mobileFocusReturnSection, setMobileFocusReturnSection] = useState<MobileSection>(null);
  useEffect(() => {
    if (activeMenu !== "nav") {
      setMobileSection(null);
      setMobileCascadeMode(false);
      setMobileSubmenuKeyboardFocus(false);
      setMobileFocusReturnSection(null);
    }
  }, [activeMenu]);

  const isSpaceMenuOpen = spaceOpen || (mobileNavOpen && mobileSection === "space");
  useEffect(() => {
    if (!isSpaceMenuOpen) return;
    // 2026-10-19: パネルを開くたび所属を先に再取得し、直近の削除・権限変更を一覧へ反映する。
    void queryClient.invalidateQueries({ queryKey: ["mySpaces"] });
  }, [isSpaceMenuOpen, queryClient]);

  const notifRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileSubmenuRef = useRef<HTMLElement>(null);

  // クリック(タップ)でのトグル。開閉の基本操作はこれで、タッチ環境ではこれが唯一の操作手段になる。
  const toggleMenu = (key: Exclude<MenuKey, null>) => {
    setActiveMenu((prev) => (prev === key ? null : key));
  };

  const openMobileSection = (
    section: Exclude<MobileSection, null>,
    button: HTMLButtonElement,
    moveFocusToSubmenu = false,
  ) => {
    const menuRect = mobileMenuRef.current?.getBoundingClientRect();
    const navRect = navRef.current?.getBoundingClientRect();
    const rowRect = button.getBoundingClientRect();
    const panelWidth = section === "notif" ? 416 : section === "space" ? 448 : 336;
    const gap = 4;
    const spaceRight = menuRect ? window.innerWidth - menuRect.right : 0;
    const spaceLeft = menuRect?.left ?? 0;
    const opensRight = spaceRight >= panelWidth + gap;
    const canCascade = opensRight || spaceLeft >= panelWidth + gap;

    // 2026-10-20: 十分な幅があれば余裕のある側へ選択行から開き、実際の高さに合わせて上下を収める。
    setMobileSubmenuLeft(menuRect ? (opensRight ? menuRect.right + gap : menuRect.left - panelWidth - gap) : 0);
    setMobileSubmenuWidth(panelWidth);
    setMobileSubmenuTop(rowRect.top);
    setMobileSubmenuRowOffset(menuRect ? rowRect.top - menuRect.top : 0);
    setMobileSubmenuKeyboardFocus(moveFocusToSubmenu);
    setMobileCascadeMode(canCascade);
    setMobileSection(section);
  };

  useEffect(() => {
    if (!mobileNavOpen || !mobileSection) return;
    const repositionSubmenu = () => {
      const navRect = navRef.current?.getBoundingClientRect();
      if (!navRect) return;

      const panelWidth = mobileSection === "notif" ? 416 : mobileSection === "space" ? 448 : 336;
      const rootWidth = Math.min(256, Math.max(0, window.innerWidth - 16));
      const rootRight = navRect.right;
      const rootLeft = rootRight - rootWidth;
      const gap = 4;
      const opensRight = window.innerWidth - rootRight >= panelWidth + gap;
      const canCascade = opensRight || rootLeft >= panelWidth + gap;
      const rootRow = mobileMenuRef.current?.querySelector<HTMLElement>(
        `[data-mobile-menu-section="${mobileSection}"]`,
      );

      setMobileCascadeMode(canCascade);
      if (!canCascade) return;

      // 2026-10-20: 画面回転やリサイズ後も、親項目と子ウィンドウの相対位置を保つ。
      setMobileSubmenuLeft(opensRight ? rootRight + gap : rootLeft - panelWidth - gap);
      setMobileSubmenuWidth(panelWidth);
      const requestedTop = rootRow?.getBoundingClientRect().top ?? navRect.bottom + 8 + mobileSubmenuRowOffset;
      const panelHeight = mobileSubmenuRef.current?.getBoundingClientRect().height ?? 400;
      const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);
      setMobileSubmenuTop(Math.min(Math.max(8, requestedTop), maxTop));
    };

    window.addEventListener("resize", repositionSubmenu);
    return () => window.removeEventListener("resize", repositionSubmenu);
  }, [mobileNavOpen, mobileSection, mobileSubmenuRowOffset]);

  useLayoutEffect(() => {
    if (!mobileNavOpen || !mobileSection || !mobileCascadeMode) return;
    const panelHeight = mobileSubmenuRef.current?.getBoundingClientRect().height;
    if (!panelHeight) return;
    const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);
    setMobileSubmenuTop((current) => Math.min(Math.max(8, current), maxTop));
  }, [mobileNavOpen, mobileSection, mobileCascadeMode]);

  useLayoutEffect(() => {
    if (!mobileNavOpen || !mobileSubmenuKeyboardFocus || !mobileSection) return;
    const firstAction = mobileSubmenuRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstAction?.focus();
    setMobileSubmenuKeyboardFocus(false);
  }, [mobileNavOpen, mobileSection, mobileSubmenuKeyboardFocus]);

  useLayoutEffect(() => {
    if (!mobileNavOpen || mobileSection || !mobileFocusReturnSection) return;
    mobileMenuRef.current
      ?.querySelector<HTMLButtonElement>(`[data-mobile-menu-section="${mobileFocusReturnSection}"]`)
      ?.focus();
    setMobileFocusReturnSection(null);
  }, [mobileNavOpen, mobileSection, mobileFocusReturnSection]);

  // 2026-10-07: ヘッダーメニューは誤展開を防ぎ、マウスとタッチで同じ操作にするためクリックでのみ開閉する。

  // Escape キー / 外側クリックでメニューを閉じる。
  // 以前はメニューごとに fixed inset-0 の透明backdropを敷いて外側クリックを検知していたが、
  // 画面全体を覆うbackdropはDOM上トリガーの子要素になり、メニュー判定を複雑にするため
  // document監視方式に統一した (2026-07-16)。
  useEffect(() => {
    if (!activeMenu) return;
    const refByKey: Record<Exclude<MenuKey, null>, React.RefObject<HTMLDivElement | null>> = {
      notif: notifRef,
      space: spaceRef,
      account: accountRef,
      nav: navRef,
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveMenu(null);
    };
    const onPointerDown = (e: Event) => {
      const container = refByKey[activeMenu].current;
      if (container && !container.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [activeMenu]);

  // ログインユーザーのアカウント情報を取得 (アバター画像用)
  const { data: me } = useQuery({
    queryKey: ["accountMe"],
    queryFn: () => accountApi.me(),
    enabled: isAuthenticated && !!userEmail,
  });

  // 現在のアクティブなスペース名
  const currentSpaceName = useMemo(() => {
    if (role === "super_admin") {
      return "システム管理";
    }
    if (role === "event_manager" || role === "event_staff" || role === "event_wristband_staff" || role === "event_stamp_staff") {
      const space = (spaces ?? []).find((m: any) => m.eventId === eventId && !m.circleId);
      return space?.event?.eventName || localStorage.getItem("eventName") || "イベント管理";
    }
    if (role === "circle_manager" || role === "circle_admin" || role === "circle_staff") {
      const space = (spaces ?? []).find((m: any) => m.circleId === (getAuthInfo()?.circleId ?? null));
      const eventName = space?.event?.eventName;
      const currentCircleName = space?.circle?.name || circleName;
      // 2026-10-19: ヘッダーでも所属イベントとサークルを並べ、同名サークルを区別しやすくする。
      return eventName && currentCircleName
        ? `${eventName} / ${currentCircleName}`
        : currentCircleName || "店舗";
    }
    return role ? roleLabel(role) : "スペース選択";
  }, [role, eventId, spaces, circleName]);

  // 現在のアクティブな権限 (ラベル対応表は lib/roles.ts に集約)
  const currentSpaceRole = useMemo(() => {
    if (!role) return "";
    return roleBadge(role);
  }, [role]);

  // 通知一覧取得 (2026-07-04 SaaS通知機能)
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationApi.list(),
    enabled: isAuthenticated && !!userEmail,
    refetchInterval: 15000, // 15秒おきに自動更新
  });

  // システムお知らせ (公開分) を [お知らせ・通知] に表示する (2026-07-06)
  const { data: announcements } = useQuery({
    queryKey: ["publicAnnouncements"],
    queryFn: () => systemApi.announcements(),
    enabled: isAuthenticated,
    refetchInterval: 5 * 60_000,
  });

  // 通知を既読にするミューテーション (2026-07-16)。
  // invite 型は承認/辞退の応答時に respond エンドポイント側で既読化されるため専用ボタンは出さない。
  // それ以外(announcement 等)は応答アクションが無いため、ここで明示的に既読化する導線が必要だった。
  const readMutation = useMutation({
    mutationFn: (id: string) => notificationApi.read(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: any) => toast.error(e?.message || "既読にできませんでした"),
  });

  // 招待回答ミューテーション
  const respondMutation = useMutation({
    mutationFn: async ({ notifId, action }: { notifId: string; action: "accept" | "decline" }) => {
      return await notificationApi.respond(notifId, { action });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["mySpaces"] });
      if (variables.action === "accept") {
        // circle_host はサークル作成が必要 → その場で作成フローへ誘導する (P1-3)。
        if (data?.kind === "circle_host" && data.token) {
          toast.success("出店招待を受け付けました。サークルを作成してください。");
          navigate(`/onboarding?inviteToken=${encodeURIComponent(data.token)}`);
          return;
        }
        toast.success("招待を承認しました。スペース一覧から切り替えられます。");
      } else {
        toast.success("招待を辞退しました");
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "処理に失敗しました");
    },
  });

  const handleLogout = async () => {
    // ローカルのアクティブスペース(circleAuth)だけを消して better-auth の
    // セッションを残すと、/login で「session あり + アクティブスペース無し」の
    // 状態になり、サインインフォームの手前にあるスペース未選択ガードに捕まって
    // ログインし直せなくなる。よって better-auth 側も必ず signOut する。
    // (2026-07-09 ログアウト後に再ログインできない不具合を修正)
    clearAuthInfo();
    window.sessionStorage.removeItem("circleName");
    localStorage.removeItem("eventName");
    await authClient.signOut();
    // useSession のキャッシュや mySpaces 等の残存クエリを掃除してから遷移する
    queryClient.clear();
    toast.success("ログアウトしました");
    setProfileModalOpen(false);
    setActiveMenu(null);
    navigate("/login");
  };

  // 切り替え可能なスペース一覧。現在アクティブなロールに依存させず、ユーザーの所属
  // (spaces) と super_admin 判定だけから算出することで、どのスペースにいても一覧が
  // 安定する (2026-07-04 スペース表示の不安定を修正)
  const availableSpaces = useMemo(() => {
    const list: Array<{
      id: string;
      type: "system" | "event" | "circle";
      name: string;
      role: string;
      circleId?: string | null;
      eventId?: string | null;
      circleName?: string;
    }> = [];

    // 1. システム管理 (実在する super_admin 所属を選択可能なスペースとして使う)
    if (isAccountSuperAdmin) {
      const membership = (spaces ?? []).find((m: any) => m.role === "super_admin");
      list.push({
        id: membership?.id ?? "",
        type: "system",
        name: "システム管理",
        role: "super_admin",
      });
    }

    // 2. 所属スペースを走査 (super_admin メンバーシップ行は type=system で別扱い済み)
    (spaces ?? []).forEach((m: any) => {
      if (m.role === "super_admin") return;
      if (m.eventId && !m.circleId) {
        if (!list.some(x => x.type === "event" && x.eventId === m.eventId)) {
          list.push({
            id: m.id,
            type: "event",
            name: m.event?.eventName || `イベント: ${m.eventId}`,
            role: m.role,
            eventId: m.eventId,
          });
        }
      } else if (m.circleId) {
        if (!list.some(x => x.type === "circle" && x.circleId === m.circleId)) {
          const eventName = m.event?.eventName;
          const circleName = m.circle?.name;
          list.push({
            id: m.id,
            type: "circle",
            // 同名サークルをイベント間で見分けられるよう、切替候補は「イベント / サークル」で表示する。
            name: eventName && circleName
              ? `${eventName} / ${circleName}`
              : circleName || `サークル: ${m.circleId}`,
            circleName: circleName || undefined,
            role: m.effectiveRole ?? m.role,
            circleId: m.circleId,
            eventId: m.eventId ?? m.circle?.eventId,
          });
        }
      }
    });

    return list;
  }, [spaces, isAccountSuperAdmin]);

  const handleSwitchSpace = async (space: any) => {
    const email = userEmail || "";
    const name = userName || null;

    // 遷移先とロールを先に確定させ、navigate → saveAuthInfo の順で呼ぶ。
    // saveAuthInfo 内の dispatchEvent("authChange") は同期的に状態更新をフラッシュする
    // ため、先に save すると「旧ルートのまま role だけ切り替わった」中間状態が生まれ、
    // 旧ルートのガード(EventAdminGuard 等)が不一致とみなして /login へ飛ばしてしまう。
    // navigate を先に呼ぶことで location 変更も同じフラッシュに含まれ、旧ガードは
    // アンマウントされ誤リダイレクトしない (2026-07-04 権限切替時のログイン画面表示を修正)
    let target = "/";
    let payload: Parameters<typeof saveAuthInfo>[0] | null = null;
    let message = "";

    if (space.type === "system") {
      target = "/sys/dashboard";
      message = "システム管理へ切り替えました";
      payload = {
        circleId: null,
        eventId: null,
        userEmail: email,
        userName: name,
        role: space.role,
        membershipId: space.id,
        circleName: null,
        isEventAdmin: false,
      };
    } else if (space.type === "event") {
      target = "/event/dashboard";
      message = `イベント [${space.name}] の管理者へ切り替えました`;
      payload = {
        circleId: null,
        eventId: space.eventId,
        userEmail: email,
        userName: name,
        role: space.role,
        membershipId: space.id,
        circleName: null,
        isEventAdmin: true,
      };
    } else if (space.type === "circle") {
      target = "/circle/dashboard";
      message = `店舗 [${space.name}] へ切り替えました`;
      payload = {
        circleId: space.circleId,
        eventId: space.eventId,
        userEmail: email,
        userName: name,
        role: space.role,
        membershipId: space.id,
        circleName: space.circleName || space.name,
        isEventAdmin: false,
      };
    }

    setProfileModalOpen(false);
    setActiveMenu(null);

    if (!payload) return;

    // なりすまし中にスペースだけ切り替えると、サーバー側の代理権限が残ったままになる。
    // 明示的なスペース選択を終了操作として扱い、停止成功後にのみ新しい所属へ移る (2026-09-27)。
    const currentAuth = getAuthInfo();
    if (currentAuth?.role === "super_admin" && currentAuth.isEventAdmin && currentAuth.eventId) {
      try {
        await adminApi.impersonateStop();
        queryClient.invalidateQueries({ queryKey: ["impersonation-status"] });
      } catch (error: any) {
        toast.error(error?.message || "なりすましを終了できませんでした。現在のスペースに留まります。");
        return;
      }
    }

    // 2026-07-16: 権限・メンバーシップ関連のキャッシュを無効化する。
    // useAuth 側の role/circleId は saveAuthInfo が dispatch する authChange イベントで
    // 即座に更新されるが、TanStack Query の staleTime=0 は「再マウント時に再フェッチ」
    // する挙動でしかなく、既にマウント済みのまま同じクエリキーを見続けているコンポーネント
    // (例: 同じ /circle/dashboard に留まったまま別スペースへ切り替えた場合) までは
    // 自動で追随しない。切り替え先の所属・権限に関わるクエリを明示的に無効化して
    // 即時反映させる (queryClient.clear() は他の無関係なキャッシュまで巻き込むため避ける)。
    queryClient.invalidateQueries({ queryKey: ["mySpaces"] });
    queryClient.invalidateQueries({ queryKey: ["accountMe"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    if (payload.circleId) {
      queryClient.invalidateQueries({ queryKey: ["circle", payload.circleId] });
    }
    if (payload.eventId) {
      queryClient.invalidateQueries({ queryKey: ["event", payload.eventId] });
    }

    // 2026-07-07 単一ドメイン化: circle=/circle・event=/event・sys=/sys はすべて同一オリジンの
    // 同一SPA になったため、旧来のクロスドメイン移動 (?_sw で authInfo を持ち越す) は不要。
    // 常にクライアント側 navigate で切り替える。
    navigate(target);
    saveAuthInfo(payload);
    toast.success(message);
  };

  // 来場者機能は apps/visitor に分離したため register の管理ヘッダーには来場者リンクを持たない (2026-07-04)
  const isCircleView = pathname.startsWith("/circle");
  const isEventView = pathname.startsWith("/event");
  const isAdminView = pathname.startsWith("/sys");

  let links: Array<{ to: string; label: string }> = [];

  if (isAdminView && role === "super_admin") {
    links = [
      { to: "/sys/dashboard", label: "システム管理" },
    ];
  } else if (isEventView && (role === "event_manager" || role === "event_staff" || role === "event_wristband_staff" || role === "event_stamp_staff" || role === "super_admin")) {
    links = [
      { to: "/event/dashboard", label: "イベント管理" },
    ];
  } else if (isCircleView && (role === "circle_manager" || role === "circle_admin" || role === "circle_staff" || role === "super_admin" || role === "event_manager")) {
    links = [
      { to: "/circle/dashboard", label: "ダッシュボード" },
      ...(hasPermission(role, "order:write", isEventAdmin) ? [{ to: "/circle/register", label: "レジ" }] : []),
      ...(hasPermission(role, "order:read", isEventAdmin) ? [{ to: "/circle/backyard", label: "厨房" }] : []),
    ];
  }

  const isActive = (to: string) => {
    return pathname.startsWith(to);
  };

  // 未読バッジの判定ロジック (2026-07-16)。
  // 3本線メニューに通知が格納されると未読に気づけなくなるため、3本線トリガー自身にも
  // 同じバッジを出す必要がある。判定を1箇所に集約し、通知トリガー/3本線トリガー/
  // モバイル1段目の「通知」行の3箇所で使い回す。
  const hasUnreadNotif = Boolean(
    (notifications && notifications.length > 0) || (announcements && announcements.length > 0)
  );
  const notifBadgeLabel =
    notifications && notifications.length > 0
      ? notifications.length > 99
        ? "99+"
        : notifications.length
      : "!";

  // 通知パネルの中身 (デスクトップのクリックパネル / モバイル階層メニューで共用) (2026-10-07 #70)
  const notifPanelBody = (
    <div className="max-h-72 overflow-y-auto space-y-3">
      {/* システムお知らせ (公開分) */}
      {announcements && announcements.map((a) => {
        const badge =
          a.level === "critical"
            ? "bg-destructive text-destructive-foreground"
            : a.level === "warning"
              ? "bg-warning text-black"
              : "bg-primary text-primary-foreground";
        return (
          <div key={a.id} className="text-xs border-thick border-border p-3 bg-background space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-headline font-bold truncate">{a.title}</span>
              <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider shrink-0 ${badge}`}>
                お知らせ
              </span>
            </div>
            {a.body && (
              <p className="text-[11px] leading-[1.4] text-foreground/80 whitespace-pre-wrap">{a.body}</p>
            )}
            <div className="text-[9px] text-muted-foreground">
              {new Date(a.createdAt).toLocaleDateString("ja-JP")}
            </div>
          </div>
        );
      })}

      {/* 個人宛通知 */}
      {notifications && notifications.length > 0 ? (
        notifications.map((notif: any) => (
          <div key={notif.id} className="text-xs border-thin border-border p-3 bg-muted/10 space-y-2">
            <div className="font-bold flex items-center justify-between">
              <span className="font-headline font-bold">{notif.title}</span>
              <span className="text-[9px] text-muted-foreground">
                {new Date(notif.createdAt).toLocaleDateString("ja-JP")}
              </span>
            </div>
            <p className="text-[11px] leading-[1.4] text-foreground/80">{notif.message}</p>
            {notif.type === "invite" ? (
              <div className="flex gap-2 pt-1.5">
                <Button
                  size="sm"
                  className="h-7 text-[10px] flex-1 rounded-none border-thin border-border bg-primary text-primary-foreground hover:bg-background hover:text-foreground"
                  onClick={() => respondMutation.mutate({ notifId: notif.id, action: "accept" })}
                  disabled={respondMutation.isPending}
                >
                  承認
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-[10px] flex-1 rounded-none bg-destructive text-destructive-foreground hover:bg-background hover:text-foreground"
                  onClick={() => respondMutation.mutate({ notifId: notif.id, action: "decline" })}
                  disabled={respondMutation.isPending}
                >
                  辞退
                </Button>
              </div>
            ) : (
              // invite 以外(announcement 等)は応答アクションが無いため、
              // 既読にする専用ボタンを出す (2026-07-16 既読機能)
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => readMutation.mutate(notif.id)}
                  disabled={readMutation.isPending}
                  className="text-[10px] underline hover:text-primary cursor-pointer disabled:opacity-50"
                >
                  既読にする
                </button>
              </div>
            )}
          </div>
        ))
      ) : null}

      {(!announcements || announcements.length === 0) &&
        (!notifications || notifications.length === 0) && (
          <div className="text-center py-6 text-muted-foreground text-xs">
            お知らせ・通知はありません
          </div>
        )}
    </div>
  );

  // スペース切り替えパネルの中身。ここは所属の選択だけにし、権限の説明はアカウント設定に置く (2026-10-07, #70)。
  const spacePanelBody = (
    <>
      {membershipAuthorityError && (
        <div role="alert" className="mb-3 border-thick border-border bg-muted p-3 text-[10px]">
          <p>{membershipAuthorityError}</p>
          <button className="mt-1 underline" onClick={retryAuthorization}>再試行</button>
        </div>
      )}
      <div className="max-h-72 overflow-y-auto space-y-3">
        {availableSpaces.length > 0 ? (
          ([
            { type: "system", label: "システム", Icon: Shield },
            { type: "event", label: "イベント", Icon: Calendar },
            { type: "circle", label: "サークル", Icon: Building2 },
          ] as const).map(({ type, label, Icon }) => {
            const group = availableSpaces.filter((s) => s.type === type);
            if (group.length === 0) return null;
            return (
              <div key={type} className="space-y-1">
                {/* グループ見出し (システム / イベント / サークル) */}
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[1.5px] text-muted-foreground px-1 pb-1 border-b border-border/20">
                  <Icon className="h-3 w-3" />
                  {label}
                  <span className="opacity-60">({group.length})</span>
                </div>
                {group.map((space) => (
                  <button
                    key={space.id}
                    onClick={() => {
                      handleSwitchSpace(space);
                    }}
                    className="w-full text-left p-2 hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer rounded-none"
                  >
                    <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-black uppercase tracking-wider">
                      {roleLabel(space.role)}
                    </div>
                    <div className="text-xs font-bold truncate mt-0.5">{space.name}</div>
                  </button>
                ))}
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-muted-foreground text-xs">
            利用可能なスペースがありません
          </div>
        )}
      </div>

      {/* 招待コードで参加 / スペースを追加 (2026-07-14 P0)。
          ログイン済みユーザーが招待コードを入力できる唯一の導線。
          ?join=1 で StaffOnboarding の選択画面を出し、所属があっても弾かれないようにする。 */}
      <button
        onClick={() => {
          setActiveMenu(null);
          navigate("/onboarding?join=1");
        }}
        className="mt-3 w-full flex items-center justify-center gap-1.5 border-thick border-border p-2 text-[11px] font-black uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer rounded-none"
      >
        <Plus className="h-3.5 w-3.5" />
        招待コードで参加 / スペースを追加
      </button>
    </>
  );

  // アカウントパネルの中身 (デスクトップのクリックパネル / モバイル階層メニューで共用) (2026-10-07 #70)
  const accountPanelBody = (
    <>
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/20">
        {me?.image ? (
          <img src={resolveAssetUrl(me.image)} alt="Avatar" className="w-8 h-8 rounded-none border border-border object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 border border-border flex items-center justify-center shrink-0">
            <User className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-xs font-bold truncate">{userName || "アカウント"}</div>
          <div className="text-[10px] text-muted-foreground truncate">{userEmail}</div>
        </div>
      </div>

      <div className="space-y-1">
        <button
          onClick={() => {
            setProfileModalOpen(true);
            setActiveMenu(null);
          }}
          className="w-full flex items-center gap-2 text-left p-2 hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer rounded-none text-xs font-bold"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          アカウント設定を開く
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 text-left p-2 hover:bg-destructive hover:text-destructive-foreground transition-all cursor-pointer rounded-none text-xs font-bold"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          ログアウト
        </button>
      </div>
    </>
  );

  return (
    <header data-app-header className="sticky top-0 z-50 bg-background border-b-thick border-border pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-foreground font-mono">
      {/* 2026-10-21: モバイルナビの背後を暗くするスクリーン面は header の stacking context 外へ置く。 */}
      {mobileNavOpen && createPortal(
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[40] bg-foreground/60 backdrop-blur-sm"
          onClick={() => setActiveMenu(null)}
        />,
        document.body,
      )}
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 max-w-7xl mx-auto gap-2 sm:gap-4">
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {/* 2026-10-20: 共有ドロワーを使うシステム/サークル管理画面でも、狭い幅から開けるトリガーを表示する。 */}
          {(pathname.startsWith("/event/dashboard") || pathname.startsWith("/sys/dashboard") || pathname.startsWith("/circle/dashboard")) && (
            <button
              type="button"
              aria-label={dashboardMenuOpen ? "管理画面メニューを閉じる" : "管理画面メニューを開く"}
              aria-expanded={dashboardMenuOpen}
              aria-controls="dashboard-mobile-menu"
              onClick={() => {
                const eventName = dashboardMenuOpen ? "fesflow:dashboard-menu-close" : "fesflow:dashboard-menu-open";
                window.dispatchEvent(new Event(eventName));
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center border-thick border-border bg-background text-foreground transition-colors hover:bg-primary hover:text-primary-foreground md:hidden"
            >
              {dashboardMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
          {/* ロゴ / ブランド */}
          <Link
            to="/"
            className="font-headline text-base sm:text-lg lg:text-xl uppercase tracking-[2px] leading-none select-none hover:opacity-80 flex items-center gap-2 shrink-0"
          >
            <span className="font-black border-thin border-border px-2 py-1 bg-primary text-primary-foreground text-sm sm:text-base">
              {PRODUCT_NAME.toUpperCase()}
              <span className="hidden lg:inline">
                {isCircleView && " // BOOTH"}
                {isEventView && " // EVENT"}
                {isAdminView && " // SYSTEM"}
              </span>
            </span>
          </Link>
        </div>

        {/* デスクトップナビゲーション (常時ラベル表示のためページリンクなのでそのまま維持) */}
        <nav className="hidden lg:flex items-center gap-1 font-headline text-[13px] uppercase tracking-[1px]">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-3 py-1.5 border-thin border-border transition-all whitespace-nowrap ${
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
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {isAuthenticated && !isLoading ? (
            <div className="flex items-center gap-1 sm:gap-2 relative">
              {/* 通知ベルメニュー (デスクトップのみ:ホバー / タッチ:タップ 両対応。
                  1024px未満は3本線メニューへ集約するためここでは非表示にする 2026-09-27) */}
              <div
                ref={notifRef}
                className="relative hidden lg:block"
              >
                <button
                  onClick={() => toggleMenu("notif")}
                  aria-haspopup="menu"
                  aria-expanded={notifOpen}
                  aria-label="お知らせ・通知メニューを開く"
                  className="flex items-center justify-center gap-1 sm:gap-1.5 border-thick border-border bg-background hover:bg-muted select-none cursor-pointer h-8 sm:h-9 px-1.5 sm:px-2.5 rounded-none"
                >
                  <span className="relative flex items-center justify-center shrink-0">
                    <Bell className="h-4 w-4" />
                    {/* 未読バッジ (2026-07-16): 個人宛通知(notification)は unread/read を持つため件数を出す。
                        システムお知らせ(announcements)は全ユーザー公開で既読状態を持たないため、
                        それしか無い場合は件数の代わりに "!" のみ表示する。判定は hasUnreadNotif/
                        notifBadgeLabel に集約し、3本線トリガー側のバッジとロジックを共有する。 */}
                    {hasUnreadNotif && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-destructive text-destructive-foreground text-[9px] font-black leading-none rounded-none border border-background">
                        {notifBadgeLabel}
                      </span>
                    )}
                  </span>
                  {/* ラベルは常時表示 (アイコンのみだとスマホで意味が分からないため 2026-07-16) */}
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">通知</span>
                  <ChevronDown className="h-3 w-3 shrink-0 hidden sm:inline" />
                </button>

                {/* 通知ポップオーバー (StudioBlank デザインルール準拠のフラットスタイル)
                    2026-07-16: 位置指定を top-11 から「top-full + 透明パディング(pt-2)」に変更。
                    top-11 だとトリガー(h-9=36px)とパネル(44px)の間に 8px の隙間ができ、そこを
                    カーソルが通ると一瞬どの要素上でもなくなって mouseleave が発火し、パネルに
                    たどり着く前に閉じてしまっていた。パディングでホバー領域を連続させつつ
                    見た目の余白は維持する。 */}
                {notifOpen && (
                  <div className="absolute right-0 top-full pt-2 z-50">
                  <div className="w-72 sm:w-80 border-thick border-border bg-background p-4 shadow-none rounded-none text-left">
                    <div className="flex items-center justify-between border-b border-border/20 pb-2 mb-3">
                      <span className="text-[11px] font-black uppercase tracking-wider">[お知らせ・通知]</span>
                      <button
                        onClick={() => setActiveMenu(null)}
                        className="text-[10px] underline hover:text-primary cursor-pointer"
                      >
                        閉じる
                      </button>
                    </div>

                    {notifPanelBody}
                  </div>
                  </div>
                )}
              </div>

              {/* スペース切り替えメニュー (デスクトップのみ:ホバー / タッチ:タップ 両対応。
                  モバイルは3本線メニューへ集約 2026-07-16) */}
              <div
                ref={spaceRef}
                className="relative hidden lg:block"
              >
                {/* 2026-09-27 Issue #26: スペース一覧は意図したクリックで開閉し、ポインター通過では勝手に展開しない。 */}
                <button
                  onClick={() => toggleMenu("space")}
                  aria-haspopup="menu"
                  aria-expanded={spaceOpen}
                  aria-label="スペース切り替えメニューを開く"
                  className="flex items-center justify-center gap-1 sm:gap-1.5 bg-muted border-thick border-border px-1.5 sm:px-3 py-1 sm:py-1.5 font-mono text-[11px] font-bold hover:bg-muted/80 select-none cursor-pointer h-8 sm:h-9 rounded-none"
                >
                  {pathname.startsWith("/sys") ? <Shield className="h-3.5 w-3.5 shrink-0" /> :
                   pathname.startsWith("/event") ? <Calendar className="h-3.5 w-3.5 shrink-0" /> :
                   <Building2 className="h-3.5 w-3.5 shrink-0" />}
                  {/* ラベルは常時表示。狭幅では固定文言、sm以上で実際のスペース名も添える (2026-07-16) */}
                  <span className="uppercase tracking-wider text-[10px] sm:hidden">スペース</span>
                  <span className="hidden sm:inline truncate max-w-[120px]">
                    {currentSpaceName}
                  </span>
                  <span className="bg-primary text-primary-foreground px-1 py-0.5 text-[8px] font-black scale-90 shrink-0 hidden sm:inline">
                    {currentSpaceRole}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>

                {/* スペース切り替えポップオーバー */}
                {/* 2026-07-16: 通知パネルと同じ理由で top-full + 透明パディングにする
                    (トリガーとの隙間でホバーが切れてパネルに到達できなくなるのを防ぐ)。 */}
                {spaceOpen && (
                  <div className="absolute right-0 top-full pt-2 z-50">
                  <div className="w-72 sm:w-80 border-thick border-border bg-background p-4 shadow-none rounded-none text-left">
                    <div className="flex items-center justify-between border-b border-border/20 pb-2 mb-3">
                      <span className="text-[11px] font-black uppercase tracking-wider">[スペース切り替え]</span>
                      <button
                        onClick={() => setActiveMenu(null)}
                        className="text-[10px] underline hover:text-primary cursor-pointer"
                      >
                        閉じる
                      </button>
                    </div>

                    {spacePanelBody}
                  </div>
                  </div>
                )}
              </div>

              {/* アカウントメニュー (デスクトップのみ:ホバー / タッチ:タップ 両対応。
                  モバイルは3本線メニューへ集約 2026-07-16)。
                  以前はボタン1つでいきなり AccountModal を開いていたが、アイコン+シェブロンだけでは
                  「押すと何が起きるか」がスマホで分からなかったため、ラベル付きの2段メニューにした
                  (① アカウント設定を開く → AccountModal / ② ログアウト) (2026-07-16) */}
              <div
                ref={accountRef}
                className="relative hidden lg:block"
              >
                <button
                  onClick={() => toggleMenu("account")}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-label="アカウントメニューを開く"
                  className="flex items-center justify-center gap-1 sm:gap-1.5 bg-muted border-thick border-border px-1.5 sm:px-3 py-1 sm:py-1.5 font-mono text-[11px] font-bold hover:bg-muted/80 select-none cursor-pointer h-8 sm:h-9 rounded-none"
                >
                  {me?.image ? (
                    <img src={resolveAssetUrl(me.image)} alt="Avatar" className="w-5 h-5 rounded-none border border-border object-cover shrink-0" />
                  ) : (
                    <User className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="uppercase tracking-wider text-[10px] sm:hidden">アカウント</span>
                  <span className="hidden sm:inline truncate max-w-[80px]">
                    {userName || "アカウント"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>

                {/* アカウントメニューパネル */}
                {/* 2026-10-07 (#70): クリックで開いたパネルに余白を設け、ポインターを操作しやすくする。 */}
                {accountOpen && (
                  <div className="absolute right-0 top-full pt-2 z-50">
                  <div className="w-64 border-thick border-border bg-background p-4 shadow-none rounded-none text-left">
                    <div className="flex items-center justify-between border-b border-border/20 pb-2 mb-3">
                      <span className="text-[11px] font-black uppercase tracking-wider">[アカウント]</span>
                      <button
                        onClick={() => setActiveMenu(null)}
                        className="text-[10px] underline hover:text-primary cursor-pointer"
                      >
                        閉じる
                      </button>
                    </div>

                    {accountPanelBody}
                  </div>
                  </div>
                )}
              </div>

              {/* 3本線メニュー (1024px未満のみ)。2026-10-20: 親項目を残したカスケード表示で階層を示し、
                  横幅が足りない時は詳細だけのウィンドウへ切り替えて画面内に収める。 */}
              <div ref={navRef} className="relative lg:hidden">
                <button
                  onClick={() => toggleMenu("nav")}
                  aria-haspopup="dialog"
                  aria-expanded={mobileNavOpen}
                  aria-label={mobileNavOpen ? "メニューを閉じる" : "メニューを開く"}
                  className="flex items-center justify-center gap-1.5 h-8 px-2 border-thick border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground transition-all rounded-none"
                >
                  <span className="relative flex items-center justify-center shrink-0">
                    {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    {/* 3本線に通知メニューを格納すると未読に気づけなくなるため、
                        通知トリガーと同じ hasUnreadNotif/notifBadgeLabel をここでも表示する (2026-07-16) */}
                    {hasUnreadNotif && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-destructive text-destructive-foreground text-[9px] font-black leading-none rounded-none border border-background">
                        {notifBadgeLabel}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">メニュー</span>
                </button>

                {mobileNavOpen && (
                  <div
                    className={`absolute right-0 top-full z-50 pt-2 ${
                      mobileSection && !mobileCascadeMode
                        ? mobileSection === "notif"
                          ? "w-[min(26rem,calc(100vw-1rem))]"
                          : mobileSection === "space"
                            ? "w-[min(28rem,calc(100vw-1rem))]"
                            : "w-[min(21rem,calc(100vw-1rem))]"
                        : "w-[min(16rem,calc(100vw-1rem))]"
                    }`}
                  >
                    {(!mobileSection || mobileCascadeMode) && (
                      <div ref={mobileMenuRef} role="dialog" aria-label="管理画面メニュー" className="max-h-[calc(100dvh-5rem)] overflow-y-auto border-thick border-border bg-background text-left shadow-none">
                        <div className="flex items-center justify-between gap-2 border-b-thin border-border px-3 py-2.5">
                          <span className="text-[11px] font-black uppercase tracking-wider">[メニュー]</span>
                          <button
                            type="button"
                            onClick={() => setActiveMenu(null)}
                            className="shrink-0 text-[10px] underline hover:text-primary cursor-pointer"
                          >
                            閉じる
                          </button>
                        </div>
                        <nav aria-label="メニュー項目" className="flex min-w-0 flex-col">
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-expanded={mobileSection === "notif"}
                            data-mobile-menu-section="notif"
                            onClick={(event) => openMobileSection("notif", event.currentTarget)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowRight") {
                                event.preventDefault();
                                openMobileSection("notif", event.currentTarget, true);
                              }
                            }}
                            className={`flex min-h-12 min-w-0 items-center justify-between gap-2 border-b-thin border-border px-3 py-3 text-left font-headline text-[11px] uppercase tracking-wide transition-all sm:text-[13px] ${mobileCascadeMode && mobileSection === "notif" ? "bg-muted" : "hover:bg-muted"}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="relative flex shrink-0 items-center justify-center">
                                <Bell className="h-3.5 w-3.5" />
                                {hasUnreadNotif && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-none border border-background bg-destructive px-1 text-[8px] font-black leading-none text-destructive-foreground">
                                    {notifBadgeLabel}
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 break-words">通知</span>
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-expanded={mobileSection === "space"}
                            data-mobile-menu-section="space"
                            onClick={(event) => openMobileSection("space", event.currentTarget)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowRight") {
                                event.preventDefault();
                                openMobileSection("space", event.currentTarget, true);
                              }
                            }}
                            className={`flex min-h-12 min-w-0 items-center justify-between gap-2 border-b-thin border-border px-3 py-3 text-left font-headline text-[11px] uppercase tracking-wide transition-all sm:text-[13px] ${mobileCascadeMode && mobileSection === "space" ? "bg-muted" : "hover:bg-muted"}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {pathname.startsWith("/sys") ? <Shield className="h-3.5 w-3.5 shrink-0" /> :
                               pathname.startsWith("/event") ? <Calendar className="h-3.5 w-3.5 shrink-0" /> :
                               <Building2 className="h-3.5 w-3.5 shrink-0" />}
                              <span className="min-w-0 break-words">組織切り替え</span>
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-expanded={mobileSection === "account"}
                            data-mobile-menu-section="account"
                            onClick={(event) => openMobileSection("account", event.currentTarget)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowRight") {
                                event.preventDefault();
                                openMobileSection("account", event.currentTarget, true);
                              }
                            }}
                            className={`flex min-h-12 min-w-0 items-center justify-between gap-2 border-b-thin border-border px-3 py-3 text-left font-headline text-[11px] uppercase tracking-wide transition-all sm:text-[13px] ${mobileCascadeMode && mobileSection === "account" ? "bg-muted" : "hover:bg-muted"}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {me?.image ? (
                                <img src={resolveAssetUrl(me.image)} alt="" className="h-4 w-4 shrink-0 border border-border object-cover" />
                              ) : (
                                <User className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span className="min-w-0 break-words">アカウント</span>
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          </button>

                          {links.map(({ to, label }) => (
                            <Link
                              key={to}
                              to={to}
                              onClick={() => setActiveMenu(null)}
                              className={`flex min-h-12 min-w-0 items-center gap-2 border-b-thin border-border px-3 py-3 font-headline text-[11px] uppercase tracking-wide transition-all sm:text-[13px] ${
                                isActive(to)
                                  ? "bg-primary text-primary-foreground font-bold"
                                  : "bg-background text-foreground hover:bg-muted"
                              }`}
                            >
                              <Compass className="h-3.5 w-3.5 shrink-0" />
                              <span className="min-w-0 break-words">{label}</span>
                            </Link>
                          ))}
                        </nav>
                      </div>
                    )}
                  </div>
                )}
                {mobileNavOpen && mobileSection && (
                  <section
                    ref={mobileSubmenuRef}
                    role="dialog"
                    aria-modal="false"
                    aria-label={mobileSection === "notif" ? "お知らせ・通知" : mobileSection === "space" ? "組織切り替え" : "アカウント"}
                    style={mobileCascadeMode ? { top: mobileSubmenuTop, left: mobileSubmenuLeft, width: mobileSubmenuWidth } : undefined}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        setMobileFocusReturnSection(mobileSection);
                        setMobileSection(null);
                        setMobileCascadeMode(false);
                      }
                    }}
                    className={`${mobileCascadeMode ? "fixed z-[60] max-h-[calc(100dvh-1rem)]" : "absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] w-[min(26rem,calc(100vw-1rem))]"} overflow-y-auto border-thick border-border bg-background text-left shadow-none ${!mobileCascadeMode && mobileSection === "space" ? "w-[min(28rem,calc(100vw-1rem))]" : ""} ${!mobileCascadeMode && mobileSection === "account" ? "w-[min(21rem,calc(100vw-1rem))]" : ""}`}
                  >
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b-thin border-border bg-background px-2 py-2.5 sm:px-3">
                      {!mobileCascadeMode && (
                        <button
                          type="button"
                          onClick={() => { setMobileFocusReturnSection(mobileSection); setMobileSection(null); setMobileCascadeMode(false); }}
                          aria-label="メニュー一覧に戻る"
                          className="shrink-0 px-1 text-[10px] font-bold underline hover:text-primary"
                        >
                          ‹ メニュー
                        </button>
                      )}
                      <span className="min-w-0 truncate text-center text-[10px] font-black uppercase tracking-wider sm:text-[11px]">
                        {mobileSection === "notif" && "[お知らせ・通知]"}
                        {mobileSection === "space" && "[組織切り替え]"}
                        {mobileSection === "account" && "[アカウント]"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveMenu(null)}
                        aria-label="メニューを閉じる"
                        className="shrink-0 px-1 text-[10px] underline hover:text-primary"
                      >
                        閉じる
                      </button>
                    </div>
                    <div className="min-w-0 max-w-full overflow-x-hidden p-2 sm:p-3">
                      {mobileSection === "notif" && notifPanelBody}
                      {mobileSection === "space" && spacePanelBody}
                      {mobileSection === "account" && accountPanelBody}
                    </div>
                  </section>
                )}
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/login")}
              className="h-8 text-xs font-mono px-3 rounded-none"
            >
              ログイン
            </Button>
          )}
        </div>
      </div>

      {/* ===== アカウント管理モーダル (プロフィール編集/メール変更/削除) ===== */}
      <AccountModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onLogout={handleLogout}
      />
    </header>
  );
}
