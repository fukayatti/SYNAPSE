import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * トースト (2026-07-06 デザイン刷新)。
 * 周囲のブルータリスト調 (太枠・角なし・mono・影なし) に合わせる。
 * 位置は top-center: レジ等の画面下部の操作ボタンを隠さないため。
 */
const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			position="top-center"
			// 全トーストに閉じる(×)ボタンを表示する。自動で消えるとはいえ、
			// レジ等の操作中に情報を読み切る前に消えると困るため手動で閉じられるようにする (2026-07-11)
			closeButton
			toastOptions={{
				classNames: {
					toast:
						"!rounded-none !border-[3px] !border-border !bg-background !text-foreground !font-mono !shadow-none",
					title: "!font-bold !text-[13px]",
					description: "!text-muted-foreground !text-[12px]",
					actionButton:
						"!rounded-none !border-[3px] !border-border !bg-primary !text-primary-foreground !font-bold !uppercase !text-[11px]",
					cancelButton:
						"!rounded-none !border-[3px] !border-border !bg-background !text-foreground !font-bold !uppercase !text-[11px]",
					// 閉じるボタンも周囲のブルータリスト調 (太枠・角なし) に合わせる。
					// 既定では左上にホバーでしか出ないため、常時表示かつ枠付きで視認性を上げる。
					closeButton:
						"!rounded-none !border-[3px] !border-border !bg-background !text-foreground hover:!bg-muted !opacity-100",
					error: "!border-destructive",
					success: "!border-border",
					warning: "!border-warning",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
