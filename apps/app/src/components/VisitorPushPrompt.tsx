import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useVisitor } from "@/hooks/useVisitor";
import { pushApi } from "@/lib/api";

const DISMISSED_KEY = "fesflow:visitor-push-prompt-dismissed";

function isStandalonePwa() {
	return window.matchMedia("(display-mode: standalone)").matches ||
		("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

// 2026-10-22: PWA利用中の来場者には通知の利点と設定場所を知らせ、通知許可を自動で要求しない。
export default function VisitorPushPrompt() {
	const { userId, isLoaded } = useVisitor();
	const { pathname } = useLocation();
	const [isStandalone, setIsStandalone] = useState(false);
	const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
	const [dismissed, setDismissed] = useState(false);
	const config = useQuery({
		queryKey: ["pushConfiguration"],
		queryFn: () => pushApi.configuration(),
		staleTime: 5 * 60_000,
		enabled: Boolean(userId),
	});

	useEffect(() => {
		setIsStandalone(isStandalonePwa());
		if (!("Notification" in window)) return;

		const storageKey = `${DISMISSED_KEY}:${userId ?? "guest"}`;
		const syncPermission = () => setPermission(Notification.permission);
		setDismissed(sessionStorage.getItem(storageKey) === "1");
		syncPermission();
		window.addEventListener("focus", syncPermission);
		document.addEventListener("visibilitychange", syncPermission);
		return () => {
			window.removeEventListener("focus", syncPermission);
			document.removeEventListener("visibilitychange", syncPermission);
		};
	}, [userId]);

	const dismiss = () => {
		if (userId) sessionStorage.setItem(`${DISMISSED_KEY}:${userId}`, "1");
		setDismissed(true);
	};

	if (!isLoaded || !userId || !isStandalone || pathname.startsWith("/visitor/notifications") || !config.data?.enabled || dismissed || permission === "unsupported" || permission === "granted") {
		return null;
	}

	return (
		<aside className="mx-auto flex w-full max-w-3xl items-start gap-3 border-b-thick border-border bg-muted px-3 py-3 font-mono sm:px-4" aria-label="通知設定の案内">
			<Bell className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
			<div className="min-w-0 flex-1">
				<p className="text-xs font-black">通知を設定しませんか？</p>
				<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
					{permission === "denied"
						? "通知がブロックされています。ブラウザまたは端末の設定からFesFlowの通知を許可してください。"
						: "注文の完成やイベントのお知らせを受け取るには、通知設定が必要です。"}
				</p>
				<Link to="/visitor/notifications" className="mt-2 inline-flex min-h-10 items-center border-thick border-border bg-background px-3 text-xs font-bold underline underline-offset-2 hover:bg-primary hover:text-primary-foreground">
					通知設定へ
				</Link>
			</div>
			<button type="button" onClick={dismiss} aria-label="通知設定の案内を閉じる" className="flex min-h-10 min-w-10 shrink-0 items-center justify-center border-thin border-border">
				<X className="h-4 w-4" aria-hidden="true" />
			</button>
		</aside>
	);
}
