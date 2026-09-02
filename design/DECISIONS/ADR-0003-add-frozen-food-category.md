# ADR-0003: 冷凍食品カテゴリ(category_frozen_food)を新設し、frozen_case什器を実プレイに配線する

Status: Accepted
Date: 2026-09-02

## Context

`FixtureKind`の`frozen_case`/`hot_case`(冷凍・HOT什器)はPR #55でコード側の型定義、
PR #57で什器アート(`fixture-bases.png`のセル)まで用意済みだったが、これらを対象と
する`StoreCategoryId`が一つも存在しないため、デフォルトレイアウト・売場編集UIの
どちらからもこの2種類の什器を配置する経路が無く、実プレイでは一度も出現しない
状態が続いていた(`docs/store-fixture-zones.md`6〜7節、`HANDOFF.md`2.2参照)。

新カテゴリの追加は、価格・棚容量・客層嗜好などのバランス数値の決定を伴うため、
CLAUDE.mdの方針上「基盤的な設計判断」に当たり、独断で進めるべきではないとして
これまで保留されていた。2026-09-02のセッションでユーザーへ次の作業候補
(技術統合の続き/アセット統合の続き/歩行アニメーション/新カテゴリ追加)を確認した
ところ、「新カテゴリ追加(冷凍食品等)」が選択された。

## Decision

### 1. 冷凍食品カテゴリを1つだけ追加する(HOTケースは今回対象外)

`frozen_case`・`hot_case`の2種類のうち、今回は**冷凍食品(`category_frozen_food`)
のみ**を追加する。HOTケース(おでん・中華まん等)は、現行の在庫モデル
(`shelf_life_slots`による一律の期限管理)が温度・時間に極めて敏感な実店舗の
ホットスナックの挙動をそのまま表現できず、追加のメカニクス検討を要するため、
別のADRとして切り出す(「一つの改善が次の経営問題を生む」— 一度に複数の新カテゴリを
決め切らない)。`hot_case`はFixtureKind・アートとも既に準備済みのため、追加判断を
下すだけで着手できる状態のまま残す。

### 2. 商品構成

- 既存の`product_frozen_gyoza`(冷凍餃子)は、これまで専用カテゴリが無かったために
  `category_processed_food`(加工食品)へ仮に分類されていた。これを本来の
  `category_frozen_food`へ付け替える。
- 新規に`product_frozen_udon`(冷凍うどん)を`category_frozen_food`へ追加する
  (target_weight 0.5ずつで冷凍餃子と均等配分。既存カテゴリのほとんどが2商品を
  0.4〜0.6で分け合う構成に合わせた)。
- `category_processed_food`は冷凍餃子が抜けるため、代わりに新規
  `product_retort_curry`(レトルトカレー)を追加し、商品数2を維持する
  (`product_instant_noodle`と0.5ずつ)。
- 全体の商品数は12→14、カテゴリ数は6→7になる。

### 3. 客層嗜好(category_preference)

`category_frozen_food`への嗜好は、既存の`category_processed_food`(家庭客0.30・
高齢者0.25の「家で使う定番品」枠)を参考に、家庭客・高齢者・単身者/工場勤務者
(冷凍食品は自炊の時短需要と一致)へ厚めに配分し、通勤・昼休み会社員・高校生
(その場で食べる即食需要が中心)へは薄く配分する。

`allocateCategoryUnits`(`src/simulation/purchase.ts`)は各コホートの
`categoryPreference`の合計で正規化して売場配分の重みを出すため、既存カテゴリの
数値を書き換える必要はなく、新しい重みを追加するだけで良い(既存カテゴリの
相対シェアは自動的に薄まる)。

### 4. 売場面積(category_area)

`economy.json`の`total_shelf_area_points`(70)は変更しない。両店舗
(`player_store.json`・`competitor_store.json`)とも、`category_frozen_food`へ
新規に面積を割り当てた上で、主に`category_processed_food`(商品が1つ減るため)
から多めに、他カテゴリからは1ポイントずつ小さく削って、合計70を維持する。

### 5. Canvas側(見た目)の配線

`src/game/storeOperationsEngine.ts`の`StoreCategoryId`に`"frozen"`を追加し、
`CATEGORY_IDS`/`CATEGORY_DEFAULTS`/`createDefaultStoreLayout`(空いている
グリッド領域に`frozen_case`什器を1つ配置)を更新する。`src/ui/storeGameRuntime.ts`
の`SIM_CATEGORY_TO_STORE_CATEGORY`(`category_frozen_food` → `"frozen"`)・
`CATEGORY_LABELS`・`categoryWeightsForCohort`・`defaultCategoryWeightsForHour`も
合わせて更新する。

`frozen_case`什器そのものの温度帯アート(什器の外観)はPR #57で既に用意されている
(`fixture-bases.png`)。ただし冷凍食品専用の陳列商品アート(`merchandise.png`)は
まだ存在しないため、`resolveFixtureArtIndex`/`MERCHANDISE_INDEX`には`"frozen"`を
追加しない。これにより`drawFixtureArtwork`は`frozen`カテゴリの什器で`undefined`を
返し、既存の`drawFallbackFixture`(冷凍什器用の氷色フォールバック矩形描画、PR #55で
既に準備済み)へ自然にフォールバックする。新しい陳列アートが届いた際に
`FIXTURE_INDEX`/`MERCHANDISE_INDEX`へ追記すれば良く、今回の変更で表示が壊れることは
ない。

## Consequences

- 商品数12→14、カテゴリ数6→7になる。`docs/vertical-slice.md`「2. スコープ」の
  「商品カテゴリ：6」「重点商品：12」は元の30日版垂直スライスがロックした時点の
  数値であり、本ADRにより現状と乖離するため、同ドキュメントへ注記を追加する
  (README.mdが既に明言する通り、30日版は数値回帰テストとして残すのみで、
  フリープレイ側のスコープを凍結するものではない)。
- `data/scenarios/vertical_slice_30d.json`は上記のデータファイル群を共有して
  参照しているため、30日シナリオのKPIも本変更の影響を受ける。これは意図した
  仕様変更であり、`docs/architecture.md`9節が言う「回帰テストで検出すべき
  意図しない変化」には当たらない。既存のバランス系テスト・スナップショットで
  数値が変化した場合は、本ADRを理由として値を更新する。
- `hot_case`(おでん・中華まん)はFixtureKind・アートとも用意済みのまま、対応する
  `StoreCategoryId`が無い状態を維持する。追加するかどうか・どちらのカテゴリ構成に
  するか(`docs/store-fixture-zones.md`が挙げた「ready_mealの温度帯付け替え」案を
  含む)は、別のADRとしてあらためて判断する。
- 価格・棚容量・客層嗜好の初期値は、既存の`category_processed_food`の数値感を
  参考にした初期見積もりであり、プレイテストの結果によって別ADR無しの通常の
  バランス調整(既存カテゴリの数値変更と同列)で見直してよい。
