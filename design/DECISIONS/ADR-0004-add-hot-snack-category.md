# ADR-0004: ホットスナックカテゴリ(category_hot_snack)を新設し、hot_case什器を実プレイに配線する

Status: Accepted
Date: 2026-09-02

## Context

ADR-0003(冷凍食品カテゴリの追加)は、`frozen_case`/`hot_case`という2種類の
温度帯什器のうち`frozen_case`のみを対象とし、`hot_case`(おでん・中華まん等)は
次の理由で意図的に対象外とした。

> 現行の在庫モデル(`shelf_life_slots`による一律の期限管理)が温度・時間に極めて
> 敏感な実店舗のホットスナックの挙動をそのまま表現できず、追加のメカニクス検討を
> 要するため

改めて検討した結果、既存の在庫モデルは商品ごとに`shelf_life_slots`(バッチの
有効期限、スロット単位)を自由に設定でき、実際に`product_newspaper`(新聞、
96スロット=24時間)のように商品種別に応じて極端に短い期限を既に表現できている。
「温度・時間に極めて敏感」という性質は、新しいメカニクスを追加しなくても、
既存の商品より大幅に短い`shelf_life_slots`を設定するだけで近似できる
(食品ロス・欠品と発注方針の緊張関係という中心的な葛藤も、既存のFIFO+期限切れ
モデルの範囲でそのまま機能する)。よって新規メカニクスの追加は必須ではないと
判断し、ADR-0003が示した`hot_case`の追加方針(`docs/store-fixture-zones.md`
6節決定事項1: 「ready_mealは現状のcold_case扱いのまま据え置く」「hot_snack
〈おでん・中華まん〉を切り出す」案)に沿って追加する。

## Decision

### 1. ホットスナックカテゴリを追加する

`category_hot_snack`(おでん・中華まん)を新設する。`ready_meal`(弁当)の
温度帯区分(`cold_case`のまま据え置き)は変更しない(ADR-0003・
`docs/store-fixture-zones.md`6節の決定を維持)。

### 2. 商品構成

- `product_oden`(おでん): retail_price 150、cost 70
- `product_nikuman`(中華まん): retail_price 150、cost 75

両商品とも`shelf_life_slots`を16スロット(4時間相当)とし、既存商品中で
最短(新聞の96スロット=24時間)よりさらに短く設定する。ホットケース商品が
実店舗で数時間おきに廃棄・補充される性質を、新しいメカニクスを追加せず既存の
バッチ期限モデルの範囲で近似する。

### 3. 客層嗜好

夜間buyer(単身者・工場勤務者)・高校生・高齢者(おでんの定番人気)へ厚めに、
通勤・昼休み会社員・家庭客へは薄く配分する(`category_processed_food`の
配分パターンではなく、`category_ready_to_eat`の夜間・単身者向け配分に近い
性格として設計)。

### 4. 売場面積

`total_shelf_area_points`(70)を維持したまま、両店舗の`category_area`へ
`category_hot_snack`を5ポイント追加する。ホットケースは冷凍食品ほどの
売場を必要としない小型什器であるため、冷凍食品(8ポイント)より小さい配分と
した。既存カテゴリからは`ready_to_eat`・`beverages`・`snacks`・
`daily_goods`・`magazines`から1ポイントずつ捻出する
(`processed_food`・`frozen_food`はADR-0003で既に減らしているため今回は
据え置く)。

### 5. Canvas側の配線

`StoreCategoryId`に`"hot"`を追加し、ADR-0003の`frozen`と同じ要領で
`CATEGORY_DEFAULTS`・`createDefaultStoreLayout`(空きグリッド領域
`x12-16,y9-10`に`hot_case`什器を新設)・`SIM_CATEGORY_TO_STORE_CATEGORY`・
`CATEGORY_LABELS`・`categoryWeightsForCohort`・`defaultCategoryWeightsForHour`
(夜間・午後を厚めに)を配線する。陳列商品アートは`frozen`と同様まだ存在しない
ため、`resolveFixtureArtIndex`は意図的に`undefined`を返し、既存の
フォールバック矩形描画(HOT用の温色`#e8a24a`、PR #55で準備済み)へ委ねる。

## Consequences

- カテゴリ数7→8、商品数14→16になる。`docs/vertical-slice.md`「2. スコープ」の
  注記を更新する。
- `frozen_case`・`hot_case`はいずれも実プレイで配置される状態になり、
  `docs/store-fixture-zones.md`が挙げた4温度帯(常温・冷蔵・冷凍・HOT)構想が
  一通り実装される。
- 商品の期限切れ挙動(16スロット=4時間)は、既存の欠品・廃棄バランスに新しい
  緊張関係(発注しすぎれば急速に廃棄、発注を絞れば早い時間帯に欠品)を追加する。
  プレイテストの結果によって、価格・期限・客層嗜好は通常のバランス調整
  (既存カテゴリと同列、別ADR無し)で見直してよい。
- `hot_case`が対象とする商品は季節・天候による需要変動(冬場に強い)が実店舗では
  大きいが、今回はその変動要因(天候補正のカテゴリ別適用)までは実装しない。
  必要になった場合は別途検討する。
