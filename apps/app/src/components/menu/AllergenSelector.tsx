import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { JAPANESE_ALLERGENS_28, type JapaneseAllergen } from "@fesflow/config/allergens";

export function AllergenSelector({
  value,
  onChange,
  helpText = "該当する項目をすべて選んでください。該当なしの場合も「なし」を選択してください。",
}: {
  value: JapaneseAllergen[] | null;
  onChange: (value: JapaneseAllergen[] | null) => void;
  helpText?: string;
}) {
  const selected = value ?? [];
  const chooseNone = value !== null && value.length === 0;

  return (
    <section className="space-y-2 border-thin border-border bg-muted/10 p-3">
      <div>
        <Label className="text-xs font-bold uppercase">アレルゲン登録 <span className="text-destructive">*</span></Label>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{helpText}</p>
      </div>
      <button
        type="button"
        aria-pressed={chooseNone}
        onClick={() => onChange([])}
        className={`w-full border-thick px-3 py-2 text-left text-xs font-bold ${chooseNone ? "border-success bg-success/10 text-success" : "border-border bg-background hover:bg-muted"}`}
      >
        {chooseNone ? "✓ アレルゲンなし（選択済み）" : "アレルゲンなし"}
      </button>
      <div className="grid grid-cols-2 gap-1 border-thin border-border bg-background p-2 sm:grid-cols-3">
        {JAPANESE_ALLERGENS_28.map((allergen, index) => {
          const id = `allergen-${index}`;
          const checked = selected.includes(allergen);
          return (
            <label key={allergen} htmlFor={id} className="flex cursor-pointer items-center gap-2 p-1.5 text-[11px]">
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(next) => onChange(next === true
                  ? [...selected, allergen]
                  : selected.length === 1 ? null : selected.filter((item) => item !== allergen))}
              />
              <span>{allergen}</span>
            </label>
          );
        })}
      </div>
      {value === null && <p className="text-[10px] font-bold text-warning">登録内容を選択してください。</p>}
    </section>
  );
}
