# 見た目の店内Canvasと数値エンジンの統合(フェーズ1)

## 背景

`src/ui/storeGameRuntime.ts`(見た目の店内Canvas、`StoreOperationsEngine`)と
`src/ui/main.ts`(数値ダッシュボード、`src/simulation/simulation.ts`の`Simulation`、
地域習慣・競合AIを含む)が、同じページ上で完全に独立した2つの経済モデルとして並列動作
していた。`docs/game-design.md`7節の「画面上の代表顧客の行動と内部数値は一致させる」
原則に反する状態だったため、ユーザー判断で「storeGameRuntime(見た目)を主とし、
main.tsの数値エンジンを接続する」方針を確定し、フェーズ1として着手した。

## フェーズ1のステップと状況

### ステップA: 数値エンジンセッションの共有モジュール化 — 完了

新規`src/ui/gameSession.ts`が、ページ全体で1つだけの`Simulation`セッション
(`getGameSession()`/`peekGameSession()`/`resetGameSession()`)を提供する。
`main.ts`はこれ経由でセッションを取得するよう置き換えた。

### ステップB: 店内Canvasが本物のcash/day/slotを読む — 完了

- `storeGameRuntime.ts`の`currentDay()`/`currentHour()`/`currentMinute()`は、
  共有セッションが読み込み済みなら`Simulation.getSnapshot().day/.slot`から計算する
  (未読み込み時はDOMテキスト読み取りへフォールバック)。
- `StoreOperationsEngine.beginDay(day, realCash?)`に`realCash`引数を追加。
  日替わりのたびに独自の日次利益近似計算を本物の`Simulation`の現金で上書きする。

### ステップC: Canvas側の方針変更を数値エンジンへ即時反映 — 完了

`syncPolicyToRealEngine()`が、営業時間・人員(時間帯別)・発注方針・納品方針の
フォーム値を、値が変化するたびに`Simulation.applyPolicy()`へ適用する。従来は
main.tsの「方針を反映」ボタンを押すまで数値エンジンに届かなかった。

### ステップD: 来店客数・在庫欠品表示を本物の数値に追従させる — 一部完了

- **来店客数(完了)**: `SimulationSnapshot`に`lastSlotPlayerVisits`(直近スロットの
  実来店客数)を追加。`storeGameRuntime.ts`の`arrivalRatePerMinute()`は、共有セッション
  読み込み後はこの実数値(15分あたりの人数を1分あたりに換算)を使う。
- **在庫欠品表示(未着手)**: `StoreOperationsEngine`はカテゴリ単位(7種)で独自に
  棚在庫をシミュレートしており、この欠品警告表示を本物の`Simulation`の商品単位の
  `stockoutUnitsByProduct`から算出する向きへ寄せる作業は、今回のフェーズ1では
  着手しなかった。理由:
  - 商品単位(`simulation.ts`)とカテゴリ単位(`storeOperationsEngine.ts`、7種)の
    粒度差を吸収する集約ロジックが新たに必要
  - `resolveFixtureStockState`(`src/ui/storeArtAssets.ts`)や什器の警告表示
    (`src/ui/storeGameRuntime.ts`の`drawFixture`)など、複数箇所への波及がある
  - 拙速に近似すると、既存の「棚在庫が減る→空になる→警告が出る」という分かりやすい
    視覚的フィードバックループを壊すリスクがある
  
  このため、着手するとすれば独立した作業として切り出すべきと判断し、フェーズ2以降へ
  先送りする。

## フェーズ2として明確に後回しにしているもの(既存の合意事項)

1. 棚面積(`categoryArea`点数配分)とタイル什器レイアウトの統合(什器の物理配置
   そのものの統合。数値の同期自体は下記フェーズ2bで着手済み)
2. 商品単位とカテゴリ単位の完全統合(在庫欠品表示を含む、上記参照) — 下記
   「フェーズ2a」参照。一部着手済み
3. スロット単位で来店客1人1人を数値エンジンと厳密に対応させる演出
4. ~~`set_category_area`/`set_task_priorities`をCanvas側から即時反映すること~~
   → 下記「フェーズ2b」参照。着手済み

## フェーズ2a: 実欠品シビアリティによる翌日納品量のバイアス(2026-09-02、着手)

上記2「在庫欠品表示の同期」のうち、既存の「棚在庫が減る→空になる→警告が出る」
という視覚フィードバックループ自体は壊さずに進められる部分として、翌日の
納品量算出(`deliverStock()`)だけを本物の`Simulation`の実欠品状況に連動させた。

