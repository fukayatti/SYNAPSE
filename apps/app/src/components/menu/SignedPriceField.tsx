import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";

// 2026-10-21: 金額は数値のまま保持し、数字を入力した後に符号ボタンで負値へ切り替えられるようにする。
/** 金額はAPIと同じnumberで保持し、スマートフォンでも符号を切り替えられる入力欄。 */
export function SignedPriceField({
  id,
  label,
  value,
  onChange,
  onBlur,
  onToggleSign,
}: {
  id: string;
  label: string;
  value: number;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onBlur: React.FocusEventHandler<HTMLInputElement>;
  onToggleSign: () => void;
}) {
  const isNegative = value < 0;

  return (
    <div className="min-w-0 space-y-1">
      <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-end gap-2">
        <FormField
          id={id}
          label={label}
          required
          type="number"
          min={-1000000}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className={isNegative ? "text-destructive" : undefined}
        />
        <Button
          type="button"
          variant="outline"
          aria-label={isNegative ? "金額をプラスに戻す" : "金額をマイナスにする"}
          title={isNegative ? "プラスに戻す" : "割引額にする"}
          disabled={value === 0}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onToggleSign}
          className={`h-10 min-h-10 px-0 text-xl font-bold ${isNegative ? "border-error text-error" : ""}`}
        >
          ±
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        金額を入力してから ± を押すと、値引き額にできます。
      </p>
    </div>
  );
}
