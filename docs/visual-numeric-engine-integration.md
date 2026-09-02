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

1. 棚面積(`categoryArea`点数配分)とタイル什器レイアウトの統合
2. 商品単位とカテゴリ単位の完全統合(在庫欠品表示を含む、上記参照)
3. スロット単位で来店客1人1人を数値エンジンと厳密に対応させる演出
4. `set_category_area`/`set_task_priorities`をCanvas側から即時反映すること

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

### 追加で見つかった要調査事項(未修正、次セッションへの申し送り)

Playwrightでの確認中、客が多数(上限28人)スポーンし行列が10〜20人規模まで育つと、
**店内Canvas側だけでなくmain.ts側の数値エンジンの時計(day/time表示)も進行が
著しく停滞・停止するように見える**現象を観測した(実時間30秒以上、日付・時刻の
表示が固定されたまま動かない)。あわせて、レジ優先(`register`)を明示的に割り
当てた店員が、行列が育った後も補充作業(`walking_to_backroom`)の途中状態から
戻ってこず、`processCheckout`の必要条件(`task === "register" && state ===
"register_ready"`の店員が1人以上)を満たせず会計が1件も成立しない、という状況も
観測された。

この現象がアプリ側のロジック起因(例えばA*経路探索や毎フレーム処理のコストが
客数に応じて重くなる)なのか、それとも今回の検証に使ったヘッドレスChromium+
ソフトウェアレンダリング+CPU共有コンテナという実行環境固有の制約なのかは、
このセッションでは切り分けられていない。実機・実ブラウザでの再現有無を含め、
次のセッションで改めて調査することを推奨する。
