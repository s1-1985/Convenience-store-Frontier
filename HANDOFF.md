# HANDOFF — 引き継ぎメモ

最終更新: 2026-09-02(セッションID `session_01HFBAPTpwGrisZzQDHP8Thd`)
対象ブランチ: `claude/in-store-management-system-yx41hd`(mainに追従、都度リセットして使う運用)

このファイルは、直近セッションで決まった仕様・実施した作業・積み残しの課題を、
次のセッション(別のClaude Codeインスタンス)が読むだけで状況を把握できるように
まとめたものである。詳細は各節末尾の参照ドキュメントを見ること。

CLAUDE.mdの「Read in order」に従い、README.md → docs/game-design.md →
docs/vertical-slice.md → docs/architecture.md を読んだ後、このファイルで
直近の変更点を把握してから作業を始めること。

---

## 0. 直近セッション(2026-09-02、店内店舗運営の動作確認と重大バグ修正)

ユーザーからの指示:「什器・キャラのアセットはChatGPT側が生成中。Claude Codeは
ゲームシステム面を進める。まず店外マップは後回しにして、店内の店舗運営が回るように
したい」。これを受け、`docs/free-play-roadmap.md`の実装順1「一店舗営業の完成」を
基準に、Playwright(Chromium)で実際にゲームを操作して現状を検証した。

