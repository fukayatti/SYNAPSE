import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useVisitor } from "@/hooks/useVisitor";
import { pushApi, type BrowserPushSubscription } from "@/lib/api";

type OwnerType = "staff" | "visitor";

function decodeApplicationServerKey(value: string) {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(base64);
	return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isIosDevice() {
	return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
	return window.matchMedia("(display-mode: standalone)").matches ||
		("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export function PushNotificationControl({ ownerType }: { ownerType: OwnerType }) {
	const { userId: visitorId } = useVisitor();
	const [browserSubscription, setBrowserSubscription] = useState<PushSubscription | null>(null);
	const [isPending, setIsPending] = useState(false);
	const identityReady = ownerType === "staff" || Boolean(visitorId);
	const supported = typeof window !== "undefined" && "serviceWorker" in navigator &&	"PushManager" in window && "Notification" in window;

	const config = useQuery({
		queryKey: ["pushConfiguration"],
		queryFn: () => pushApi.configuration(),
		staleTime: 5 * 60_000,
		enabled: identityReady,
	});

	useEffect(() => {
		if (!supported || !config.data?.enabled) return;
		let active = true;
		void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
			.then((subscription) => {
				if (active) setBrowserSubscription(subscription);
			})
			.catch(() => {
				if (active) setBrowserSubscription(null);
			});
		return () => { active = false; };
	}, [supported, config.data?.enabled]);

	const endpoint = browserSubscription?.endpoint ?? "";
	const status = useQuery({
		queryKey: ["pushSubscriptionStatus", ownerType, visitorId, endpoint],
		queryFn: () => pushApi.status({ endpoint, ...(ownerType === "visitor" ? { visitorId: visitorId! } : {}) }),
		enabled: identityReady && Boolean(config.data?.enabled) && Boolean(endpoint),
	});

	const toggle = async () => {
		if (!config.data?.enabled) return;
		setIsPending(true);
		try {
			const visitorTarget = ownerType === "visitor" ? { visitorId: visitorId! } : {};
			if (browserSubscription && status.data?.subscribed) {
				await pushApi.unsubscribe({ ...visitorTarget, endpoint: browserSubscription.endpoint });
				await browserSubscription.unsubscribe();
				setBrowserSubscription(null);
				await status.refetch();
				toast.success("この端末の通知を停止しました");
				return;
			}

			if (isIosDevice() && !isStandalone()) {
				toast.info("Safariの共有メニューからホーム画面に追加してから通知を設定してください");
				return;
			}
			if (Notification.permission === "denied") {
				toast.error("ブラウザの設定で通知を許可してください");
				return;
			}
			const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
			if (permission !== "granted") return;

			const registration = await navigator.serviceWorker.ready;
			const subscription = browserSubscription ?? await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: decodeApplicationServerKey(config.data.publicKey!),
			});
			const serialized = subscription.toJSON();
			if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
				throw new Error("通知設定を読み取れませんでした");
			}
			const input: BrowserPushSubscription = {
				endpoint: serialized.endpoint,
				expirationTime: serialized.expirationTime ?? null,
				keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
			};
			await pushApi.subscribe({ ...visitorTarget, subscription: input });
			setBrowserSubscription(subscription);
			await status.refetch();
			toast.success("この端末で通知を受け取れるようになりました");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "通知を設定できませんでした");
		} finally {
			setIsPending(false);
		}
	};

	if (!identityReady) return null;
	const subscribed = Boolean(browserSubscription && status.data?.subscribed);
	const isIosSetupRequired = typeof navigator !== "undefined" && isIosDevice() && !isStandalone();

	return (
		<section className="space-y-2 border-t-thick border-border pt-3" aria-labelledby={`push-title-${ownerType}`}>
			<div className="flex min-w-0 items-start gap-2">
				<Bell className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
				<div className="min-w-0 flex-1">
					<h3 id={`push-title-${ownerType}`} className="text-xs font-black">端末への通知</h3>
					<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
						{ownerType === "visitor"
							? "注文の完成、お知らせ、開催後のレビュー依頼を通知します。"
							: "イベント告知、在庫アラート、システムのお知らせを通知します。"}
					</p>
				</div>
			</div>
			{!supported ? (
				<p className="border-l-thick border-warning bg-warning/10 px-2 py-2 text-[10px] leading-relaxed">このブラウザはプッシュ通知に対応していません。</p>
			) : !config.data?.enabled ? (
				<p className="border-l-thick border-muted-foreground/40 bg-muted/40 px-2 py-2 text-[10px] leading-relaxed">通知サーバーの鍵が未設定です。設定後に利用できます。</p>
			) : isIosSetupRequired ? (
				<p className="border-l-thick border-info bg-info/10 px-2 py-2 text-[10px] leading-relaxed">ホーム画面に追加したFesFlowから通知を設定できます。</p>
			) : Notification.permission === "denied" ? (
				<p className="border-l-thick border-warning bg-warning/10 px-2 py-2 text-[10px] leading-relaxed">通知がブロックされています。ブラウザまたは端末の設定からこのサイトの通知を許可してください。</p>
			) : (
				<Button
					type="button"
					variant={subscribed ? "outline" : "default"}
					aria-pressed={subscribed}
					disabled={isPending || config.isLoading || status.isFetching}
					onClick={() => void toggle()}
					className="min-h-10 w-full justify-center gap-2 rounded-none border-thick border-border text-xs"
				>
					{subscribed ? <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Bell className="h-3.5 w-3.5" aria-hidden="true" />}
					{isPending ? "設定中…" : subscribed ? "この端末の通知を停止" : "この端末で通知を受け取る"}
				</Button>
			)}
		</section>
	);
}
