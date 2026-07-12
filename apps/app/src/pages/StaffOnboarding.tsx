import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { eventApi, circleApi, type JoinableEvent } from "@/lib/api";
import { resolveActiveSpaceAfterAuth, useMySpaces } from "@/hooks/useCircleAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Loader from "@/components/loader";

// スタッフ用オンボーディング (2026-07-12)
// 所属ゼロの新規アカウント (主に Google 初回ログイン) がログイン後の行き止まり
// (「スペースを選択してください / まだ所属していません」) に落ちないよう、
// ここでサークルをセルフ作成して circle_manager になる導線を提供する。
// - 参加可能イベント(GET /api/festivals/joinable)から1つ選び、サークル名を入力 → 作成。
// - 作成後は所属解決してサークルのダッシュボードへ遷移する。
// - 招待リンクを持っている場合はそちらを開くよう案内する(招待経由の参加は別ルート)。
export default function StaffOnboarding() {
	const navigate = useNavigate();
	const { data: session, isPending: sessionPending } = authClient.useSession();

	// 既に所属があるアカウントはオンボーディング不要。ダッシュボードへ送り返す。
	const { data: spaces } = useMySpaces();
	useEffect(() => {
		if (spaces && spaces.length > 0 && session?.user?.email) {
			resolveActiveSpaceAfterAuth(session.user.email)
				.then((r) => {
					if (r.kind !== "none") navigate(r.path, { replace: true });
				})
				.catch(() => {});
		}
	}, [spaces, session?.user?.email, navigate]);

	const {
		data: events,
		isLoading: eventsLoading,
		isError: eventsError,
	} = useQuery({
		queryKey: ["joinable-events"],
		queryFn: () => eventApi.joinable(),
		enabled: !!session?.user,
	});

	const [selectedEventId, setSelectedEventId] = useState<string>("");
	const [circleName, setCircleName] = useState("");
	const [description, setDescription] = useState("");

	const canSubmit = useMemo(
		() => !!selectedEventId && circleName.trim().length > 0,
		[selectedEventId, circleName],
	);

	const createCircle = useMutation({
		mutationFn: () =>
			circleApi.create({
				eventId: selectedEventId,
				name: circleName.trim(),
				description: description.trim() || undefined,
			}),
		onSuccess: async () => {
			toast.success("サークルを作成しました");
			// 作成で circle_manager になったので所属解決 → サークルのダッシュボードへ
			try {
				const email = session?.user?.email;
				if (email) {
					const resolved = await resolveActiveSpaceAfterAuth(email);
					navigate(resolved.path, { replace: true });
					return;
				}
			} catch {
				// 解決に失敗しても致命的でない: ログインへ戻し、自動解決/案内に委ねる
			}
			navigate("/login", { replace: true });
		},
		onError: (e: any) => {
			toast.error(e?.message || "サークルの作成に失敗しました");
		},
	});

	if (sessionPending) {
		return <Loader />;
	}

	// 未ログインならログインへ (このページはログイン後前提)
	if (!session?.user) {
		navigate("/login", { replace: true });
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
						まだどのサークルにも所属していません。出店するサークルをここで作成すると、
						あなたが<strong className="text-foreground">サークル管理者</strong>になります。
						スタッフの追加はサークル作成後、メンバー管理画面の招待リンクから行えます。
					</p>
				</div>

				{/* 招待経由で参加する人向けの案内 */}
				<div className="border-thin border-border bg-muted/30 p-3 font-mono text-[12px] text-muted-foreground leading-[1.6]">
					すでに<strong className="text-foreground">招待リンク</strong>を受け取っている場合は、
					このページではなくそのリンクを開いてサークルに参加してください。
				</div>

				{/* イベント選択 */}
				<div className="space-y-2">
					<Label>1. 出店するイベントを選択</Label>
					{eventsLoading ? (
						<Loader />
					) : eventsError ? (
						<p className="font-mono text-[12px] text-error">
							イベントの取得に失敗しました。時間をおいて再読み込みしてください。
						</p>
					) : events && events.length > 0 ? (
						<div className="space-y-2">
							{events.map((ev: JoinableEvent) => {
								const selected = ev.id === selectedEventId;
								return (
									<button
										key={ev.id}
										type="button"
										onClick={() => setSelectedEventId(ev.id)}
										className={`w-full text-left p-3 border-thick font-mono text-[13px] transition-colors ${
											selected
												? "border-accent bg-accent/10"
												: "border-border hover:border-foreground"
										}`}
									>
										<div className="font-bold">{ev.eventName}</div>
										{ev.description && (
											<div className="text-muted-foreground text-[12px] mt-1">
												{ev.description}
											</div>
										)}
									</button>
								);
							})}
						</div>
					) : (
						<p className="font-mono text-[12px] text-muted-foreground border-thin border-border p-3 leading-[1.6]">
							参加できるイベントがまだありません。イベントは主催者(システム管理者)が作成します。
							主催者に連絡するか、招待リンクを受け取ってから参加してください。
						</p>
					)}
				</div>

				{/* サークル名 (イベント選択後に有効) */}
				{events && events.length > 0 && (
					<div className="space-y-4">
						<div className="space-y-1">
							<Label htmlFor="circleName">2. サークル名</Label>
							<Input
								id="circleName"
								value={circleName}
								onChange={(e) => setCircleName(e.target.value)}
								placeholder="例: たこ焼き 茨香庵"
								disabled={!selectedEventId}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="circleDescription">説明 (任意)</Label>
							<Input
								id="circleDescription"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="出店ジャンルや販売メニュー等"
								disabled={!selectedEventId}
							/>
						</div>
						<Button
							className="w-full"
							size="lg"
							disabled={!canSubmit || createCircle.isPending}
							onClick={() => createCircle.mutate()}
						>
							{createCircle.isPending ? "作成中..." : "サークルを作成して始める"}
						</Button>
					</div>
				)}

				<div className="pt-2 border-t border-border flex flex-col gap-2">
					<Button variant="outline" className="w-full" onClick={() => navigate("/")}>
						トップへ戻る
					</Button>
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
