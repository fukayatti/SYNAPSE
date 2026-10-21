import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
	return window.matchMedia("(display-mode: standalone)").matches ||
		("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export default function PwaLifecycle() {
	const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
	const [isIosInstallHint, setIsIosInstallHint] = useState(false);
	const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;

		let disposed = false;
		let reloading = false;
		const onControllerChange = () => {
			if (reloading) return;
			reloading = true;
			window.location.reload();
		};
		const watchWorker = (worker: ServiceWorker) => {
			const onStateChange = () => {
				if (worker.state !== "installed" || disposed) return;
				worker.removeEventListener("statechange", onStateChange);
				if (!navigator.serviceWorker.controller) {
					worker.postMessage({ type: "SKIP_WAITING" });
				} else {
					setUpdateWorker(worker);
				}
			};
			worker.addEventListener("statechange", onStateChange);
			// 2026-10-21: register()解決前にinstallingが始まる場合も更新案内を取りこぼさない。
			onStateChange();
		};

		navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
		void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
			if (disposed) return;
			if (registration.waiting && navigator.serviceWorker.controller) setUpdateWorker(registration.waiting);
			const onUpdateFound = () => {
				if (registration.installing) watchWorker(registration.installing);
			};
			registration.addEventListener("updatefound", onUpdateFound);
			onUpdateFound();
		}).catch(() => {
			// PWA は補助機能として扱い、登録失敗で通常の画面操作を妨げない。
		});

		return () => {
			disposed = true;
			navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
		};
	}, []);

	useEffect(() => {
		const onBeforeInstall = (event: Event) => {
			event.preventDefault();
			setInstallPrompt(event as BeforeInstallPromptEvent);
		};
		const onInstalled = () => {
			setInstallPrompt(null);
			setIsIosInstallHint(false);
			setDismissed(true);
		};
		window.addEventListener("beforeinstallprompt", onBeforeInstall);
		window.addEventListener("appinstalled", onInstalled);

		const userAgent = navigator.userAgent;
		const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
		if (isIos && !isStandalone() && localStorage.getItem("fesflow-pwa-install-dismissed") !== "1") {
			setIsIosInstallHint(true);
		}
		return () => {
			window.removeEventListener("beforeinstallprompt", onBeforeInstall);
			window.removeEventListener("appinstalled", onInstalled);
		};
	}, []);

	const install = async () => {
		if (!installPrompt) return;
		await installPrompt.prompt();
		const result = await installPrompt.userChoice;
		setInstallPrompt(null);
		if (result.outcome === "accepted") setDismissed(true);
	};

	const applyUpdate = () => {
		updateWorker?.postMessage({ type: "SKIP_WAITING" });
		setUpdateWorker(null);
	};

	const dismissInstallHint = () => {
		localStorage.setItem("fesflow-pwa-install-dismissed", "1");
		setIsIosInstallHint(false);
		setDismissed(true);
	};

	if (updateWorker) {
		return (
			<div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[100] mx-auto flex max-w-lg items-center gap-3 border-thick border-border bg-background p-3 text-foreground shadow-lg" role="status" aria-live="polite">
				<RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
				<p className="min-w-0 flex-1 text-xs font-bold">新しいバージョンを利用できます</p>
				<Button onClick={applyUpdate} className="min-h-10 rounded-none border-thick border-border px-3 text-xs">更新</Button>
			</div>
		);
	}

	if (dismissed) return null;
	if (installPrompt) {
		return (
			<div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[70] mx-auto flex max-w-lg items-center gap-3 border-thick border-border bg-background p-3 text-foreground shadow-lg" role="region" aria-label="アプリのインストール">
				<Download className="h-4 w-4 shrink-0" aria-hidden="true" />
				<p className="min-w-0 flex-1 text-xs font-bold">FesFlowをホーム画面に追加</p>
				<Button onClick={() => void install()} className="min-h-10 rounded-none border-thick border-border px-3 text-xs">追加</Button>
				<button onClick={dismissInstallHint} aria-label="インストール案内を閉じる" className="min-h-10 min-w-10 border border-border p-2"><X className="mx-auto h-4 w-4" aria-hidden="true" /></button>
			</div>
		);
	}
	if (isIosInstallHint) {
		return (
			<div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[70] mx-auto flex max-w-lg items-start gap-3 border-thick border-border bg-background p-3 text-foreground shadow-lg" role="region" aria-label="ホーム画面への追加方法">
				<Download className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
				<div className="min-w-0 flex-1 text-xs">
					<p className="font-bold">ホーム画面に追加すると通知を受け取れます</p>
					<p className="mt-1 leading-relaxed text-muted-foreground">共有ボタンから「ホーム画面に追加」を選んでください。</p>
				</div>
				<button onClick={dismissInstallHint} aria-label="インストール案内を閉じる" className="min-h-10 min-w-10 border border-border p-2"><X className="mx-auto h-4 w-4" aria-hidden="true" /></button>
			</div>
		);
	}
	return null;
}
