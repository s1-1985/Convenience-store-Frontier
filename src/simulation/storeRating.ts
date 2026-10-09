// PS1版「ザ・コンビニ」店舗評価アルゴリズムの移植(design/ps1-reference/algorithms.md §4.2、
// design/DECISIONS/ADR-0008-faithful-ps1-reproduction.md参照)。
//
// 原作は価格・サービス・警備・清潔さ・売上の5条件で判定するが、本プロジェクトには
// サービス・警備に相当する数値が存在しないため、価格・清潔さ・売上の3条件のみを移植する
// (ADR-0008で確認済みのスコープ)。「達成数>=3で+5点」は原作の定数をそのまま使うため、
// 3条件しかない本実装では実質「3条件すべて達成」が+5の条件になる(原作の「5条件中3条件」
// より厳しい)。これは数値を独自に補正しない、という忠実再現の方針上の既知の帰結である。

export const MONTH_LENGTH_DAYS = 4;

interface RatingTierThresholds {
  priceAchieveAtMost: number;
  cleanlinessAchieveAtLeast: number;
  salesAchieveAtLeast: number;
  pricePenaltyAbove: number;
  cleanlinessPenaltyBelow: number;
  salesPenaltyBelow: number;
}

// design/ps1-reference/algorithms.md §4.2の表(評価0〜19/20〜39/.../100の6段階)。
const RATING_TIERS: readonly RatingTierThresholds[] = [
  { priceAchieveAtMost: 99, cleanlinessAchieveAtLeast: 80, salesAchieveAtLeast: 3_000_000, pricePenaltyAbove: 100, cleanlinessPenaltyBelow: 75, salesPenaltyBelow: 500_000 },
  { priceAchieveAtMost: 95, cleanlinessAchieveAtLeast: 85, salesAchieveAtLeast: 5_000_000, pricePenaltyAbove: 100, cleanlinessPenaltyBelow: 80, salesPenaltyBelow: 1_000_000 },
  { priceAchieveAtMost: 90, cleanlinessAchieveAtLeast: 90, salesAchieveAtLeast: 7_000_000, pricePenaltyAbove: 100, cleanlinessPenaltyBelow: 85, salesPenaltyBelow: 1_500_000 },
  { priceAchieveAtMost: 85, cleanlinessAchieveAtLeast: 95, salesAchieveAtLeast: 9_000_000, pricePenaltyAbove: 100, cleanlinessPenaltyBelow: 90, salesPenaltyBelow: 2_000_000 },
  { priceAchieveAtMost: 80, cleanlinessAchieveAtLeast: 100, salesAchieveAtLeast: 10_000_000, pricePenaltyAbove: 100, cleanlinessPenaltyBelow: 95, salesPenaltyBelow: 2_500_000 },
  { priceAchieveAtMost: 70, cleanlinessAchieveAtLeast: 100, salesAchieveAtLeast: 15_000_000, pricePenaltyAbove: 100, cleanlinessPenaltyBelow: 100, salesPenaltyBelow: 3_000_000 },
];

function tierForRating(rating: number): RatingTierThresholds {
  const index = Math.max(0, Math.min(RATING_TIERS.length - 1, Math.floor(rating / 20)));
  return RATING_TIERS[index]!;
}

export interface MonthlyRatingInputs {
  /** 0-100。本プロジェクトのスケールは高いほど価格競争力が高い(=安い)。原作とは逆方向。 */
  priceIndex: number;
  /** 0-100。原作と同一スケール。 */
  cleanliness: number;
  /** 直前の1ヶ月(MONTH_LENGTH_DAYS日分)の売上合計(円)。 */
  monthlySales: number;
}

export interface MonthlyRatingResult {
  updatedRating: number;
  achievedCount: number;
  penalizedCount: number;
  bonusApplied: boolean;
}

export function applyMonthlyRatingUpdate(
  currentRating: number,
  inputs: MonthlyRatingInputs,
): MonthlyRatingResult {
  const tier = tierForRating(currentRating);
  // 原作の「価格指標」は低いほど安い。本プロジェクトのpriceIndexは高いほど安いため反転する。
  const priceOnOriginalScale = 100 - inputs.priceIndex;

  let achievedCount = 0;
  if (priceOnOriginalScale <= tier.priceAchieveAtMost) achievedCount += 1;
  if (inputs.cleanliness >= tier.cleanlinessAchieveAtLeast) achievedCount += 1;
  if (inputs.monthlySales >= tier.salesAchieveAtLeast) achievedCount += 1;

  let penalizedCount = 0;
  if (priceOnOriginalScale > tier.pricePenaltyAbove) penalizedCount += 1;
  if (inputs.cleanliness < tier.cleanlinessPenaltyBelow) penalizedCount += 1;
  if (inputs.monthlySales < tier.salesPenaltyBelow) penalizedCount += 1;

  const bonusApplied = achievedCount >= 3;
  const updatedRating = Math.max(
    5,
    Math.min(100, currentRating - penalizedCount + (bonusApplied ? 5 : 0)),
  );

  return { updatedRating, achievedCount, penalizedCount, bonusApplied };
}
