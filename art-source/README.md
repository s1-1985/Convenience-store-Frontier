# 素材ソース(未統合)

このディレクトリは、ChatGPT側で生成・採用判定された「素材の原本」を、
ゲームへ統合済みの`data/assets/store/`とは分けて保管する場所である。

`data/`はVite(`vite.config.ts`の`publicDir`)がそのままビルド成果物へ
コピーするディレクトリのため、まだゲームに組み込んでいない原寸・大容量の
スプライトシートをここへ置くと、本番ビルドやAndroid APKへ不要に含まれて
しまう。そのため未統合の原本は`data/`の外、このディレクトリへ置く。

## 収録物

### `chatgpt-adopted-v1/`

2026-09-01にChatGPT側から受領した3つのZIP(`conveniencestorefrontierapprovedassetsv1.zip`、
`conveniencestorefrontieradoptedassetsfixtures.zip`、
`conveniencestorefrontieradoptedassetscharacters.zip`)のうち、"採用版"
(fixtures/characters、内容は重複込みで旧v1パックを包含)から、
什器・商品モジュール・キャラクターのスプライトシート本体と付属docsのみを
展開・格納したもの。文字コードはUTF-8。ファイル名は原本のまま(日本語)。

- `docs/ASSET_SPEC.md` — ChatGPT側が定義した素材仕様(共通ビジュアル仕様、
  什器と商品の分離方針、一般什器カテゴリ、年代別外観の将来計画)
- `docs/README.txt` — 原本ZIP同梱のフォルダ説明(英語)
- `characters/base/` — 採用版の基準キャラクターシート(店員8種、客の歩行、
  子供・学生の歩行、職業キャラクター集)
- `characters/diagonal_and_extended/` — 斜め方向・拡張の歩行アニメーション
  シート(4人/6人組、家族連れ、街を歩くちびキャラ、学園生活ちびキャラ等)
- `fixtures/` — 一般什器(常温・冷蔵・冷凍・HOT・店舗設備・建具等)の
  現行版スプライトシート
- `product_contents/` — 什器本体と分離された商品中身モジュール

すでにゲームへ統合済みのもの(什器フェーズ1の冷凍/HOTケース1種ずつ、
キャラフェーズ1の店員8種→客アーキタイプ)は`data/assets/store/`側の
`fixtures-manifest.json`/`customers-manifest.json`を参照。この
ディレクトリの中身と統合先の対応関係、および残りの未統合分の一覧は
`docs/store-art-assets.md`と`HANDOFF.md`を参照すること。

### `chatgpt-era-fixture-assets-v1/`

2026-09-02にChatGPT側から受領した3つのZIP
(`conveniencestorefrontiererafixtureassetspart1generalandera.zip`、
`conveniencestorefrontiererafixtureassetspart2storeequipment.zip`、
`conveniencestorefrontiererafixtureassetspart3productmodules.zip`)の中身
一式。ファイル名は原本のまま(日本語)。

- `01_general/` — 一般什器(常温棚バリエーション、冷蔵・冷凍・HOTディスプレイ集等)
  6枚。特に`コンビニ什器の冷蔵_加熱ディスプレイ集.png`は冷凍・HOT什器の
  バリエーションが豊富
- `02_store_equipment/` — レジ・設備・店舗構造(什器什器什器・建具・タイル等)13枚
- `03_era_variants/` — 年代別什器(レトロ・80年代・90年代・日本現代・近未来)6枚。
  `docs/store-fixture-zones.md`5節の年代別ビジュアル差分に対応する素材だが、
  **年代に応じて什器を切り替えるゲーティングの仕組み自体がまだ実装されていない**
  ため、素材だけ先に揃った状態
- `04_product_modules/` — 商品陳列モジュール4枚。組み込みには新しい
  `StoreCategoryId`/`ProductDefinition`とバランス数値の決定を伴う
- `README.txt`/`MANIFEST.txt` — 原本ZIP同梱の説明・ファイル一覧

`data/assets/store/fixture-bases.png`の`frozen_case`/`hot_case`セル
(什器の外側=温度帯シェル)は既にPR #57で本物のアートに差し替え済みで、
2026-09-02に判明したコード側の不具合(`resolveFixtureArtIndex`が
`FIXTURE_INDEX`にエントリの無いカテゴリを一律`undefined`にしていたため
描画分岐へ到達していなかった)も修正済み。このディレクトリの素材は
**まだ個体切り出し・アトラス統合には未着手**(`HANDOFF.md` 0-G参照)。

## 統合作業の進め方

個体の切り出し・アトラスへの合成は、既存の「什器フェーズ1」「キャラフェーズ1」
(PR #57)と同じ要領で進める: alpha透過を利用した連結成分の自動分割 →
既存セルサイズへリサイズ・下端合わせで合成 → `*-manifest.json`/アトラス仕様
更新 → typecheck・vitest・Playwrightで確認 → コミット。

新しい`StoreCategoryId`やバランス数値(価格・棚容量・カテゴリ嗜好等)を伴う
統合は、CLAUDE.mdの方針上Claude Codeが独断で決めるべきではなく、ゲーム
デザイン判断(ユーザーまたはChatGPT側)を仰いでから進める。