- `storeGameRuntime.ts`に`realStockoutSeverityByCategory()`(非公開関数)を追加。
  共有セッションの直近完了日`DailyReport`から、`stockoutUnitsByProduct`
  (商品単位)を`scenario.products`の`categoryId`で6種の商品カテゴリへ集計し、
  `salesUnitsByCategory`(同じ商品カテゴリ単位で既に集計済み)との比から
  「実需要のうち欠品で失われた割合」(0〜1)を算出。`SIM_CATEGORY_TO_STORE_CATEGORY`
  で7種の店舗カテゴリへ変換する(`dessert`は`snacks`と同じ値を継承。
  `categoryWeightsForCohort()`と同じ理由で、`dessert`に対応する商品カテゴリが
  存在しないため)。
- `StoreOperationsEngine.beginDay()`の第3引数
  (`realStockoutSeverityByCategory?: Partial<Record<StoreCategoryId, number>>`)
  としてこの値を渡す。`deliverStock()`はカテゴリごとにこの値でシビアリティ
  倍率(最大55%減、`STOCKOUT_SEVERITY_DELIVERY_PENALTY`)を掛けて納品量を
  減らす。シビアリティ0(未着荷・データ無し・省略時)では従来と完全に同じ挙動。
- 商品単位の在庫バッチや`shelfUnits`/`shelfCapacity`自体は引き続きCanvas独自
  シミュレーションのまま(粒度差の完全な吸収はまだ)。あくまで「本物の経済が
  欠品気味のカテゴリは、見た目のシェルフも欠品しやすくなる」という一方向の
  バイアスを翌日納品量に掛けるだけの、リスクを絞った第一歩。
- 回帰テスト: `src/tests/storeOperationsEngine.test.ts`に2本追加
  (実シビアリティ有りで対象カテゴリの納品量が減ること、他カテゴリへ波及しない
  こと/省略時は全カテゴリ0シビアリティと同じ結果になること)。
- Playwrightで日送りを複数回実行し、コンソール・ページエラーが出ないことを確認済み。

残課題(未着手のまま):
- 商品単位バッチとCanvasのカテゴリ単位在庫の完全統合(在庫数そのものの同期)
- `resolveFixtureStockState`などの表示ロジックを本物の商品単位欠品から直接
  算出する経路

## フェーズ2b: 作業優先順位・売場配置のCanvas→数値エンジン即時反映(2026-09-02、着手)

上記フェーズ2の4「`set_category_area`/`set_task_priorities`をCanvas側から即時
反映すること」に、`design/DECISIONS/ADR-0005-canvas-task-priority-and-category-area-sync.md`
で決定した変換規則に沿って着手した。営業時間・人員(時間帯別合計)・発注方針・
納品方針と同じく、`main.ts`の「方針を反映」ボタンを押さずとも即座に数値エンジンへ
反映されるようになった。

- 変換ロジックを`src/game/storeCanvasPolicySync.ts`(新規、DOM非依存の純粋関数
  モジュール。既存の`storeSupplyAdvisor.ts`等と同じ設計)へ切り出した:
  - `taskPrioritiesFromStaffAssignments()`: Canvas「人員」パネルの人数配分
    (`StoreStaffAssignments`、register/replenishment/cleaningの3種)を、
    Simulation側の優先順リスト(`OperationTaskId`5種)における
    register/replenishment/cleaningの相対順位だけに変換する。人数の多い順に
    並べ替え、同数はSimulation側の現在の相対順序を維持。Canvas側に概念の無い
    delivery_receiving・adminは、Simulation側の現在の優先順リストにおける
    絶対位置(スロット)から動かさない
  - `categoryAreaFromShelfCapacity()`: Canvas側の各カテゴリの`shelfCapacity`
    (什器拡張後の実容量)を重みとして、Simulation側の`categoryArea`(点数配分、
    合計`economy.totalShelfAreaPoints`)へ比例配分する。`dessert`
    (Simulation側に対応カテゴリが無い)の容量は`category_snacks`の重みへ合算する。
    丸め誤差は`src/balance/benchmark.ts`の`weightedCategoryArea()`と同じ
    「最後のカテゴリへ残差を代入」する手法で吸収し、`set_category_area`が要求する
    厳密な合計一致を機械的に満たす
  - `SIM_CATEGORY_TO_STORE_CATEGORY`マッピングも同モジュールへ集約(従来
    `storeGameRuntime.ts`にあったものを移設、`storeGameRuntime.ts`側は import
    して使用)
