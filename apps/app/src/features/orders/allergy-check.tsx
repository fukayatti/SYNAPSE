import { parseJapaneseAllergens, type JapaneseAllergen } from "@fesflow/config/allergens";
import type { CartLine } from "./cart";

type AllergenTopping = { id: string; name: string; allergens: string | null };
type AllergenMenu = { id: string; name: string; allergens: string | null; toppings: AllergenTopping[] };

export interface CartAllergyWarning {
  lineId: string;
  menuName: string;
  matches: JapaneseAllergen[];
  unregistered: string[];
}

// 2026-10-15 (#124): 選択中のメニュー本体と選択されたトッピングだけを家族全体の申告と照合する。
export function getCartAllergyWarnings(
  cart: CartLine[],
  menus: ReadonlyMap<string, AllergenMenu>,
  familyAllergies: JapaneseAllergen[] | null,
): CartAllergyWarning[] {
  const familySet = new Set(familyAllergies ?? []);
  return cart.map((line) => {
    const matches = new Set<JapaneseAllergen>();
    const unregistered: string[] = [];
    const menu = menus.get(line.menuId);

    if (!menu) {
      unregistered.push(line.menuName);
    } else {
      const menuAllergens = parseJapaneseAllergens(menu.allergens);
      if (menuAllergens === null) unregistered.push(menu.name);
      else menuAllergens.forEach((item) => { if (familySet.has(item)) matches.add(item); });

      for (const selected of line.toppings) {
        const topping = menu.toppings.find((item) => item.id === selected.toppingId);
        if (!topping) {
          unregistered.push(`${menu.name}（${selected.toppingName}）`);
          continue;
        }
        const toppingAllergens = parseJapaneseAllergens(topping.allergens);
        if (toppingAllergens === null) unregistered.push(`${menu.name}（${topping.name}）`);
        else toppingAllergens.forEach((item) => { if (familySet.has(item)) matches.add(item); });
      }
    }

    return { lineId: line.lineId, menuName: line.menuName, matches: [...matches], unregistered };
  });
}

export function OrderAllergyWarning({
  warnings,
  familyAllergies,
  enabled,
}: {
  warnings: CartAllergyWarning[];
  familyAllergies: JapaneseAllergen[] | null;
  enabled: boolean;
}) {
  if (!enabled) return null;
  const matches = warnings.filter((warning) => warning.matches.length > 0);
  const unregistered = [...new Set(warnings.flatMap((warning) => warning.unregistered))];
  const profileMissing = familyAllergies === null;
  if (!profileMissing && matches.length === 0 && unregistered.length === 0) return null;

  return (
    <div role="alert" className="border-thick border-warning bg-warning/10 p-3 text-xs space-y-1.5">
      <p className="font-black">アレルギー情報を確認してください</p>
      {profileMissing && <p>家族アレルギーが未登録です。マイページで申告してください。</p>}
      {matches.map((warning) => (
        <p key={warning.lineId}>
          {warning.menuName}: 登録したアレルギーと一致（{warning.matches.join("・")}）
        </p>
      ))}
      {unregistered.length > 0 && (
        <p>アレルゲン情報未登録: {unregistered.join("・")}。提供元に確認してください。</p>
      )}
    </div>
  );
}
