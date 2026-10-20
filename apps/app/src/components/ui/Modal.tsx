import { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

// 2026-07-04: 各 FormModal (Circle/Menu/Topping/Staff/EventStaff) が同一の
// モーダル外枠 JSX をコピペしていたため共通化。RawBlock デザイン
// (backdrop-blur / border-thick / 角丸なし / font-mono) を一箇所に集約する。
// あわせて Escape キー閉じ・背景スクロールロック・aria 属性を付与し UX/a11y を改善。
// 2026-10-21: 親の overflow/stacking context によるクリップを防ぐため body 直下へ描画する。

const MAX_WIDTH: Record<NonNullable<ModalProps["maxWidth"]>, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  // 2026-10-02: 列数の多い管理一覧では画面幅と高さを使い、表の可視領域を確保する。
  full: "max-w-none h-full max-h-none",
};

interface ModalProps {
  isOpen: boolean;
  /** ヘッダーに表示するタイトル。呼び出し側で `[...]` を含めて渡す。 */
  title: string;
  /** タイトル下の補足説明 (任意)。 */
  subtitle?: string;
  /** 背景クリック・×ボタン・Escape で呼ばれる閉じるハンドラ。 */
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: "md" | "lg" | "xl" | "full";
  // 2026-10-20: 全画面一覧など、呼び出し側が残りの高さを子要素へ配分する場合に使う。
  contentClassName?: string;
  /** 確認ダイアログ等をこのモーダルの上に重ねる場合に z-index を調整する。 */
  zIndexClassName?: string;
}

export function Modal({
  isOpen,
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "lg",
  contentClassName,
  zIndexClassName = "z-50",
}: ModalProps) {
  useBodyScrollLock(isOpen);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen, { onEscape: onClose });
  const titleId = useId();

  if (!isOpen) return null;

  return createPortal((
    <div
      className={cn(
        cn(
          "fixed inset-0 flex items-center justify-center overflow-y-auto bg-foreground/80 backdrop-blur-sm",
          maxWidth === "full" ? "viewport-safe-area-compact" : "viewport-safe-area",
        ),
        zIndexClassName,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* 背景タップで閉じるための透明オーバーレイ */}
      <div className="absolute inset-0" onClick={onClose} />

      <Card
        ref={focusTrapRef}
        tabIndex={-1}
        className={cn(
          "relative min-h-0 w-full min-w-0 max-w-full bg-background border-thick border-border shadow-none font-mono text-foreground z-10 max-h-[calc(100dvh-2rem)] flex flex-col",
          // 2026-10-20: 全画面モーダルは内側の余白を縮め、縦の短い画面でも一覧の表示領域を確保する。
          maxWidth === "full" && "max-h-full p-2 sm:p-4",
          MAX_WIDTH[maxWidth],
        )}
      >
        <CardHeader className="min-w-0 pb-3 border-b-thick border-border flex flex-row items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 space-y-1">
            <CardTitle id={titleId} className="break-words text-sm font-bold uppercase">{title}</CardTitle>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1 hover:bg-muted border-thick border-transparent hover:border-border transition-all shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className={cn("min-h-0 min-w-0 pt-4 space-y-4 flex-1 overflow-y-auto overscroll-contain", contentClassName)}>{children}</CardContent>
      </Card>
    </div>
  ), document.body);
}
