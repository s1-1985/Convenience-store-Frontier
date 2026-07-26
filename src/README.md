# ソース構成方針

実装言語・ゲームエンジンを決定する前に、シミュレーションの責務境界を固定する。

## 推奨構成

```text
src/
├─ simulation/
│  ├─ clock
│  ├─ demand
│  ├─ store_choice
│  ├─ customers
│  ├─ inventory
│  ├─ operations
│  ├─ finance
│  ├─ reputation
│  ├─ habits
│  ├─ competitors
│  └─ scenarios
├─ data/
│  ├─ loaders
│  └─ validation
├─ reporting/
├─ presentation/
├─ bots/
└─ tests/
```

## 依存方向

```text
Presentation
↓
Application / Reporting
↓
Simulation
↓
Definitions and State
```

SimulationはUI、描画、入力APIへ依存しない。

## 基本規則

- DefinitionとStateを分離する
- シミュレーション更新中に定義データを書き換えない
- グローバル乱数を使用しない
- 時刻は実時間ではなくスロットで扱う
- 金額は円の整数で扱う
- UIから在庫や売上を直接変更しない
- すべての操作はCommandまたはPolicy変更としてSimulationへ渡す

## 最初の実行形式

最初はCLIまたはテストランナーでよい。

入力：

- シナリオ
- プレイヤー方針
- 乱数シード

出力：

- 日次KPI
- 30日最終KPI
- CSVログ
- 習慣遷移
- 競合行動

## 最初に実装するAPIイメージ

```text
loadScenario(path)
createSimulation(scenario, seed)
applyPolicy(command)
advanceSlot()
advanceDay()
runToEnd()
getSnapshot()
getDailyReport()
```

## テスト方針

- 純粋関数を優先する
- 固定シードのスナップショットテストを持つ
- UIなしで全システムを検証可能にする
- バランスBotも通常プレイヤーと同じCommand APIを使う

## 未決定事項

- 実装言語
- ゲームエンジン
- UIフレームワーク
- 永続化形式

これらは数値シミュレーターの要件を満たす範囲で選定する。エンジン都合でドメイン設計を崩さない。
