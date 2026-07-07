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
