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
キャラフェーズ1の店員8種→客アーキタイプ、2026-09-03に追加した
`characters/base/コンビニ客の歩行スプライトシート.png`の4キャラクター→
客アーキタイプ4種・`customers.png`行32-35、実際に複数コマ歩行差分を持つ
初めての行、同じく2026-09-03に`product_contents/コンビニ商品棚ピクセルアート
素材集.png`から切り出した冷凍食品(パッケージ入り冷凍食品)・中華まんの
アイコン→`merchandise.png`のindex 7/8、frozen_case/hot_caseで初めて商品が
表示されるようになった分)は`data/assets/store/`側の
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

### `chatgpt-era-fixture-catalogs-v1/`

2026-09-03にユーザーから受領した1つのZIP
(`convenience_store_frontier_session_assets_2026-09-03.zip`)の中身一式9枚。
ファイル名は原本のまま。

**重要な注意(ユーザー指摘、2026-09-03)**: これらの画像は**すべて什器と
商品中身が1枚に合成描画されている**。`06_fixture_catalog_infographic.png`の
「什器本体と商品中身は完全分離」という付記や、`07_era_fixture_grid_catalog.png`の
「商品中身は含まれません(什器のみ)」という付記は、いずれも**実際の画像内容と
矛盾している**(目視確認済み — どちらの画像も棚にはドリンク・スナック・弁当等が
描き込まれた状態で生成されている)。このパックの画像に付随するテキスト説明は
信用せず、必ず目視で中身の有無を確認すること。

- `01_retro_fixture_sprite_sheet.png`〜`05_store_equipment_pixel_art_assets.png`
  (各1448×1086px) — 実寸大の什器スプライトシート(1枚あたり什器10種)。年代・
  スタイル違いで5枚(レトロ/1980s/現行/レトロ2/2020sモダン)。**上記の理由により
  現行の什器レンダリングパイプライン(`fixture-bases.png`=空の什器本体+
  `merchandise.png`=商品オーバーレイを`fillRatio`で合成する方式、
  `docs/store-art-assets.md`「什器と商品の組み替え」参照)にはそのまま使えない**。
  中身を含んだ1枚絵のまま使うと、棚の商品構成が固定され在庫連動の表示
  (欠品時に商品が減っていく等)ができなくなる
- `06_fixture_catalog_infographic.png`・`07_era_fixture_grid_catalog.png`・
  `08_era_category_sprite_atlas.png` — 年代別・カテゴリ別の一覧カタログ/
  インフォグラフィック(1536×1024px)。個々の什器サムネイルは数十px四方と
  小さく、そのままゲーム用スプライトとして切り出せる解像度ではない。年代進行に
  伴う什器の見た目変化(`docs/store-fixture-zones.md`5節が仕様のみ・未実装として
  いた計画)の**方向性を検討する参考資料**としては有用
- `09_character_fixture_master_catalog.png` — 客・店員キャラクター、店員作業
  アニメーション(8方向×3フレーム想定)、什器、バックヤード設備等を横断した
  「基本アセットバッチ V1.0」の総覧インフォグラフィック。ChatGPT側が提案する
  ディレクトリ構成・命名規則の案も含む。個々の要素は同様にサムネイル解像度で、
  直接の切り出しには使えない

**この時点では未統合。次の一歩をどう進めるか(1枚絵のまま部分的に使うか/
ChatGPT側へ本当に分離された素材を作り直すよう依頼するか等)はユーザー判断待ち**
(`HANDOFF.md`参照)。

## 統合作業の進め方

個体の切り出し・アトラスへの合成は、既存の「什器フェーズ1」「キャラフェーズ1」
(PR #57)と同じ要領で進める: alpha透過を利用した連結成分の自動分割 →
既存セルサイズへリサイズ・下端合わせで合成 → `*-manifest.json`/アトラス仕様
更新 → typecheck・vitest・Playwrightで確認 → コミット。

新しい`StoreCategoryId`やバランス数値(価格・棚容量・カテゴリ嗜好等)を伴う
統合は、CLAUDE.mdの方針上Claude Codeが独断で決めるべきではなく、ゲーム
デザイン判断(ユーザーまたはChatGPT側)を仰いでから進める。
