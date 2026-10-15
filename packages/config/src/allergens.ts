// 2026-10-15 (#124): 消費者庁の表示対象28品目を、来場者・メニュー・トッピングで共通利用する。
export const JAPANESE_ALLERGENS_28 = [
  "えび",
  "かに",
  "くるみ",
  "小麦",
  "そば",
  "卵",
  "乳",
  "落花生",
  "アーモンド",
  "あわび",
  "いか",
  "いくら",
  "オレンジ",
  "カシューナッツ",
  "キウイフルーツ",
  "牛肉",
  "ごま",
  "さけ",
  "さば",
  "大豆",
  "鶏肉",
  "バナナ",
  "豚肉",
  "マカダミアナッツ",
  "もも",
  "やまいも",
  "りんご",
  "ゼラチン",
] as const;

export type JapaneseAllergen = (typeof JAPANESE_ALLERGENS_28)[number];

const allergenSet = new Set<string>(JAPANESE_ALLERGENS_28);

// null は未登録、空配列は「該当なし」として選択済み。崩れた既存JSONは未登録扱いにする。
export function parseJapaneseAllergens(
  value: string | readonly unknown[] | null | undefined,
): JapaneseAllergen[] | null {
  if (value == null) return null;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  return [...new Set(parsed.filter((item): item is JapaneseAllergen =>
    typeof item === "string" && allergenSet.has(item),
  ))];
}
