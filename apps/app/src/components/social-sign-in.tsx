import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { Button } from "./ui/button";

/**
 * ソーシャルログイン (Google) ボタン。sign-in / sign-up の両フォームで共有する。
 *
 * 設計意図:
 * - ソーシャルログインは OAuth リダイレクト方式なので、メール/パスキーのような
 *   その場の onSuccess コールバックで遷移先を決められない。better-auth は認証後に
 *   `callbackURL` (フロントの URL) へブラウザをリダイレクトする。
 * - API Worker (localhost:8787) とフロント (localhost:3000) はオリジンが異なるため、
 *   callbackURL は必ずフロント側の絶対 URL を渡す (パス相対だと API オリジンに戻ってしまう)。
 * - 遷移先は原則 `/login` に固定し、Login.tsx 側で所属(スペース)解決を行う。
 *   これで Google ログインでも、メールログインと同じ「所属に応じた自動遷移
 *   / スペース選択案内」の導線に合流できる。
 * - deepLink (サインイン画面に付く `?url=` = ログイン後に戻したい画面) があれば優先する。
 *
 * 2026-07-12 追加。将来的にメールサインアップを廃し Apple/Google/パスキーへ寄せる布石。
 */
export function GoogleSignInButton({ deepLink }: { deepLink?: string | null }) {
	const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
	// 2026-07-12: OAuth の戻り先は open redirect 防止のため同一オリジンURLか `/` 始まりの相対パスに限定する。
	const callbackURL = (() => {
		const fallback = `${appOrigin}/login`;
		if (!deepLink) return fallback;
		if (deepLink.startsWith("/")) return `${appOrigin}${deepLink}`;
		try {
			const parsed = new URL(deepLink);
			return parsed.origin === appOrigin ? parsed.toString() : fallback;
		} catch {
			return fallback;
		}
	})();

	return (
		<Button
			type="button"
			variant="outline"
			className="w-full font-mono text-sm uppercase tracking-widest flex items-center justify-center gap-2"
			onClick={async () => {
				try {
					await authClient.signIn.social({
						provider: "google",
						callbackURL,
						errorCallbackURL: `${appOrigin}/login`,
					});
				} catch (e: any) {
					toast.error(e?.message || "Google ログインに失敗しました");
				}
			}}
		>
			{/* Google の公式 4 色 "G" マーク (SVG インライン、外部リクエスト不要) */}
			<svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
				<path
					fill="#4285F4"
					d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
				/>
				<path
					fill="#34A853"
					d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"
				/>
				<path
					fill="#FBBC05"
					d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"
				/>
				<path
					fill="#EA4335"
					d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"
				/>
			</svg>
			Sign in with Google
		</Button>
	);
}
