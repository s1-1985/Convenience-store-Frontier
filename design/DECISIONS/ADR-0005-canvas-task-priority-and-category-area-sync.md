# ADR-0005: 作業優先順位・売場配置をCanvas側から数値エンジンへ即時反映する変換規則

Status: Accepted
Date: 2026-09-02

## Context

`docs/visual-numeric-engine-integration.md`のフェーズ1で、営業時間・人員(時間帯別
合計)・発注方針・納品方針は`syncPolicyToRealEngine()`によりCanvas側の操作から
即座に数値エンジン(`Simulation`)へ反映されるようになった。一方、作業優先順位
(`set_task_priorities`)と売場配置(`set_category_area`)はフェーズ2として先送りに
されていた。理由は、Canvas側とSimulation側で採用しているモデルの単位・意味が
そもそも異なり、変換規則を先に決める必要があったため(`HANDOFF.md` 2.6参照)。

- **作業優先順位**: Simulation側(`src/simulation/operations.ts`)は
  `OperationTaskId`(register/replenishment/cleaning/delivery_receiving/adminの5種)を
  過不足なく1回ずつ含む優先順リストを要求し、リスト先頭のタスクから共有作業容量を
  食いつぶす「順序のみ」のモデル。Canvas側(店内Canvasの「人員」パネル、
  `renderStaffPanel`/`assignmentFromPanel`)は店員一人ひとりに
  register/replenishment/cleaningのいずれか1つを割り当てる「人数配分」モデルで、
  delivery_receiving・adminに対応する概念が無い。
- **売場配置**: Simulation側の`categoryArea`はカテゴリごとの点数配分(合計固定、
  `economy.totalShelfAreaPoints`)。Canvas側は物理的な棚容量(`ShelfInventoryState.
  shelfCapacity`、設備投資で+6ずつ拡張)で、単位も意味も異なる。

## Decision

### 1. 作業優先順位の変換規則

Canvas側の人数配分(`StoreStaffAssignments`: register/replenishment/cleaningの
店員数)を、**register/replenishment/cleaningの3タスクの相対順位だけ**に変換する。
delivery_receiving・adminはCanvas側に対応する概念が無いため、**現在のSimulation側
優先順リストにおける絶対位置(スロット)を変更しない**。

具体的な手順:

1. Simulation側の現在の優先順リスト(`Simulation.getSnapshot().playerStore.
   taskPriorities`)を取得する
2. register/replenishment/cleaningの3タスクだけを、Canvas側の割当人数の降順で
   並べ替える(人数が同数の場合は、現在の優先順リストでの相対順序を維持する
   ―― 変換のたびに無意味に順序が入れ替わることを防ぐ)
3. 元の優先順リストのうち、register/replenishment/cleaningが元々あった
   スロット(位置)へ、2で並べ替えた順に差し込む。delivery_receiving・adminは
   自分の元のスロットにそのまま留まる

これにより「Canvas側で最も人数を割いたタスクが最優先」という直感的な対応を
保ちつつ、delivery_receiving・adminの優先順位はプレイヤーがCanvas側で明示的に
操作できない限り勝手に動かない。

### 2. 売場配置の変換規則

Canvas側の各`StoreCategoryId`の`shelfCapacity`(什器拡張後の実容量)を重みとして、
Simulation側の`categoryArea`(カテゴリごとの点数、合計`economy.
totalShelfAreaPoints`)へ比例配分する。`dessert`(Canvas固有、Simulation側に
対応カテゴリが無い)の容量は`category_snacks`の重みへ合算する
(`categoryWeightsForCohort()`が順方向で`snacks`から`dessert`を65/35で分離している
のと対称的な扱い)。

丸め誤差の吸収は`src/balance/benchmark.ts`の`weightedCategoryArea()`と同じ手法
(最後のカテゴリに`目標合計 - それまでの割当合計`を代入)を用い、
`set_category_area`が要求する「合計が`totalShelfAreaPoints`に厳密一致する」
制約(`src/simulation/simulation.ts`の`case "set_category_area"`のバリデーション)
を機械的に満たす。

### 3. 実装箇所

`src/ui/storeGameRuntime.ts`の`syncPolicyToRealEngine()`に、上記2つの変換を
既存の署名(シグネチャ)ベースの重複適用防止と同じ方式で追加する。呼び出しは
既存の`engine`(店内Canvasのその時点の`StoreOperationsEngine`)から
`getSnapshot().assignments`/`getSnapshot().inventories`を読み取る。

## Consequences

- Canvas側の「人員」パネル・設備投資操作が、`main.ts`の「方針を反映」ボタンを
  押さずとも即座に数値エンジンの実際の経営結果へ反映されるようになる
  (営業時間・発注方針等と同じ挙動に揃う)。
- delivery_receiving・adminの優先順位は、Canvas側にこれらを操作するUIが
  無い限りプレイヤーが直接動かす手段が無いまま(既存のデフォルト優先順リスト、
  または過去にmain.ts側の操作があればその位置)に留まる。将来Canvas側に
  納品受入・発注記録の概念を追加する場合は、この変換規則も見直しが必要になる。
- 売場配置の変換は比例配分による近似であり、Canvas側の棚容量とSimulation側の
  点数配分は正確な1対1対応ではない(既存の`SIM_CATEGORY_TO_STORE_CATEGORY`
  自体が近似変換であることに変わりはない)。プレイテストの結果によって、
  比例配分の重み付け方法自体を見直す場合は、通常のバランス調整として扱ってよい
  (新しい変換規則の考案を伴わない限り、別ADR無しで進めてよい)。
