# シミュレーション構造

## 1. 方針

垂直スライスは、描画やゲームエンジンから独立した決定論的シミュレーションとして実装する。

同じ初期データ、プレイヤー方針、乱数シードからは同じ結果を返す。

## 2. 更新単位

- 1スロット：15分
- 1日：72スロット（6時〜24時）
- 営業時間外も潜在需要を計算
- 日末：在庫、廃棄、財務、信頼、履歴
- 3日ごと：競合戦略
- 7日ごと：地域行動レポート

## 3. スロット更新順

```text
1. 時刻・天候・イベント更新
2. 潜在需要生成
3. 店舗選択
4. 来店・主目的決定
5. 棚在庫と認識判定
6. 商品選択・代替・併売
7. レジ作業需要生成
8. 店員能力と作業需要計算
9. 作業能力配分
10. 補充・清掃・納品処理
11. 行列処理と離脱
12. 販売・在庫・財務記録
13. 顧客満足・信頼・習慣履歴更新
14. 表示イベント生成
```

## 4. モジュール

### SimulationClock

時刻、日付、速度、一時停止、日末・週次トリガー。

### ScenarioSystem

30日進行、イベント条件、解禁、チュートリアル状態。

### DemandSystem

顧客コホート別の潜在需要、曜日、天候、習慣補正。

### StoreChoiceSystem

自社、競合、その他の選択確率。

### CustomerSystem

来店目的、商品選択、代替、離脱、満足、利用履歴。

### InventorySystem

発注、納品、バッチ、期限、棚、バックヤード、廃棄。

### OperationSystem

人員、作業需要、優先順位、行列、補充、清掃、納品受入。

### FinanceSystem

売上、原価、人件費、物流費、廃棄損失、投資、現金。

### ReputationSystem

店舗信頼、客層別評価、欠品・速度・清潔の影響。

### HabitSystem

14日履歴、状態遷移、地域行動割合、自社寄与。

### CompetitorSystem

観測、3日ごとの判断、営業時間・カテゴリ方針変更。

### ReportingSystem

日報、地域レポート、原因説明、最終企業史。

### PresentationSystem

内部状態を代表顧客、行列、空棚、通知へ変換する。ゲームロジックは持たない。

## 5. 主要データ構造

### ScenarioState

- day
- slot
- weather
- active_events
- random_stream_states

### StoreState

- opening_hour / closing_hour
- category_area
- ordering_policy
- delivery_policy
- staffing
- task_priority
- reputation
- cleanliness
- cash

### ProductDefinition

- id
- category_id
- retail_price
- cost
- shelf_life_slots
- package_units
- target_weights
- substitution_group

### InventoryBatch

- product_id
- quantity
- arrival_slot
- expiry_slot
- location

### CustomerCohortState

- population
- schedule
- preference_weights
- trust
- recent_visits
- habit_states

### CompetitorState

- policy
- reputation
- observed_market
- action_cooldown
- cash_strength

## 6. 乱数

乱数ストリームを用途別に分離する。

- demand
- customer_choice
- weather
- events
- staffing
- competitor

天候シードを変えても競合の判断乱数列が変わらないようにする。

## 7. 保存

保存対象：

- 全State
- 在庫バッチ
- 顧客履歴
- イベント状態
- 乱数ストリーム状態
- 集計途中値

Definitionは保存せず、データバージョンIDを保存する。

## 8. ログ

各日について最低限次を出力する。

- cohort_demand
- store_choice
- sales_by_category
- stockout_by_reason
- waste_by_product
- work_demand_and_capacity
- queue_and_abandonment
- finance
- habit_transition
- competitor_action

デバッグログとプレイヤー向けレポートは分離する。

## 9. テスト

### 単体

- 発注丸め
- 期限切れ
- FIFO
- 行列
- 離脱
- 営業時間判定
- 習慣遷移

### 回帰

固定シードで30日KPIを保存し、意図しない変化を検出する。

### バランス

4戦略 × 100シードを実行し、利益、欠品、廃棄、信頼、習慣、負荷を比較する。

## 10. パフォーマンス目標

数値シミュレーションのみの場合、30日を通常の開発PCで1秒以内に一括実行できることを目標とする。

描画時は代表顧客のみを表示し、全顧客を個別エージェントとして経路探索しない。
