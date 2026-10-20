import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// フォームを未保存のまま閉じようとした時の3択 (保存/破棄/継続) ダイアログ。
// 汎用の2択確認は ConfirmDialog を使う (2026-07-07 リネーム: 旧 ConfirmationDialog)。

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void; // 保存して閉じる等のアクション
  onDiscard: () => void; // 破棄して閉じる
  onCancel: () => void;  // 編集に戻る
  confirmLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  errorMessage?: string | null;
}

export function UnsavedChangesDialog({
  isOpen,
  title,
  description,
  onConfirm,
  onDiscard,
  onCancel,
  confirmLabel = "保存して閉じる",
  discardLabel = "保存せず閉じる",
  cancelLabel = "入力を続ける",
  isPending = false,
  errorMessage,
}: UnsavedChangesDialogProps) {
  // Escape は「編集に戻る」扱い (処理は useFocusTrap 側に統合)
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen, { onEscape: onCancel });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      {/* 背景タップで閉じるための透明オーバーレイ (Modal と同様の挙動) */}
      <div className="absolute inset-0" onClick={onCancel} />
      {/* 2026-10-20: 選択肢を押しやすくし、低い画面ではダイアログ内をスクロールできるようにする。 */}
      <div
        ref={focusTrapRef}
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain border-thick border-border bg-background p-6 sm:p-8 space-y-8 font-mono text-foreground z-10"
      >
        <div className="space-y-2">
          <h3 className="text-base font-bold uppercase tracking-wider text-destructive">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground leading-[1.6]">
            {description}
          </p>
          {errorMessage && <p className="text-xs text-destructive" role="alert">{errorMessage}</p>}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 h-12 border-thick border-primary bg-primary text-primary-foreground font-bold text-sm uppercase rounded-none hover:bg-background hover:text-foreground"
          >
            [{confirmLabel}]
          </Button>
          <Button
            onClick={onDiscard}
            disabled={isPending}
            variant="outline"
            className="flex-1 h-12 border-thick border-destructive bg-destructive text-destructive-foreground font-bold text-sm uppercase rounded-none hover:bg-background hover:text-destructive"
          >
            [{discardLabel}]
          </Button>
          <Button
            onClick={onCancel}
            disabled={isPending}
            variant="outline"
            className="flex-1 h-12 border-thick border-border bg-background text-foreground font-bold text-sm uppercase rounded-none hover:bg-primary hover:text-primary-foreground"
          >
            [{cancelLabel}]
          </Button>
        </div>
      </div>
    </div>
  );
}
