export type StampRallyQualification = {
  minQualifiedAreaCount: number | null;
  minDistinctCirclesPerArea: {
    default: number;
    byArea: Record<string, number>;
  };
  requiredAreaIds: string[];
  minTotalDistinctCircles: number | null;
};

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100;
}

// 2026-10-19: 条件を型付きで正規化し、来場者の達成判定と実績集計で同じ意味を保つ。
export function parseStampRallyQualification(value: unknown): StampRallyQualification | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const minQualifiedAreaCount = source.minQualifiedAreaCount;
  if (minQualifiedAreaCount !== null && (!Number.isInteger(minQualifiedAreaCount) || Number(minQualifiedAreaCount) < 1 || Number(minQualifiedAreaCount) > 50)) {
    return null;
  }
  const minTotalDistinctCircles = source.minTotalDistinctCircles;
  if (minTotalDistinctCircles !== null && !isCount(minTotalDistinctCircles)) return null;
  const perArea = source.minDistinctCirclesPerArea;
  if (!perArea || typeof perArea !== "object" || Array.isArray(perArea)) return null;
  const perAreaValue = perArea as Record<string, unknown>;
  if (!isCount(perAreaValue.default)) return null;
  const byAreaSource = perAreaValue.byArea;
  if (!byAreaSource || typeof byAreaSource !== "object" || Array.isArray(byAreaSource)) return null;
  const byArea: Record<string, number> = {};
  for (const [areaId, count] of Object.entries(byAreaSource)) {
    if (!areaId || !isCount(count)) return null;
    byArea[areaId] = count;
  }
  if (!Array.isArray(source.requiredAreaIds) || !source.requiredAreaIds.every((id) => typeof id === "string" && id.length > 0)) {
    return null;
  }
  if (new Set(source.requiredAreaIds).size !== source.requiredAreaIds.length) return null;
  return {
    minQualifiedAreaCount: minQualifiedAreaCount as number | null,
    minDistinctCirclesPerArea: { default: perAreaValue.default, byArea },
    requiredAreaIds: source.requiredAreaIds as string[],
    minTotalDistinctCircles: minTotalDistinctCircles as number | null,
  };
}

export function resolveStampRallyQualification(
  raw: unknown,
  targetAreaIds: string[],
  requiredCount: number,
  requiredCountByArea: Record<string, number>,
): StampRallyQualification {
  const parsed = parseStampRallyQualification(raw);
  if (parsed) return parsed;

  // 2026-10-19: 旧設定は保存時の意味を保つ。全エリア別設定は全対象エリア達成、その他は合計店舗数で判定する。
  const hasLegacyAreaRequirements = targetAreaIds.length > 0 && targetAreaIds.every((areaId) => requiredCountByArea[areaId] != null);
  return {
    minQualifiedAreaCount: hasLegacyAreaRequirements ? targetAreaIds.length : null,
    minDistinctCirclesPerArea: {
      default: 1,
      byArea: hasLegacyAreaRequirements ? { ...requiredCountByArea } : {},
    },
    requiredAreaIds: [],
    minTotalDistinctCircles: hasLegacyAreaRequirements ? null : requiredCount,
  };
}

export function requiredCirclesForArea(qualification: StampRallyQualification, areaId: string): number {
  return qualification.minDistinctCirclesPerArea.byArea[areaId] ?? qualification.minDistinctCirclesPerArea.default;
}

export function evaluateStampRallyQualification(input: {
  qualification: StampRallyQualification;
  targetAreaIds: string[];
  stampedCountByArea: ReadonlyMap<string, number>;
  totalStampedCircleCount: number;
}) {
  const { qualification, targetAreaIds, stampedCountByArea, totalStampedCircleCount } = input;
  const qualifiedAreaIds = targetAreaIds.filter((areaId) =>
    (stampedCountByArea.get(areaId) ?? 0) >= requiredCirclesForArea(qualification, areaId)
  );
  const areaConditionMet = qualification.minQualifiedAreaCount === null || (
    qualifiedAreaIds.length >= qualification.minQualifiedAreaCount &&
    qualification.requiredAreaIds.every((areaId) => qualifiedAreaIds.includes(areaId))
  );
  const totalConditionMet = qualification.minTotalDistinctCircles === null ||
    totalStampedCircleCount >= qualification.minTotalDistinctCircles;
  return {
    eligible: (qualification.minQualifiedAreaCount !== null || qualification.minTotalDistinctCircles !== null) && areaConditionMet && totalConditionMet,
    qualifiedAreaIds,
    qualifiedAreaCount: qualifiedAreaIds.length,
  };
}