- `storeGameRuntime.ts`の`syncPolicyToRealEngine()`が`StoreOperationsEngine`を
  引数に取るよう変更し、`engine.getSnapshot().assignments`/`.inventories`を
  読み取って上記2つの変換を適用、既存と同じ署名(シグネチャ)ベースの重複適用
  防止に組み込んだ
- 単体テスト`src/tests/storeCanvasPolicySync.test.ts`(8件)を追加:
  優先順位変換(降順並べ替え・同数時の順序維持・delivery_receiving/adminが
  動かないこと・常に有効な順列であること)、売場配置変換(合計が厳密に一致
  すること・容量が増えたカテゴリの配分が増えること・dessertがsnacksへ合算
  されること・全カテゴリ容量0でも例外を投げず均等配分すること)
- `npx tsc --noEmit -p .`・`npx vitest run`(173件全通過)・`npm run balance:ci`
  (バランスベンチマークはCanvasを経由しないため今回の変更で直接は変わらないが、
  既存の合格基準を維持していることを確認)で検証済み

残課題(未着手のまま):
- delivery_receiving・adminをCanvas側から直接操作する手段が無いため、
  この2タスクの優先順位はCanvas操作だけでは動かせない(ADR-0005
  Consequences参照)
- 売場配置の変換は比例配分による近似であり、上記フェーズ2の1(棚面積とタイル
  什器レイアウトそのものの統合)はまだ未着手

## 検証方法(実施済み)

- 各ステップで`npx tsc --noEmit -p .`と`npx vitest run`を実行し、既存テストを壊さない
  ことを確認。
- Playwrightで実機相当の操作を確認:
  - ステップB: 日送り後、Canvas描画の所持金(丸め前の生数値)とmain.ts側の
    `#cash-label`(丸め後)が同一の実残高から算出されていることを確認。
  - ステップC: 「方針を反映」ボタンを押さずに人員設定を全時間帯4人へ変更しただけで、
    翌日の人件費が既定の22,000円から48,000円(4/2倍相当)になることを確認。
  - ステップD: 実来店客数に基づく客数で店内Canvasが正常に描画されることを確認。

## 重大バグ修正: 来店客が一切スポーンしない問題(2026-09-02)

### 症状

「店内の店舗運営を回す」ことを目的にPlaywrightで実機確認したところ、営業時間内に
▶再生を押して実時間で数十秒〜1日分を再生しても、来店客が**1人もスポーンせず**、
棚在庫・店内売上・レジ行列が丸1日変化しないことが判明した。数値エンジン側(main.ts
のレポート)は同じ日について「商品在庫不足による欠品が356.4個分発生」と報告して
おり、実需要自体は計算されていたが、店内Canvas側にまったく反映されていなかった。

### 原因

