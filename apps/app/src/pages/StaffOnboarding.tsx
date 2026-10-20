import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { eventApi, membershipApi, type InviteLookupResult } from "@/lib/api";
import { resolveActiveSpaceAfterAuth, saveAuthInfo, useMySpaces } from "@/hooks/useCircleAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EventCreateWizard } from "@/components/event/EventCreateWizard";
import { CircleCreateWizard } from "@/components/circle/CircleCreateWizard";
import Loader from "@/components/loader";

// スタッフ用オンボーディング (2026-07-12 SaaS 分岐版)
// 所属ゼロの新規アカウントに「イベントを主催する / サークルで出店する(招待コード)」を選ばせる。
// - イベント主催: 無料枠(1サークル)のイベントを作成し event_manager になる → イベント管理へ。
// - サークル出店: イベントの招待コード/リンクを要求し、
//   - circle_host 招待 → そのイベント配下にサークルを新規作成して circle_manager に。
//   - circle_member / event 管理・当日スタッフ招待 → その場で受諾して適切な権限で参加。
// URL ?inviteToken= が付いていれば join モードで自動照会する(招待リンク着地時に使う)。
type Mode = "choose" | "host" | "join";

export default function StaffOnboarding() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const presetToken = searchParams.get("inviteToken");
	// 招待コード単体のディープリンク (/join?code=XXXX や /onboarding?code=XXXX) にも対応 (2026-07-14 P0)。
	const presetCode = searchParams.get("code");
	// ヘッダーの「招待コードで参加 / スペースを追加」からは ?join=1 で来る (所属があっても選択画面を出す)。
	const joinIntent = searchParams.get("join") === "1";
	// 招待を処理する意図がある間は「所属あり → 既存スペースへ即リダイレクト」を抑止する。
	// これが無いと、既にサークル/イベントを持つ人や主催者本人が招待リンク/コードを開いても
	// 既存スペースに弾かれてサークルを作成できなかった (P0 の詰まりの主因)。
	const wantsInvite = !!presetToken || !!presetCode || joinIntent;
	const { data: session, isPending: sessionPending } = authClient.useSession();

	// 既に所属があるアカウントはオンボーディング不要。所属を解決して送り返す。
	// ただし招待処理中 (wantsInvite) は送り返さず、招待の受諾/サークル作成を優先する。
	const { data: spaces } = useMySpaces();
	useEffect(() => {
		if (wantsInvite) return;
		if (spaces && spaces.length > 0 && session?.user?.email) {
			resolveActiveSpaceAfterAuth()
				.then((r) => {
					if (r.kind !== "none") navigate(r.path, { replace: true });
				})
				.catch(() => {});
		}
	}, [wantsInvite, spaces, session?.user?.email, navigate]);

	const [mode, setMode] = useState<Mode>(presetToken || presetCode ? "join" : "choose");

	// ── イベント主催 ───────────────────────────────────────────────

	// ── 招待経由 ───────────────────────────────────────────────────
	const [codeInput, setCodeInput] = useState(presetCode || "");
	const [lookup, setLookup] = useState<InviteLookupResult | null>(null);
	const inviteEventQuery = useQuery({
		queryKey: ["event", lookup?.eventId],
		queryFn: () => eventApi.get(lookup!.eventId!),
		enabled: lookup?.kind === "circle_host" && !!lookup.eventId,
	});
	const autoLookupStartedFor = useRef<string | null>(null);
	const lookupRequestId = useRef(0);
	const [lookupPending, setLookupPending] = useState(false);

	const runLookup = async (params: { token?: string; code?: string }) => {
		const requestId = ++lookupRequestId.current;
		setLookupPending(true);
		try {
			const res = await membershipApi.inviteLookup(params);
			if (requestId !== lookupRequestId.current) return;
			if (!res.valid) {
				toast.error(res.reason || "この招待は使用できません");
				return;
			}
			setLookup(res);
		} catch (e: any) {
			if (requestId !== lookupRequestId.current) return;
			toast.error(e?.message || "招待の照会に失敗しました");
		} finally {
			// 2026-10-08: URL自動照会も失敗後に入力と再試行を操作できる状態へ戻す。
			if (requestId === lookupRequestId.current) setLookupPending(false);
		}
	};

	// URL に inviteToken / code があれば自動照会 (token 優先)
	useEffect(() => {
		const lookupKey = `${presetToken || ""}:${presetCode || ""}`;
		if (!presetToken && !presetCode) {
			autoLookupStartedFor.current = null;
			lookupRequestId.current += 1;
			setLookupPending(false);
			setLookup(null);
			setCodeInput("");
			return;
		}
		if (autoLookupStartedFor.current === lookupKey) return;
		// 2026-10-08: StrictMode の重複実行を抑えつつ、URL変更時は新しい招待を照会する。
		autoLookupStartedFor.current = lookupKey;
		setLookup(null);
		setCodeInput(presetCode || "");
		if (presetToken) {
			runLookup({ token: presetToken });
		} else if (presetCode) {
			runLookup({ code: presetCode });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [presetToken, presetCode]);

	// circle_member / event_manager 招待をその場で受諾
	const acceptInvite = useMutation({
		mutationFn: () =>
			membershipApi.acceptInvite({
				token: lookup!.token,
			}),
		onSuccess: async () => {
			toast.success("参加しました");
			await goToResolvedSpace();
		},
		onError: (e: any) => toast.error(e?.message || "参加に失敗しました"),
	});

	async function goToCreatedCircle(circleId: string) {
		const email = session?.user?.email;
		if (!email) {
			navigate("/login", { replace: true });
			return;
		}
		try {
			const memberships = await membershipApi.listMy();
			const createdMembership = memberships.find((item: any) => item.circleId === circleId);
			if (!createdMembership) throw new Error("作成したサークルの所属情報を取得できませんでした");
			saveAuthInfo({
				circleId: createdMembership.circleId,
				eventId: createdMembership.eventId,
				userEmail: createdMembership.userEmail,
				userName: createdMembership.userName,
				role: createdMembership.effectiveRole ?? createdMembership.role,
				membershipId: createdMembership.id,
				circleName: createdMembership.circle?.name ?? null,
			});
			if (createdMembership.circle?.name) window.sessionStorage.setItem("circleName", createdMembership.circle.name);
			navigate("/circle/dashboard/menu", { replace: true });
		} catch (error: any) {
			toast.error(error?.message || "作成後のサークル切り替えに失敗しました");
		}
	}

	async function goToResolvedSpace() {
		try {
			const email = session?.user?.email;
			if (email) {
				const resolved = await resolveActiveSpaceAfterAuth();
				navigate(resolved.path, { replace: true });
				return;
			}
		} catch {
			/* fall through */
		}
		navigate("/login", { replace: true });
	}

	if (sessionPending) return <Loader />;
	if (!session?.user) {
		// 招待コード/トークンを URL に持ったまま来た場合は、ログイン後にこの画面へ戻す
		// (sign-in-form が callbackUrl を Google/passkey の戻り先に使うため招待が引き継がれる)。
		const cb = encodeURIComponent(window.location.pathname + window.location.search);
		navigate(`/login?callbackUrl=${cb}`, { replace: true });
		return <Loader />;
	}

	const displayName = session.user.name || session.user.email;

	return (
		<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-sp-3 md:p-sp-5 bg-muted">
			<div className="w-full max-w-2xl p-sp-5 bg-background border-heavy border-border text-foreground space-y-5">
				<div className="space-y-2">
					<h1 className="text-[26px] font-headline uppercase tracking-tight leading-[1.1]">
						ようこそ、{displayName} さん
					</h1>
					<p className="font-mono text-[13px] text-muted-foreground leading-[1.6]">
						FesFlow をどう使い始めるか選んでください。
					</p>
				</div>

				{/* ── 選択画面 ── */}
				{mode === "choose" && (
					<div className="grid grid-cols-1 gap-3">
						<button
							type="button"
							onClick={() => setMode("host")}
							className="text-left p-4 border-thick border-border hover:border-foreground transition-colors"
						>
							<div className="font-headline text-[18px] uppercase">イベントを主催する</div>
							<div className="font-mono text-[12px] text-muted-foreground mt-1 leading-[1.6]">
								学園祭やイベントの主催者はこちら。無料プランで始められます(サークルは1つまで。
								上限はあとから拡張できます)。あなたがイベント管理者になります。
							</div>
						</button>
						<button
							type="button"
							onClick={() => setMode("join")}
							className="text-left p-4 border-thick border-border hover:border-foreground transition-colors"
						>
							<div className="font-headline text-[18px] uppercase">サークルで出店する</div>
							<div className="font-mono text-[12px] text-muted-foreground mt-1 leading-[1.6]">
								出店するサークルの方はこちら。主催者から受け取った<strong className="text-foreground">招待コード</strong>
								または招待リンクが必要です。
							</div>
						</button>
					</div>
				)}

				{/* ── イベント主催 ── */}
				{mode === "host" && (
					<div className="space-y-4">
						<div className="border-thin border-border bg-muted/30 p-3 font-mono text-[12px] text-muted-foreground leading-[1.6]">
							無料プランで作成されます(サークル1つまで)。作成後、イベント管理画面から
							サークルの招待や設定ができます。プランのアップグレードは運営にお問い合わせください。
						</div>
						<EventCreateWizard
							onBack={() => setMode("choose")}
							onComplete={async (createdEventId, hasPhysicalWristband) => {
								try {
									const email = session.user.email;
									const newEventMembership = email
										? (await membershipApi.listMy()).find((item: any) => item.eventId === createdEventId && item.role === "event_manager")
										: null;
									if (newEventMembership) {
										saveAuthInfo({
											circleId: null,
											eventId: newEventMembership.eventId,
											userEmail: newEventMembership.userEmail,
											userName: newEventMembership.userName,
											role: newEventMembership.role,
											membershipId: newEventMembership.id,
											circleName: null,
											isEventAdmin: true,
										});
									}
									const resolved = newEventMembership ? null : email ? await resolveActiveSpaceAfterAuth() : null;
									const path = newEventMembership ? "/event/dashboard" : resolved?.path || "/event/dashboard";
									navigate(hasPhysicalWristband && path === "/event/dashboard" ? `${path}?tab=wristbands` : path, { replace: true });
								} catch {
									navigate(hasPhysicalWristband ? "/event/dashboard?tab=wristbands" : "/event/dashboard", { replace: true });
								}
							}}
						/>
					</div>
				)}

				{/* ── 招待経由 ── */}
				{mode === "join" && (
					<div className="space-y-4">
						{!lookup ? (
							<>
								<div className="space-y-1">
									<Label htmlFor="code">招待コード</Label>
									<Input
										id="code"
										value={codeInput}
										onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
										placeholder="例: ABCD2345"
										autoCapitalize="characters"
									/>
									<p className="font-mono text-[11px] text-muted-foreground">
										主催者から受け取った招待リンクをお持ちの場合は、そのリンクを直接開いてください。
									</p>
								</div>
								<div className="flex gap-2">
									<Button variant="outline" onClick={() => setMode("choose")}>
										戻る
									</Button>
									<Button
									className="flex-1"
									disabled={!codeInput.trim() || lookupPending}
									onClick={() => runLookup({ code: codeInput.trim() })}
								>
									{lookupPending ? "確認中..." : "招待を確認する"}
								</Button>
								</div>
							</>
						) : lookup.kind === "circle_host" ? (
							// circle_host: そのイベント配下にサークルを作成
							<div className="space-y-4">
								<div className="border-thin border-border bg-muted/30 p-3 font-mono text-[12px] leading-[1.6]">
									<strong className="text-foreground">{lookup.eventName || "イベント"}</strong>{" "}
									への出店招待です。サークルを作成するとあなたがサークル管理者になります。
								</div>
								{inviteEventQuery.data ? (
									<CircleCreateWizard
										event={inviteEventQuery.data}
										inviteToken={lookup.token}
										onCancel={() => setLookup(null)}
										onCreated={(id) => { void goToCreatedCircle(id); }}
									/>
								) : inviteEventQuery.isError ? (
									<div className="space-y-2 text-xs text-destructive">イベント情報を読み込めませんでした。<button type="button" className="underline" onClick={() => void inviteEventQuery.refetch()}>再読み込み</button></div>
								) : <div className="font-mono text-xs text-muted-foreground">イベント設定を読み込み中…</div>}
							</div>
						) : (
							// circle_member / event_manager: その場で受諾
							<div className="space-y-4">
								<div className="border-thin border-border bg-muted/30 p-3 font-mono text-[12px] leading-[1.6]">
									<strong className="text-foreground">
										{lookup.circleName || lookup.eventName || "スペース"}
									</strong>{" "}
									への招待です({roleLabel(lookup.kind, lookup.role)}として参加)。
								</div>
								<div className="flex gap-2">
									<Button variant="outline" onClick={() => setLookup(null)}>
										戻る
									</Button>
									<Button
										className="flex-1"
										disabled={acceptInvite.isPending}
										onClick={() => acceptInvite.mutate()}
									>
										{acceptInvite.isPending ? "参加中..." : "参加する"}
									</Button>
								</div>
							</div>
						)}
					</div>
				)}

				<div className="pt-2 border-t border-border">
					<button
						type="button"
						onClick={() =>
							authClient.signOut({
								fetchOptions: { onSuccess: () => navigate("/login", { replace: true }) },
							})
						}
						className="text-accent underline font-mono text-[12px] uppercase tracking-[1px] hover:text-foreground"
					>
						別のアカウントでログイン
					</button>
				</div>
			</div>
		</div>
	);
}

// 2026-10-20: 受諾フローの種別は event_manager に集約されるため、招待に保存された実ロールを表示する。
function roleLabel(kind: string, role: string): string {
	if (kind === "circle_member") return "サークルスタッフ";
	switch (role) {
		case "event_manager":
			return "イベント管理者";
		case "event_staff":
			return "当日スタッフ（紛失バンド交換・スタンプラリー）";
		case "event_wristband_staff":
			return "当日スタッフ（紛失バンド交換）";
		case "event_stamp_staff":
			return "当日スタッフ（スタンプラリー）";
		default:
			return "メンバー";
	}
}
