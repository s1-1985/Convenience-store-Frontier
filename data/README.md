# データ配置方針

ゲームバランス値はコードへ直書きせず、外部データとして管理する。

## 予定構成

```text
data/
├─ scenarios/
│  └─ vertical_slice_30d.json
├─ districts/
│  └─ asahi_station_east.json
├─ stores/
│  ├─ player_store.json
│  └─ competitor_store.json
├─ cohorts/
│  └─ customer_cohorts.json
├─ products/
│  ├─ categories.json
│  └─ products.json
├─ operations/
│  ├─ staffing.json
│  ├─ task_costs.json
│  └─ delivery_policies.json
├─ events/
│  └─ vertical_slice_events.json
└─ balance/
   ├─ economy.json
   ├─ habits.json
   └─ strategy_bots.json
```

## ID規則

- 小文字snake_case
- 表示名とIDを分離
- IDは保存データ互換性のため原則変更しない
- 削除したIDは別対象へ再利用しない

例：

```json
{
  "id": "product_bento_makunouchi",
  "display_name": "幕の内弁当"
}
```

## 単位

- 金額：円、整数
- 時間：15分スロット
- 確率・倍率：原則0.0〜1.0または明示的倍率
- 評価値：0〜100
- 面積：店舗内ポイント
- 人員：FTE相当の実数を許容

## 必須検証

起動時に次を検証する。

- ID重複
- 参照先不存在
- 発注単位が1以上
- 価格・原価が負でない
- 営業開始が終了より前
- 売場面積合計
- 確率範囲
- 賞味期限
- イベント条件の型

## データバージョン

シナリオルートに `data_version` を持たせる。

保存データは使用したバージョンを記録する。互換性がない変更では移行処理か明示的な非互換判定を行う。

## バランス変更

バランス変更のコミットには次を記録する。

- 変更した値
- 変更理由
- 期待する現象
- 比較した基準戦略
- 固定シード回帰結果

「数字を少し調整」のみで終わらせない。
