# HANDOFF — 引き継ぎメモ

最終更新: 2026-09-02(セッションID `session_01KGvF2q3A9ckA45UX6stZaJ`)
対象ブランチ: `claude/review-md-files-ny37xl`(mainに追従、都度リセットして使う運用)

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
基準に、Playwright(Chromium)で実際にゲームを操作して現状を検証した。マージ済み
PRは #59・#60・#61(いずれも`main`に反映済み)。

### 0.1 重大バグ修正(PR #59)

営業時間中に▶再生しても来店客が実質1人もスポーンせず、棚在庫・売上・レジ行列が
丸1日変化しないという、店舗運営がまったく「回らない」状態だった。原因はステップD
(PR #56)で導入された来店率換算式が、実時間の経過秒をそのまま「実60秒=シム1分」
とみなす式のままで、実際の数値エンジンの時計が(速度1倍でも)1日をおよそ実時間
60〜80秒で進行することに対応していなかったこと(換算比が千倍以上ずれていた)。
修正・回帰テスト追加・Playwright再検証を行い、来店客のスポーン・棚在庫の減少・
レジ行列・欠品表示が実際に動作することを確認した。詳細は
`docs/visual-numeric-engine-integration.md`の「重大バグ修正: 来店客が一切
スポーンしない問題」を参照。

### 0.2 行列成長時の停滞を切り分け(PR #60)

PR #59直後は、客が多数(上限28人)スポーンして行列が育つと店内Canvas・main.ts
双方の時計まで進行が停滞する現象と、レジ優先の店員が補充作業から戻れず会計が
1件も成立しない現象を観測していた。Playwright(ブラウザ)抜きで
`StoreOperationsEngine`を直接Node.jsから駆動して同条件を再現したところ、
**純粋なロジックでは店員は数十秒以内に自律的にレジへ復帰し会計が成立すること
を確認**(デッドロックではない)。よって上記の停滞は、検証に使ったヘッドレス
Chromium(ソフトウェアレンダリング)+CPU共有コンテナという実行環境固有の
性能制約による可能性が高いと判断した(推論。実ブラウザでの再現有無は未確認)。
このNode.js直接駆動での検証を、本番同等のフレームペースで入店〜会計までを
検証する回帰テストとして`storeOperationsEngine.test.ts`へ追加した。

### 0.3 favicon未設定によるコンソール404を解消(PR #61)

`/favicon.ico`への自動リクエストが常に404を出しノイズになっていたため、
"CF"ブランドマークのSVGをBase64データURIで`index.html`へ直接埋め込んだ。
`vite.config.ts`の`publicDir`がゲームデータ用に`data/`へ変更されているため
通常の`public/`フォルダはビルドに含まれない、という罠がある(次に静的
アセットを置きたい場合は要注意)。

### 0.4 技術的な追加確認(バグなし、コミットなし)

上記に加えて以下をPlaywrightで確認し、いずれも問題は見つからなかった:
- 自動セーブ・ページリロード後の状態復元(day/cashとも正確に復元)
- 売場レイアウト編集の排他制御(客が店内にいる間は編集不可、案内メッセージ表示)
- 設備投資・陳列替え・重点カテゴリー設定(いずれもエラーなく動作)
- `campaignRuntime.ts`(30日キャンペーンUI)は`index.html`から読み込まれておらず
  現在は不使用、`storeVisualizationRuntime.ts`は内部状態を読むだけの純粋な
  プレゼンテーション層(architecture.mdのPresentationSystemに相当)で
  独自シミュレーションを持たない — いずれも今回のバグと同種の問題は無い

### 0.5 次にやるべきことの選択(ユーザーへ確認済み)

店内店舗運営を回す作業の残りとして、「売場配置(categoryArea)を数値エンジンへ
連携」「作業優先順位(set_task_priorities)を数値エンジンへ連携」
「技術的な穴埋めを継続」「ここで一区切り」の4択をユーザーへ確認したところ、
**「技術的な穴埋めを継続(推奨)」が選ばれた**。前2つはCanvas側の別モデル
(什器投資額・店員別タスク人数)を数値エンジン側のモデル(categoryArea点数・
優先順位付きリスト)へどう変換するかという設計判断を伴うため、今回は着手して
いない。次セッションで着手する場合も、独断で変換式を決めず、先にユーザーか
ChatGPT側の設計判断を仰ぐこと(詳細は2.6参照)。

このセッションでは、ChatGPT製アセットの取り込み(下記2.1)には着手していない
(アセット生成は引き続きChatGPT側の担当という方針のまま)。

### 0.6 別セッション(同日、`session_01KGvF2q3A9ckA45UX6stZaJ`)での追加作業

上記0.1〜0.5の少し後、同じ2026-09-02に、別のClaude Codeセッションが
ユーザーから「積み残し課題をどんどん進めて」という指示を受けて以下を実施した:

- **フェーズ2a着手(PR #63、マージ済み)**: 2.5「商品単位とカテゴリ単位の完全
  統合」のうち、バランス数値の新規決定を伴わない範囲として、本物の
  `Simulation`が報告する商品単位の欠品状況をカテゴリ単位に集計し、店内Canvas
  (`StoreOperationsEngine`)の翌日納品量へバイアスとして反映する変更を追加した。
  既存の「棚在庫が減る→空になる→警告が出る」という視覚フィードバックループは
  変更していない(あくまで納品量だけに影響)。詳細は
  `docs/visual-numeric-engine-integration.md`の「フェーズ2a」を参照。
- **ChatGPT製アセット原本のgit管理化**: ユーザーが2.1で言及されていた3つの
  ZIPのうち`conveniencestorefrontieradoptedassetscharacters.zip`と
  `conveniencestorefrontieradoptedassetsfixtures.zip`を再アップロードし、
  「gitで管理しておいて。いつでも使えるように」と指示。展開した原本
  (什器・商品モジュール・キャラクターのスプライトシート、ChatGPT側の
  `ASSET_SPEC.md`含む)を`art-source/chatgpt-adopted-v1/`へコミットした
  (`data/`ではなくその外側 — `data/`はVite`publicDir`のためビルド成果物へ
  そのままコピーされてしまう)。これにより**次のセッションはもう再アップロード
  不要**(下記2.1・5を参照)。まだ個体切り出し・アトラスへの統合作業(2.1の
  残り)自体は未着手。

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

### 2.1 最優先: ChatGPT製アセットの続き

以下は目視確認済みだが、まだ切り出し・組み込みを行っていない。**2026-09-02の
0.6作業で、fixtures/characters(採用版)2ZIPの中身は`art-source/chatgpt-adopted-v1/`
へgitコミット済みのため、これらの分は再アップロード不要**(`art-source/README.md`
参照)。ただし`conveniencestorefrontierapprovedassetsv1.zip`(3つ目、最初の
非採用込みパック)はまだ未取得 — 採用版パック(fixtures/characters)の内容が
これを実質的に包含しているとの記載があるため(ASSET_SPEC.md参照)、通常は
不要と見込まれるが、差分が必要になった場合のみ再アップロードを依頼すること。

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

### 2.6 上記のうち「Canvas側から即時反映」着手時に検討すべき具体的な論点

2026-09-02のセッションで、営業時間・人員数・発注/納品方針と同じ要領で即時反映
できないか検討したが、以下の理由で**モデルの対応関係を先に決める必要がある**
と判断し、着手を見送った(ユーザーへ確認し「技術的な穴埋めを継続」を選択、
この2項目は保留のまま)。

**作業優先順位(`set_task_priorities`)**:
- 数値エンジン側は`OperationTaskId`(register/replenishment/cleaning/
  delivery_receiving/admin の5種、`src/simulation/operations.ts`)を**過不足
  なく1回ずつ含む優先順リスト**を要求し、リスト先頭のタスクから共有作業容量を
  食いつぶす、という「順序ベース」のモデル
- Canvas側(店内Canvasの「人員」パネル)は店員一人ひとりに register/
  replenishment/cleaning のいずれか1タスクを**人数で割り当てる**モデルで、
  delivery_receiving・adminに対応する概念が無い
- 人数配分→優先順リストへの変換は複数のもっともらしい案があり得る(単純に
  人数の多い順に並べる、delivery_receiving/adminは現在の順序内の元の位置を
  維持する、等)。挙動への影響が読みにくいため、どの変換にするかはユーザー
  またはChatGPT側の判断を仰ぐこと

**売場配置(`set_category_area`)**:
- 数値エンジン側は`categoryArea`という「カテゴリごとの点数配分(合計固定70点)」
  の抽象モデル
- Canvas側は物理的なタイル什器レイアウト(`StoreLayout.fixtures`)で、対応する
  操作も「設備投資(棚容量+6ずつ拡張)」「陳列替え(什器2つのカテゴリを
  入れ替え)」であり、categoryAreaの点数とは単位も意味も異なる
- 什器拡張額・棚容量の増分とcategoryAreaの点数をどう対応させるかはバランス
  数値の決定そのものであり、Claude Codeが独断で決めるべきではない

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

- `/root/.claude/uploads/7033ef0c-.../*.zip` — ChatGPT製アセットの元ZIP3つ。**うちfixtures/characters(採用版)2つは2026-09-02(0.6)に`art-source/chatgpt-adopted-v1/`へgitコミット済みのため、この項目自体は解消済み**(3つ目のv1パックのみ、必要になれば再アップロード対象。2.1参照)
- `/tmp/claude-0/.../scratchpad/` — 展開・切り出し済みの中間ファイル、`split_sheet.py`(alpha連結成分による自動分割スクリプト)、各種確認用コンタクトシート。すべて揮発性
- `/root/.claude/plans/frolicking-wibbling-panda.md` — 数値エンジン統合フェーズ1(ステップA〜D)の計画書。内容は`docs/visual-numeric-engine-integration.md`に集約済みなので参照不要
