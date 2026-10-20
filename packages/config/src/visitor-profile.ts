// 2026-10-20: 受付で収集するプロフィール項目と利用目的を、フォームと案内で共有する。
export const VISITOR_AGE_GROUPS = [
  { value: "under_10", label: "10歳未満" },
  { value: "10s", label: "10代" },
  { value: "20s", label: "20代" },
  { value: "30s", label: "30代" },
  { value: "40s", label: "40代" },
  { value: "50s", label: "50代" },
  { value: "60s", label: "60代" },
  { value: "70s", label: "70代" },
  { value: "80s", label: "80代" },
  { value: "90s_plus", label: "90代以上" },
] as const;

export type VisitorAgeGroup = (typeof VISITOR_AGE_GROUPS)[number]["value"];

export const VISITOR_PROFILE_PURPOSES = {
  ageGroup: "来場者属性および購入傾向の分析、紛失時の本人確認",
  nickname: "紛失時の本人確認",
  allergies: "食品注文時のアレルギーに関する警告表示",
} as const;

export const VISITOR_AGE_GROUP_VALUES = VISITOR_AGE_GROUPS.map(({ value }) => value) as [
  VisitorAgeGroup,
  ...VisitorAgeGroup[],
];

export function visitorAgeGroupLabel(value: string | null | undefined): string {
  return VISITOR_AGE_GROUPS.find((group) => group.value === value)?.label ?? "未設定";
}
