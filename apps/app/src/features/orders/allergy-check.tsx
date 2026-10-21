import { useEffect, useState } from "react";
import { parseJapaneseAllergens, type JapaneseAllergen } from "@fesflow/config/allergens";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import type { CartLine } from "./cart";

type AllergenTopping = { id: string; name: string; allergens: string | null };
type AllergenMenu = { id: string; name: string; allergens: string | null; toppings: AllergenTopping[] };

// 2026-10-21: メニュー本体と選択トッピングを分け、主メニューの一致だけ赤い確認モーダルへ振り分ける。
export interface CartAllergyWarning {
  lineId: string;
  menuName: string;
  menuMatches: JapaneseAllergen[];
  toppingMatches: JapaneseAllergen[];
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
    const menuMatches = new Set<JapaneseAllergen>();
    const toppingMatches = new Set<JapaneseAllergen>();
    const unregistered: string[] = [];
    const menu = menus.get(line.menuId);

    if (!menu) {
      unregistered.push(line.menuName);
    } else {
      const menuAllergens = parseJapaneseAllergens(menu.allergens);
      if (menuAllergens === null) unregistered.push(menu.name);
      else menuAllergens.forEach((item) => { if (familySet.has(item)) menuMatches.add(item); });

      for (const selected of line.toppings) {
        const topping = menu.toppings.find((item) => item.id === selected.toppingId);
        if (!topping) {
          unregistered.push(`${menu.name}（${selected.toppingName}）`);
          continue;
        }
        const toppingAllergens = parseJapaneseAllergens(topping.allergens);
        if (toppingAllergens === null) unregistered.push(`${menu.name}（${topping.name}）`);
        else toppingAllergens.forEach((item) => { if (familySet.has(item)) toppingMatches.add(item); });
      }
    }

    return { lineId: line.lineId, menuName: line.menuName, menuMatches: [...menuMatches], toppingMatches: [...toppingMatches], unregistered };
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
  const [dismissedMenuMatchSignature, setDismissedMenuMatchSignature] = useState("");
  const menuMatches = warnings.filter((warning) => warning.menuMatches.length > 0);
  const toppingMatches = warnings.filter((warning) => warning.toppingMatches.length > 0);
  const unregistered = [...new Set(warnings.flatMap((warning) => warning.unregistered))];
  const profileMissing = familyAllergies === null;
  const menuMatchSignature = menuMatches
    .map((warning) => `${warning.lineId}:${warning.menuMatches.join(",")}`)
    .join("|");
  useEffect(() => {
    if (!enabled || menuMatchSignature === "") setDismissedMenuMatchSignature("");
  }, [enabled, menuMatchSignature]);
  if (!enabled) return null;
  const showMenuMatchDialog = menuMatchSignature !== "" && menuMatchSignature !== dismissedMenuMatchSignature;
  if (!profileMissing && toppingMatches.length === 0 && unregistered.length === 0 && !showMenuMatchDialog) return null;

  return (
    <>
      {(profileMissing || toppingMatches.length > 0 || unregistered.length > 0) && (
        <div role="alert" className="border-thick border-warning bg-warning/10 p-3 text-xs space-y-1.5">
          <p className="font-black">アレルギー情報を確認してください</p>
          {profileMissing && <p>家族アレルギーが未登録です。マイページで申告してください。</p>}
          {toppingMatches.map((warning) => (
            <p key={warning.lineId}>
              {warning.menuName}: 登録したアレルギーとトッピングが一致（{warning.toppingMatches.join("・")}）
            </p>
          ))}
          {unregistered.length > 0 && (
            <p>アレルゲン情報未登録: {unregistered.join("・")}。提供元に確認してください。</p>
          )}
        </div>
      )}
      {/* 2026-10-21: 主メニュー本体の一致は見落としにくい赤いモーダルで伝え、確認後に注文内容へ戻れるようにする。 */}
      <Modal
        isOpen={showMenuMatchDialog}
        onClose={() => setDismissedMenuMatchSignature(menuMatchSignature)}
        title="[アレルギー警告]"
        maxWidth="md"
      >
        <div role="alert" className="space-y-3 border-thick border-destructive bg-destructive p-4 text-sm font-bold text-white">
          <p>メニューに登録したアレルギーが含まれています。注文前に内容を確認してください。</p>
          {menuMatches.map((warning) => (
            <p key={warning.lineId}>
              {warning.menuName}: {warning.menuMatches.join("・")}
            </p>
          ))}
        </div>
        <Button
          type="button"
          variant="destructive"
          className="w-full min-h-11"
          onClick={() => setDismissedMenuMatchSignature(menuMatchSignature)}
        >
          確認しました
        </Button>
      </Modal>
    </>
  );
}