**発見した重大バグ**: 営業時間中に▶再生しても来店客が実質1人もスポーンせず、
棚在庫・売上・レジ行列が丸1日変化しないという、店舗運営がまったく「回らない」
状態だった。原因はステップD(PR #56)で導入された来店率換算式が、実時間の
経過秒をそのまま「実60秒=シム1分」とみなす式のままで、実際の数値エンジンの
時計が(速度1倍でも)1日をおよそ実時間60〜80秒で進行することに対応していな
かったこと(換算比が千倍以上ずれていた)。修正・回帰テスト追加・Playwright再
検証を行い、来店客のスポーン・棚在庫の減少・レジ行列・欠品表示が実際に動作
することを確認した。詳細は`docs/visual-numeric-engine-integration.md`の
「重大バグ修正: 来店客が一切スポーンしない問題」を参照。

**未解決の申し送り事項**: 上記修正後、客が多数(上限28人)スポーンして行列が
育つと、店内Canvasだけでなくmain.ts側の数値エンジンの時計まで進行が停滞する
現象と、レジ優先の店員が補充作業から戻れず会計が1件も成立しない現象を観測した。
アプリ側のロジック起因か、検証に使ったヘッドレスChromium+CPU共有コンテナという
実行環境固有の制約かは切り分けられていない。実ブラウザでの再現有無を含め、次の
セッションで調査すること(詳細も同ドキュメント参照)。

このセッションでは、ChatGPT製アセットの取り込み(下記2.1)には着手していない
(アセット生成は引き続きChatGPT側の担当という方針のまま)。

---

## 1. このセッションでやったこと(時系列サマリ)

### 1.1 前半: バグ修正・客層拡張(PR #52, #53)
- 店内什器のHUD重なり・紫の縁のはみ出しバグを修正(PR #52、マージ済み)
- 客層を6種→24種に拡張(未就学児〜高齢者、不良・無職・トラックドライバー等の
  属性アーキタイプ)。`data/assets/store/customers-manifest.json`に行と
  アーキタイプの対応を記載(PR #53、マージ済み)
- 客の買い物行動・出現確率を、実在する`data/cohorts/customer_cohorts.json`の
  6コホートに接続(人口×時間帯活動率の重み付き出現、コホートごとの購買
  カテゴリ嗜好)。同時に`variant`の範囲バグ(0-7しか使われず新規アーキタイプが
  一切出現しなかった)を修正(PR #53に含む)

### 1.2 ユーザーからの方針転換1: 画像生成はChatGPTへ、Claudeはゲーム設計へ
「画像はchatgptに作らせることにしたから、あなたはゲーム自体の設計を進めて」
という指示があった。これにより:
- 以降のキャラクター/什器の**画像生成**はClaude(Higgsfield)ではなくChatGPT側が
  担当する方針になった
- Claude Codeは実装・アーキテクチャ・コードレビュー・技術的な設計を担当

### 1.3 什器の温度帯区分の仕様化(PR #54)
- 初代『ザ・コンビニ』『ザ・コンビニ2』を調査し、常温・冷蔵・冷凍・HOTの
  4温度帯什器構成を確認
- **決定事項**: `ready_meal`(弁当)は現状の`cold_case`扱いのまま据え置く
  (冷凍・HOT用の新カテゴリ新設とは別問題として扱う)
- **決定事項**: 什器アセットの画像生成もChatGPT担当
- ChatGPT向けの作業ブリーフを`docs/handoffs/2026-09-01-fixture-art-brief-for-chatgpt.md`
  として作成・送付済み

参照: `docs/store-fixture-zones.md`

### 1.4 frozen_case/hot_caseのコード側準備(PR #55)
- `FixtureKind`に`frozen_case`/`hot_case`を追加(画像が無くても壊れないよう、
  フォールバック矩形描画・型定義のみ先行準備)

### 1.5 ユーザーからの方針転換2: 見た目Canvasと数値エンジンの統合(PR #56)
ゲーム内に**2つの独立した経済シミュレーションが並列動作している**という
アーキテクチャ上の重大な問題が判明した:

- `src/ui/main.ts` + `src/simulation/*.ts`: 地域習慣・競合AIを持つ「本物の」
  数値エンジン(`setInterval`で15分刻みのスロットを進行)
- `src/ui/storeGameRuntime.ts` + `src/game/storeOperationsEngine.ts`: 客が
  歩き回る店内Canvas。独自の現金/在庫/客数シミュレーションを持ち、
  `requestAnimationFrame`で進行。**上記の数値エンジンとは無関係**で、
  `#day-label`等のDOMテキストを読むだけの一方向・型なしの結合だった

ユーザー判断: **「storeGameRuntime(見た目)を主とし、main.tsの数値エンジンを
接続する」**方針を確定。フェーズ1として以下を実施:

- ステップA: `src/ui/gameSession.ts`(新規)で、ページ全体に1つだけの
  `Simulation`セッションを共有
- ステップB: 店内Canvasのcash/day/slot表示を本物の数値に同期
  (`StoreOperationsEngine.beginDay(day, realCash?)`/`setCash(realCash)`)
- ステップC: 営業時間・人員・発注/納品方針の変更を、Canvas側からも即座に
  数値エンジンへ反映(`syncPolicyToRealEngine()`)
- ステップD(一部): 来店客数の演出を実スロットの実来店数
  (`SimulationSnapshot.lastSlotPlayerVisits`)に同期。**在庫欠品表示の同期は
  未着手**(商品単位とカテゴリ単位の粒度差の吸収が必要、フェーズ2)

Codexレビューで実バグ2件が見つかり修正済み:
- P1: 売場拡張(`investInCategoryCapacity`)が見た目エンジン独自のcashからのみ
  差し引かれ、翌日の現金同期で購入前の残高に巻き戻り実質無料化していた
  → `unsyncedCapacityInvestment`で累計未反映支出を追跡し、同期時に差し引くよう修正
- P2: リセット直後の1日目は`beginDay()`による現金同期が発火せず、Canvasの
  所持金が本来の初期資金(300万円)ではなく見た目エンジン独自の初期値(30万円)
  のままだった → `setCash()`を追加し、共有セッション読み込み後に即座に同期

参照: `docs/visual-numeric-engine-integration.md`(フェーズ1の状況・
フェーズ2の課題を詳述)

### 1.6 ChatGPT製アセットの受領・組み込み開始(PR #57)
ユーザーから3つのZIPが届いた(いずれも`/root/.claude/uploads/...`経由、
**このセッション限定でアクセス可能。次のセッションには持ち越せない**):

1. `conveniencestorefrontierapprovedassetsv1.zip`(什器+商品モジュール、
   最初のパック)
2. `conveniencestorefrontieradoptedassetsfixtures.zip`(什器+商品モジュール、
   採用版。1と一部重複)
3. `conveniencestorefrontieradoptedassetscharacters.zip`(キャラクター、採用版)

**重要な発見**: 届いたアセットは店員シート
(`コンビニ店員8種のドット絵スプライトシート.png`)だけが既存ゲームの
フラットなドット絵と良い一致。それ以外(客・職業・家族・什器・商品モジュール
**全件**)は、より緻密な「イラスト調」(ソフトなグラデーション・光沢・
半写実的な陰影)で、既存アセットとは画風が明確に不一致だった。

ユーザーに画像で確認を取った上で、**「とりあえず全部取り込む」**(画風の統一は
後回しにする)という判断をもらい、その方針で進行中。

このセッションで実際に組み込んだもの(PR #57、マージ済み):
- **什器フェーズ1**: 冷凍ケース1種・HOTケース1種を`data/assets/store/
  fixture-bases.png`へ追加(2セル→4セル、768×256→1536×256)。
  `FIXTURE_BASE_COLUMNS`/`FIXTURE_BASE_INDEX`/`STORE_ART_ATLAS_SPEC`/
  `fixtures-manifest.json`を更新
- **キャラフェーズ1**: 店員8種シートから8キャラクター×4方向を客
  アーキタイプとして`customers.png`へ追加(24行→32行)。**注意**:
  元は店員用素材のため、客として使うと制服・名札姿のままという見た目の
  不整合がある(`customers-manifest.json`のnotesに明記済み)

参照: `docs/store-art-assets.md`、`data/assets/store/customers-manifest.json`、
`data/assets/store/fixtures-manifest.json`

---

## 2. 積み残しの課題(次にやるべきこと)

### 2.1 最優先: ChatGPT製アセットの続き(要・元ZIPの再提供)

以下は**このセッションで内容を目視確認済み**だが、まだ切り出し・組み込みを
行っていない。元のZIPファイルは`/root/.claude/uploads/`配下にあり**次の
セッションには持ち越されない**ため、作業を再開するにはユーザーに同じ3つの
ZIPを再アップロードしてもらう必要がある。

**未使用の什器シート(いずれもイラスト調、画風不一致は許容済み)**:
- `コンビニ什器ピクセルアート素材集.png` — 常温ゴンドラ・エンド什器・
  ワゴン等、一般什器の追加バリエーション(約35点)
- `コンビニ店舗アセット_sprite_シート.png` — 自動ドア、扉、壁、コーナー、
  サイネージ、清掃カート、台車、パレット、観葉植物、防犯ミラー、時計、
  各種カゴ・パレット(構造物・什器什器什器店舗設備、約40点)
- `コンビニ店舗設備スプライトシート.png` — レジ4種、セルフレジ、雑誌棚、
  冷蔵ケース、買い物カゴ置き場、ゴミ箱3種、コーヒーマシン、電子レンジ、
  シンク、バックヤード棚(チェックアウト・サービス什器、
  `checkout_and_service_fixtures.png`と内容重複)
- `コンビニ商品棚ピクセルアート素材集.png` / `コンビニ商品棚モジュール素材集.png` —
  商品陳列モジュール(飲料・乳製品・デザート・弁当惣菜・冷凍食品・
  お菓子・雑誌・たばこ等、膨大な点数)。**組み込むには新しい
  `StoreCategoryId`/`ProductDefinition`の追加とバランス数値の決定が必要
  (ゲームデザイン判断待ち、Claudeが独断で数値を決めるべきではない)**

**未使用のキャラクターシート**:
- `characters/base/コンビニ客の歩行スプライトシート.png` — 客4人
  (男子学生風、女子風、男性フーディー、女性)の4方向×3コマ歩行差分
- `characters/base/コンビニ運営ゲーム職業キャラクター集.png` — 職業
  キャラクター16人(配達員、消防/救助風、作業員、建設作業員等)
- `characters/base/コンビニ向け子ども_学生歩行スプライト集.png` — 子供・
  学生8人(未就学児2、小学生2、中学生2、高校生2)
- `characters/diagonal_and_extended/` 配下7シート — 4人/6人組の歩行
  アニメーション、家族連れ(親子)歩行素材、街を歩くちびキャラ素材、
  学園生活ちびキャラ素材 等

**方針**: 「什器フェーズ1」「キャラフェーズ1」と同じ要領(alpha透過を
利用した個体切り出し→既存セルサイズへリサイズ・下端合わせで合成→
manifest/atlas更新→typecheck・vitest・Playwrightで確認→コミット)で
段階的に進める。`/tmp/.../scratchpad/split_sheet.py`(alpha連結成分による
自動分割スクリプト)が再利用できるが、このスクリプトも次のセッションには
持ち越されないため、必要なら同じロジックで作り直すこと(ロジック自体は
シンプルなので難しくない: PIL+scipy.ndimageでalphaチャンネルの連結成分を
ラベリングし、bboxで切り出すだけ)。

### 2.2 frozen_case/hot_caseがまだプレイ上で見えない

`FixtureKind`とアセットはPR #55/#57で用意済みだが、これらの種類の什器を
実際に配置する経路が無い:
- 対応する`StoreCategoryId`が存在しない(冷凍食品・おでん・中華まん等の
  新カテゴリが必要)
- デフォルトレイアウト(`createDefaultStoreLayout`)・売場編集UIも、この
  2種類の什器を一切生成しない

新カテゴリの追加はバランス数値(価格・棚容量・カテゴリ嗜好等)を伴う
ゲームデザイン判断であり、CLAUDE.mdの方針上Claude Codeが独断で決めるべき
ではない。**ユーザーまたはChatGPT側でカテゴリ定義を決めてもらう必要がある**。

### 2.3 歩行アニメーション(新機能、未着手)

ChatGPT製キャラクターアセットには4方向×3コマの歩行差分が含まれているが、
現状のゲームには**フレームアニメーションの仕組みが一切無い**
(`storeArtAssets.ts`の`drawAgentArtwork`は方向ごとに静止1コマを描画するのみ)。

歩行アニメーションを実装するには:
- エージェント(客・店員)ごとにアニメーションタイマー/現在フレームを持たせる
- `storeOperationsEngine.ts`の`StoreCustomerAgent`/`StoreStaffAgent`型に
  アニメーション状態を追加
- `drawAgentArtwork`をフレーム番号込みのセル選択に変更
- アトラス側も1方向1コマ→1方向3コマ(またはN コマ)に拡張が必要

これは「アセットを置き換える」作業とは別次元の新機能実装であり、着手する場合は
規模の大きいタスクとして扱うこと。

### 2.4 画風の統一(将来課題、今回は意図的に据え置き)

現状、以下の3系統の画風が混在している:
1. 既存のフラットなドット絵(元customers.png行0-5、staff.png、
   fixture-bases.pngの元2セル)
2. ChatGPT店員シート由来(customers.png行24-31) — フラット寄りで(1)に近い
3. ChatGPT製の緻密な「イラスト調」(什器全般、客/職業/家族シート全般) — (1)とは
   明確に不一致

ユーザーの明示判断で「とりあえず全部取り込む、統一は後回し」となっている。
将来的に(2)(3)を(1)に寄せるか、逆に(1)を(2)(3)に合わせて作り直すかは
未決定。`docs/store-fixture-zones.md`の年代別ビジュアル差分計画とも関係する
可能性があるため、着手前にユーザーに方針を確認すること。

### 2.5 数値エンジン統合フェーズ2(`docs/visual-numeric-engine-integration.md`参照)

- 棚面積(`categoryArea`点数配分)とタイル什器レイアウトの統合
- 商品単位とカテゴリ単位の完全統合(在庫欠品表示を含む)
- スロット単位で来店客1人1人を数値エンジンと厳密に対応させる演出
- `set_category_area`/`set_task_priorities`をCanvas側から即時反映すること

---

## 3. 現在のアーキテクチャ早見表

| 概念 | 数値エンジン(`src/simulation/*.ts`) | 見た目Canvas(`src/game/storeOperationsEngine.ts`) |
|---|---|---|
| 時計 | `SimClock`(15分/スロット、`main.ts`の`setInterval`で進行) | `requestAnimationFrame`。**PR #56以降は共有セッション経由で数値エンジンのday/slotを読む**(`storeGameRuntime.ts`の`simulatedClock()`) |
| 現金 | `Simulation`が正(`applyPolicy`/日報で変動) | **PR #56以降は数値エンジンのcashに同期**(`beginDay`/`setCash`)。ただし売場拡張(`investInCategoryCapacity`)は見た目エンジン独自の支出で、`unsyncedCapacityInvestment`により二重計上を防止 |
| 商品カテゴリ | 6種(`category_ready_to_eat`等、商品単位の在庫バッチを持つ) | 7種(`StoreCategoryId`、カテゴリ単位の集約在庫のみ)。`SIM_CATEGORY_TO_STORE_CATEGORY`で近似変換 |
| 棚面積 | `categoryArea`(カテゴリごとの点数、合計固定) | タイル什器レイアウト(`StoreLayout.fixtures`)。**未統合**(2.5参照) |
| 客の来店 | コホート別の潜在需要→店舗選択→購買 | 個別エージェントがCanvas上を歩く。**来店数はPR #56で実数値に同期済み**だが、誰が何を買ったかの1対1対応は無い |
| 共有ポイント | `src/ui/gameSession.ts`が両者から呼ばれる唯一の`Simulation`インスタンス | 同上 |

---

## 4. 参照ドキュメント索引

- `docs/game-design.md` / `docs/vertical-slice.md` / `docs/architecture.md` — 正本(CLAUDE.md指定の必読)
- `docs/free-play-roadmap.md` — フリープレイ実装ロードマップ(進捗を随時更新すること)
- `docs/store-fixture-zones.md` — 什器の温度帯区分・年代別ビジュアル方針、ザ・コンビニ調査結果
- `docs/visual-numeric-engine-integration.md` — 見た目Canvasと数値エンジンの統合状況(フェーズ1完了、フェーズ2の課題)
- `docs/store-art-assets.md` — 全アトラスアセットの仕様一覧(セルサイズ・列/行数)
- `docs/handoffs/2026-09-01-fixture-art-brief-for-chatgpt.md` — ChatGPTへ渡した什器アセット作業ブリーフ(温度帯什器の技術仕様)
- `data/assets/store/customers-manifest.json` — 客32アーキタイプの行対応(年齢帯・性別・職業・出典)
- `data/assets/store/fixtures-manifest.json` — 什器ベース4種・商品オーバーレイの対応
- `reviews/results/customer-cohort-shopping-behavior.md` — 客の買い物行動・出現確率実装のレビュー記録(旧作業分)

## 5. このセッション固有の一時ファイル(次のセッションには残らない)

- `/root/.claude/uploads/7033ef0c-.../*.zip` — ChatGPT製アセットの元ZIP3つ。**再利用するには再アップロードが必要**
- `/tmp/claude-0/.../scratchpad/` — 展開・切り出し済みの中間ファイル、`split_sheet.py`(alpha連結成分による自動分割スクリプト)、各種確認用コンタクトシート。すべて揮発性
- `/root/.claude/plans/frolicking-wibbling-panda.md` — 数値エンジン統合フェーズ1(ステップA〜D)の計画書。内容は`docs/visual-numeric-engine-integration.md`に集約済みなので参照不要
