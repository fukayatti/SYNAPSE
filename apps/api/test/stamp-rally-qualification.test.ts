import { describe, expect, it } from "vitest";
import { evaluateStampRallyQualification, resolveStampRallyQualification } from "../src/lib/stamp-rally-qualification";

describe("スタンプラリー条件", () => {
  // 2026-10-19: エリア数・必須エリア・全体店舗数がAND条件で評価されることを確認する。
  it("エリア別必要数と必須エリア、合計店舗数をすべて満たしたとき達成する", () => {
    const targetAreaIds = ["a", "b", "c", "d", "e"];
    const qualification = {
      minQualifiedAreaCount: 3,
      minDistinctCirclesPerArea: { default: 1, byArea: { a: 2 } },
      requiredAreaIds: ["a"],
      minTotalDistinctCircles: 4,
    };
    const before = evaluateStampRallyQualification({
      qualification,
      targetAreaIds,
      stampedCountByArea: new Map([["a", 1], ["b", 1], ["c", 1], ["d", 1]]),
      totalStampedCircleCount: 4,
    });
    expect(before.eligible).toBe(false);

    const after = evaluateStampRallyQualification({
      qualification,
      targetAreaIds,
      stampedCountByArea: new Map([["a", 2], ["b", 1], ["c", 1]]),
      totalStampedCircleCount: 4,
    });
    expect(after).toMatchObject({ eligible: true, qualifiedAreaCount: 3, qualifiedAreaIds: ["a", "b", "c"] });
  });

  it("設定未保存時は現行の3店舗条件を初期値にする", () => {
    const qualification = resolveStampRallyQualification(null);
    const result = evaluateStampRallyQualification({
      qualification,
      targetAreaIds: ["a", "b"],
      stampedCountByArea: new Map(),
      totalStampedCircleCount: 3,
    });
    expect(qualification.minQualifiedAreaCount).toBeNull();
    expect(qualification.minTotalDistinctCircles).toBe(3);
    expect(result.eligible).toBe(true);
  });

  it("条件が未設定なら参加者を達成扱いにしない", () => {
    const result = evaluateStampRallyQualification({
      qualification: {
        minQualifiedAreaCount: null,
        minDistinctCirclesPerArea: { default: 1, byArea: {} },
        requiredAreaIds: [],
        minTotalDistinctCircles: null,
      },
      targetAreaIds: ["a"],
      stampedCountByArea: new Map([["a", 1]]),
      totalStampedCircleCount: 1,
    });
    expect(result.eligible).toBe(false);
  });
});
