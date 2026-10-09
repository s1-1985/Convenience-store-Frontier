import type { RandomFn } from "./rng.js";

// PS1版「ザ・コンビニ」店員AIの移植(design/ps1-reference/algorithms.md §5、
// design/DECISIONS/ADR-0008・ADR-0009・ADR-0010参照)。
//
// 本プロジェクトの`operations.ts`は店員を人数(集計値)としてしか扱っておらず、原作の
// ように店員一人ひとりが能力値・活力を持つ「個体」ではない。ADR-0010の方針により、
// 既存の`set_task_priorities`(プレイヤーが操作する店舗単位の作業優先順位)は置き換え
// ず、その下で個々の店員が能力値・活力を持つ層を追加する。
//
// 移植済み: §5.3(補充の成功判定・要求量)、§5.4(清掃の成功判定)、§5.5(活力の
// 増減)。いずれも店員1人の能力値だけで完結する、原作に数式が明記されている部分。
//
// 未移植(原作に数式はあるが、本プロジェクトにまだ無い値に依存するため):
//   - §5.6 店員能力の増減 — 「管理者の教育値M」が本プロジェクトに存在しない
//   - §5.1/5.2 の仕事選択自体 — 既存のset_task_priorities(店舗単位の優先順位)と
//     役割が重なるため、個体の仕事選択ステートマシンそのものは移植しない
//
// 独自設計(原作データが無く、本モジュールの実装上必要だったため明記する):
//   - 初期能力値の分布(20〜80の一様乱数) — 原作の初期値テーブルは未解読
//   - 休憩から復帰する活力しきい値(50) — 原作は「活力<上限」の間だけ回復する
//     と書かれているが、復帰しきい値そのものは今回読み取れた範囲に記載が無い
//   - 原作の活力増減は本来フレーム単位(実時間)の処理だが、本プロジェクトは
//     15分スロット単位でしか時間を進めないため、スロット=1ティックとして適用する
//     (design/ps1-reference/algorithms.md §9「スケール不一致」の注意に対応)
//   - 閉店中は活力を変化させない(凍結) — 当初「閉店中は全員休憩」としたが、
//     営業時間外が長い店舗ほど毎晩全回復し、疲労が日をまたいで蓄積しなくなる
//     (§5.5が意図する「活動の結果として疲労する」効果が消える)ことが実測で
//     判明したため、閉店中は凍結する方針に変更した

export interface StaffMember {
  id: number;
  /** 0-100。補充能力(design/ps1-reference/algorithms.md §5.3)。 */
  refillAbility: number;
  /** 0-100。清掃能力(§5.4)。 */
  cleaningAbility: number;
  /** 0-100。活力(§5.5)。0になると休憩へ、独自設計のしきい値50で復帰する。 */
  energy: number;
  resting: boolean;
}

const ENERGY_MAX = 100;
const ENERGY_DEPLETE_ROLL_DENOMINATOR = 4; // R&3==0 相当(1/4の確率)
const REST_RETURN_ENERGY_THRESHOLD = 50; // 独自設計(原作に復帰しきい値の記載なし)
const INITIAL_ABILITY_MIN = 20; // 独自設計(原作の初期値テーブルは未解読)
const INITIAL_ABILITY_RANGE = 61;

export function createStaffRoster(size: number, rng: RandomFn): StaffMember[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index,
    refillAbility: INITIAL_ABILITY_MIN + Math.floor(rng() * INITIAL_ABILITY_RANGE),
    cleaningAbility: INITIAL_ABILITY_MIN + Math.floor(rng() * INITIAL_ABILITY_RANGE),
    energy: ENERGY_MAX,
    resting: false,
  }));
}

/** §5.5。活動中はR&3==0(1/4)で-1。休憩中は無条件+1(原作の休憩設備ID49相当、
 * ID48の1/2確率版は本プロジェクトに対応する休憩設備の区別が無いため未実装)。 */
export function applyEnergyTick(staff: StaffMember, isResting: boolean, rng: RandomFn): void {
  if (isResting) {
    if (staff.energy < ENERGY_MAX) {
      staff.energy = Math.min(ENERGY_MAX, staff.energy + 1);
    }
    return;
  }
  const roll = Math.floor(rng() * ENERGY_DEPLETE_ROLL_DENOMINATOR);
  if (roll === 0) {
    staff.energy = Math.max(0, staff.energy - 1);
  }
}

export interface ReplenishmentRollResult {
  success: boolean;
  requestedUnits: number;
}

/** §5.3。roll(1-100)>補充能力なら補充なし。成功時はfloor(能力/10)+1を要求する。 */
export function rollReplenishment(staff: StaffMember, rng: RandomFn): ReplenishmentRollResult {
  const roll = Math.floor(rng() * 100) + 1;
  if (roll > staff.refillAbility) {
    return { success: false, requestedUnits: 0 };
  }
  return { success: true, requestedUnits: Math.floor(staff.refillAbility / 10) + 1 };
}

/** §5.4。乱数1回: R%5!=0なら失敗。乱数2回目: roll(1-100)<=清掃能力なら成功。 */
export function rollCleaning(staff: StaffMember, rng: RandomFn): boolean {
  const gate = Math.floor(rng() * 5);
  if (gate !== 0) {
    return false;
  }
  const roll = Math.floor(rng() * 100) + 1;
  return roll <= staff.cleaningAbility;
}

/**
 * 1スロット分の活力ティックを全店員へ適用し、このスロットで実際に働ける人数
 * (活力が尽きて休憩入りした者を除く)を返す。nominalStaffCountを超える要員は
 * 待機(活力変化なし、独自設計)。店舗が閉まっている間は全員休憩として扱う。
 */
export function tickStaffRosterSlot(
  roster: readonly StaffMember[],
  nominalStaffCount: number,
  isStoreOpen: boolean,
  rng: RandomFn,
): number {
  // 閉店中は活力を変化させない(独自設計)。全員を自動的に休憩=回復扱いにすると、
  // 営業時間外が長い店舗ほど毎晩全回復してしまい、疲労が日をまたいで蓄積する
  // という原作の意図(§5.5は店舗が開いている間の個体AIの挙動)が消えてしまう。
  if (!isStoreOpen) {
    return 0;
  }

  let assigned = 0;
  for (const member of roster) {
    if (member.resting) {
      applyEnergyTick(member, true, rng);
      if (member.energy >= REST_RETURN_ENERGY_THRESHOLD) {
        member.resting = false;
      }
      continue;
    }
    if (assigned >= nominalStaffCount) {
      continue;
    }
    applyEnergyTick(member, false, rng);
    if (member.energy <= 0) {
      member.resting = true;
    } else {
      assigned += 1;
    }
  }
  return assigned;
}
