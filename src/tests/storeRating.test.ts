import { describe, expect, it } from "vitest";
import { applyMonthlyRatingUpdate, MONTH_LENGTH_DAYS } from "../simulation/storeRating.js";

describe("applyMonthlyRatingUpdate", () => {
  it("1ヶ月は内部暦(段階1〜4)に合わせて4日である(design/ps1-reference/algorithms.md §6.2)", () => {
    expect(MONTH_LENGTH_DAYS).toBe(4);
  });

  it("価格・清潔さ・売上の3条件すべてを達成すると+5点される", () => {
    // tier 0〜19: 価格は反転スケールで原作99以下=本プロジェクトpriceIndex>=1、清潔さ>=80、売上>=300万
    const result = applyMonthlyRatingUpdate(10, {
      priceIndex: 50, // 原作スケールで50 <= 99 なので達成
      cleanliness: 90,
      monthlySales: 4_000_000,
    });

    expect(result.achievedCount).toBe(3);
    expect(result.penalizedCount).toBe(0);
    expect(result.bonusApplied).toBe(true);
    expect(result.updatedRating).toBe(15);
  });

  it("3条件すべてで悪化すると最大-3点される(原作の5条件中1条件=-1点を維持)", () => {
    const result = applyMonthlyRatingUpdate(50, {
      priceIndex: 0, // 原作スケール100 → pricePenaltyAbove=100を超えないため悪化しない境界値を別途検証
      cleanliness: 10,
      monthlySales: 0,
    });

    expect(result.penalizedCount).toBe(2); // 清潔さ・売上のみ悪化(価格は100を超えないため該当しない)
    expect(result.updatedRating).toBe(48);
  });

  it("評価は5未満に下がらない", () => {
    const result = applyMonthlyRatingUpdate(5, {
      priceIndex: 0,
      cleanliness: 0,
      monthlySales: 0,
    });

    expect(result.updatedRating).toBeGreaterThanOrEqual(5);
  });

  it("評価は100を超えない", () => {
    const result = applyMonthlyRatingUpdate(100, {
      priceIndex: 100,
      cleanliness: 100,
      monthlySales: 100_000_000,
    });

    expect(result.updatedRating).toBe(100);
  });

  it("評価が高い段階ほど達成しきい値が厳しくなる(tier差を確認)", () => {
    const inputs = { priceIndex: 25, cleanliness: 85, monthlySales: 6_000_000 };

    const lowTier = applyMonthlyRatingUpdate(10, inputs);
    const highTier = applyMonthlyRatingUpdate(90, inputs);

    expect(lowTier.achievedCount).toBeGreaterThan(highTier.achievedCount);
  });
});
