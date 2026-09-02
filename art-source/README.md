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

## 統合作業の進め方

個体の切り出し・アトラスへの合成は、既存の「什器フェーズ1」「キャラフェーズ1」
(PR #57)と同じ要領で進める: alpha透過を利用した連結成分の自動分割 →
既存セルサイズへリサイズ・下端合わせで合成 → `*-manifest.json`/アトラス仕様
更新 → typecheck・vitest・Playwrightで確認 → コミット。

新しい`StoreCategoryId`やバランス数値(価格・棚容量・カテゴリ嗜好等)を伴う
統合は、CLAUDE.mdの方針上Claude Codeが独断で決めるべきではなく、ゲーム
デザイン判断(ユーザーまたはChatGPT側)を仰いでから進める。
