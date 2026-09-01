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