`storeGameRuntime.ts`の`arrivalRatePerMinute()`はステップD(PR #56)以降、
`Simulation.getSnapshot().lastSlotPlayerVisits / 15`(=シム分あたりの来店数)を返す
ようになっていた。一方`StoreOperationsEngine.advance()`の来店スポーン処理は、

```ts
spawnAccumulator += arrivalRatePerMinute * safeDelta / 60;
```

という式で、`safeDelta`(requestAnimationFrameの**実経過秒**)を60で割った値を
「経過シム分」とみなしていた。これは「実60秒 = シム1分」という前提の式だが、
実際の数値エンジンの時計(main.tsの`setInterval`、速度セレクタで加速)は「1倍」
設定でも1日(1440シム分)が実時間60〜80秒程度で進行する。つまり実際の換算比は
おおよそ「実1秒 ≈ シム20分」であり、上記の式が前提とする換算比とは実に千倍以上
乖離していた。結果として、営業時間中に実時間で1日分再生しても
`spawnAccumulator`が1(客1人分のスポーン閾値)へほぼ到達せず、来店客が実質的に
一切出現しなかった。

### 修正

`StoreEngineContext`に`simMinutesElapsed`(前回`advance()`呼び出しからの経過シム分、
実来店数と同じ時間基準)を追加し、`storeGameRuntime.ts`側で日/時/分から実際に
経過したシム分を毎フレーム計測して渡すようにした(`simMinutesElapsedThisFrame()`)。
スポーン処理はこの値を優先して使う。未指定時(既存のユニットテストなど)は従来通り
`safeDelta / 60`にフォールバックし、後方互換を保っている。移動・レジ処理などの
アニメーション系は引き続き実経過秒(`safeDelta`)を使う — 客の入店ペースだけが
シム時間基準になった。

手動の「+15分」「翌日まで」ステップ時は`isPlaying()`が偽なので
`simMinutesElapsedThisFrame()`は基準時刻を更新するだけで0を返す(▶再生を
再開した瞬間に、止まっていた間の分数をまとめて計上して客が大量発生する、という
挙動を避けるため)。

`src/tests/storeOperationsEngine.test.ts`に回帰テストを追加:
「realDeltaSecondsが小さくてもsimMinutesElapsedが与えられていれば客がスポーンする」
「simMinutesElapsedが0なら(実deltaSecondsだけでは)客がスポーンしない」の2本。

### 修正後にPlaywrightで確認できたこと

- 開店後、実時間で数秒〜十数秒のうちに客が来店・棚へ向かい、棚在庫が実際に減少する
- レジに並ぶ客が可視化され、「レジ行列 N人待ち。レジ優先の店員を増やしてください」
  という通知が実際に発火する(垂直スライスの core loop 3「レジ混雑と補充遅延」が
  再現できることを確認)
- 弁当棚などが実際に「品切れ」表示になる

### 追加で見つかった要調査事項 → 追記(2026-09-02、同日中に切り分け完了)

Playwrightでの確認中、客が多数(上限28人)スポーンし行列が10〜20人規模まで育つと、
**店内Canvas側だけでなくmain.ts側の数値エンジンの時計(day/time表示)も進行が
著しく停滞・停止するように見える**現象を観測した(実時間30秒以上、日付・時刻の
表示が固定されたまま動かない)。あわせて、レジ優先(`register`)を明示的に割り
当てた店員が、行列が育った後も補充作業(`walking_to_backroom`)の途中状態から
戻ってこず、`processCheckout`の必要条件(`task === "register" && state ===
"register_ready"`の店員が1人以上)を満たせず会計が1件も成立しない、という状況も
観測された。

**切り分け結果**: `StoreOperationsEngine`をPlaywright(ブラウザ描画)抜きで直接
Node.jsから駆動し(`engine.advance()`をブラウザのRAFループと同じ形の
`simMinutesElapsed`付きコンテキストで60秒×60fps分だけ純粋に反復呼び出し)、
同じ「レジ優先だが行列が育つと一時的に補充へ流れる」状況を再現したところ、
**純粋なロジックでは店員は数十秒以内に自律的にレジへ復帰し、会計が実際に成立
することを確認した**(t=30秒時点で2件、t=55秒時点で8件成立)。

```text
t= 5.0s customers=28 queue= 0 transactions=0 staff=[register, register]
t=10.0s customers=28 queue= 0 transactions=0 staff=[replenishment, replenishment] (行列がまだ無く補充優先へ)
t=20.0s customers=28 queue=25 transactions=0 staff=[replenishing, replenishing]  (行列が育つ)
t=30.0s customers=28 queue= 6 transactions=2 staff=[register_ready, register_ready] (レジへ復帰し会計開始)
t=55.0s customers=28 queue=19 transactions=8 staff=[register_ready, register_ready]
```

つまり`updateStaff()`の自動タスク再配分ロジック(`planStoreStaffTasks`)自体には
デッドロックは無く、「行列が無い間は手が空いた店員を補充へ回し、行列が育ったら
手が空き次第レジへ戻る」という設計通りの挙動をしている(戻るまでに数十秒かかる
点や、行列がある程度残っていても再び補充へ流れてしまう振動は見られるが、これは
バランス調整の領域であり、今回は「デッドロックか否か」の切り分けのみを目的とした)。

したがって、Playwrightで観測した「時計が止まって見える」「会計が永久に成立しない」
現象は、**アプリのロジック起因ではなく、検証に使ったヘッドレスChromium(GPU無しの
ソフトウェアレンダリング)+CPU共有コンテナという実行環境固有の性能制約により、
requestAnimationFrame・setIntervalの発火自体が長時間止まっていたことが原因である
可能性が高い**、と結論づけた(確度: 推論。実デバイス・実ブラウザでの再現有無は
未確認のため、体感的な操作感が悪いと感じた場合は再検証すること)。
