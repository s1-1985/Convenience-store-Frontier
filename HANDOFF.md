# HANDOFF — 引き継ぎメモ

最終更新: 2026-09-03(セッションID `session_01MfcvrmAdbWq5fbzqJVR9hd`)
対象ブランチ: `claude/review-md-files-ktplye`(mainに追従、都度リセットして使う運用)

このファイルは、直近セッションで決まった仕様・実施した作業・積み残しの課題を、
次のセッション(別のClaude Codeインスタンス)が読むだけで状況を把握できるように
まとめたものである。詳細は各節末尾の参照ドキュメントを見ること。

CLAUDE.mdの「Read in order」に従い、README.md → design/PRINCIPLES.md →
docs/game-design.md → docs/vertical-slice.md → docs/architecture.md を
読んだ後、このファイルで直近の変更点を把握してから作業を始めること。

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
- **AI協業の役割分担を変更(ADR-0001)**: ユーザー指示により、ChatGPTの担当を
  画像・アート生成のみに限定し、ゲームデザイン・仕様策定はClaude Code側が
  担当する運用へ変更した。`CLAUDE.md`更新。「ゲームデザインを変更しない」制約は
  廃止し、基盤的な設計判断はユーザーへ確認する運用にした。
- **`design/PRINCIPLES.md`・`design/DECISIONS/ADR-*.md`を新設**: ユーザーから
  2026年7月の初期ブレインストーミングログ(ChatGPTとの壁打ち、約44,000行)を
  共有され、内容が`docs/game-design.md`へ正しく引き継がれているか照合するよう
  依頼された。突き合わせの結果、歴史進行・「研究ツリーではない」という中核思想は
  保持されていたが、**生活文化の「文化カード+関連網」システム**(名前付きカードの
  組み合わせで新文化が生まれる仕組み、例: 店内コーヒー+コンビニ朝食+イートイン
  →朝カフェ拠点)、**文化プロジェクト**(調査/開発/実証/展開の4フェーズ)、
  **商品開発方式3段階**(メーカー採用/共同開発/PB開発)、**競合企業の固有人格**
  (コスモマート/さくらストア/NEXT24/グランデリ)が`game-design.md`に未反映
  だったことが判明した。ユーザー確認のうえ`game-design.md`(4.1/4.2/5.1/8.1節)へ
  復元し、あわせて設計判断を記録する仕組み自体(`design/PRINCIPLES.md`=中核思想の
  1枚もの、`design/DECISIONS/ADR-*.md`=個々の設計判断記録)をブレスト当時の
  ChatGPT提案どおり新設した(採用されていなかったため)。詳細はADR-0001・
  ADR-0002を参照。ブレストログ自体はこのセッション限定のアップロードであり、
  次のセッションには持ち越されない(下記5参照)。

---

## 0-B. 続く別セッション(2026-09-02、新カテゴリ追加「冷凍食品」の実装)

「ゲームデザインと実装を進めて」という指示を受け、上記2.2(frozen_case/hot_caseが
プレイ上で見えない問題)のうち保留になっていた「新カテゴリのバランス数値決定」を、
ユーザーへ次の作業候補(技術統合の続き/アセット統合の続き/歩行アニメーション/
新カテゴリ追加)を確認した上で着手した。ユーザーが「新カテゴリ追加(冷凍食品等)」を
選択。

- **`design/DECISIONS/ADR-0003-add-frozen-food-category.md`を新設**し、以下を決定・
  実装した(詳細・根拠はADR本文を参照):
  - 数値エンジン側に`category_frozen_food`(冷凍食品)を新設。既存の
    `product_frozen_gyoza`(冷凍餃子、これまで専用カテゴリが無く`category_processed_food`
    へ仮分類されていたもの)をこちらへ付け替え、新規`product_frozen_udon`(冷凍うどん)を
    追加。`category_processed_food`には代わりに`product_retort_curry`(レトルトカレー)を
    追加し商品数2を維持(商品総数12→14、カテゴリ数6→7)。
  - `data/cohorts/customer_cohorts.json`の6コホート全てへ`category_frozen_food`の
    嗜好を追加(家庭客・高齢者・単身者/工場勤務者を厚めに)。
  - `data/stores/player_store.json`・`competitor_store.json`の`category_area`を
    再配分し、`economy.json`の`total_shelf_area_points`(70)を維持したまま
    `category_frozen_food`へ面積を割り当て(主に`category_processed_food`から捻出)。
  - `src/balance/benchmark.ts`の`lunch_focus`/`regional_generalist`戦略の
    `set_category_area`重み付けにも`category_frozen_food`を追記(未記載だと
    デフォルト重み1が入り、他カテゴリの意図した重み付けと整合しなくなるため)。
  - Canvas側(`src/game/storeOperationsEngine.ts`)の`StoreCategoryId`に`"frozen"`を
    追加し、`CATEGORY_DEFAULTS`・`createDefaultStoreLayout`(空きグリッド領域
    `x6-10,y9-10`に`frozen_case`什器を新設、`docs/store-fixture-zones.md`が言う
    「実際に配置する経路が無い」状態を解消)を更新。`src/ui/storeGameRuntime.ts`の
    `SIM_CATEGORY_TO_STORE_CATEGORY`・`CATEGORY_LABELS`・`categoryWeightsForCohort`・
    `FIXTURE_KIND_LABELS`、`defaultCategoryWeightsForHour`(同ファイル内)も配線。
  - 陳列商品アート(`merchandise.png`)は`"frozen"`をまだ追加していない
    (ChatGPT側のアート未着手のため)。`resolveFixtureArtIndex`はこの什器に対して
    意図的に`undefined`を返し、既存の`drawFallbackFixture`(冷凍用の氷色フォールバック、
    PR #55で準備済み)へ自然にフォールバックする実装のため、表示は壊れない。
  - HOTケース(おでん・中華まん)は今回は対象外のまま(ADR-0003内で理由を明記)。
    `hot_case`のFixtureKind・アートは引き続き未使用。
- 既存テスト3件(`loadScenario.test.ts`のカテゴリ/商品数、`storeArtAssets.test.ts`の
  「全什器にアートがある」前提、`storeOperationsEngine.test.ts`の陳列替えテストが
  frozen単体什器(同種什器が1つしか無く陳列替え不可)を引いた場合)を、上記の意図した
  仕様変更として更新。`npx tsc --noEmit -p .`・`npx vitest run`(165件全通過)・
  `npm run balance:ci`(4戦略とも実用範囲、単一戦略の支配なし)で確認済み。
- Playwrightでの実機確認を試みたが、この実行環境では**ADR-0003適用前の`main`
  ブランチ(変更なし)でも`#app`の`hidden`属性が外れず「店舗データを読み込んでいる…」
  のまま60秒待っても進行しない**ことを`git stash`によるA/B比較で確認した(コンソール・
  ネットワークエラーは一切出ない)。`curl`でのdata/JSON直接取得は全ファイル正常に
  返る。この停止は今回の変更が原因ではなく、この実行環境固有の制約(ヘッドレス
  Chromium+CPU共有コンテナ、HANDOFF.md 0.2で既に記録されている同種の問題)である
  可能性が高い。今回は`npx tsc --noEmit -p .`・`npx vitest run`(165件)・
  `npm run balance:ci`(4戦略とも実用範囲)による検証に留め、実ブラウザでの
  Playwright確認は次のセッション(または実デバイス)で改めて行うこと。

## 0-C. 続く同日セッション(2026-09-02、新カテゴリ追加「ホットスナック」の実装)

PR #68(0-B、冷凍食品カテゴリ)がユーザーによりマージされたのを受け、「続けて」
という指示で作業を継続。ADR-0003が対象外とした`hot_case`(おでん・中華まん)を、
`design/DECISIONS/ADR-0004-add-hot-snack-category.md`として同じ要領で追加した。

- ADR-0003は「現行の在庫モデルが温度・時間に極めて敏感なホットスナックの挙動を
  表現できず追加メカニクスが要る」ことを理由にHOTケースを対象外としていたが、
  改めて検討した結果、既存の`shelf_life_slots`(商品ごとに自由に設定できる
  バッチ期限)を短く設定するだけで新しいメカニクスなしに近似できると判断し、
  今回追加した(`product_oden`/`product_nikuman`とも16スロット=4時間、既存最短の
  新聞96スロット=24時間よりさらに短い)。
- `category_hot_snack`を新設し、夜間buyer(単身者・工場勤務者)・高校生・高齢者を
  厚めに配分。両店舗の`category_area`を再配分し合計70を維持したまま5ポイント
  割り当て。Canvas側は`StoreCategoryId`に`"hot"`を追加し、
  `createDefaultStoreLayout`の空き領域(`x12-16,y9-10`、frozen什器の隣)に
  `hot_case`什器を配置。frozenと同様、陳列商品アートは未着手のためフォールバック
  矩形描画(温色)のまま。
- 既存テスト3件(0-Bと同種のパターン: カテゴリ/商品数、「全什器にアートがある」
  前提の除外対象追加、陳列替えテストの単体什器除外)を更新。`npx tsc --noEmit -p .`・
  `npx vitest run`(165件全通過)・`npm run balance:ci`(4戦略とも実用範囲)で確認済み。
- これにより`docs/store-fixture-zones.md`が提案した4温度帯(常温・冷蔵・冷凍・HOT)
  すべてに対応する`StoreCategoryId`が揃った。
- Playwrightでの実機確認は0-Bと同じ環境制約により今回も未実施。

## 0-D. 続く同日セッション(2026-09-02、Canvas→数値エンジンの作業優先順位・売場配置の即時反映)

PR #69(0-C、ホットスナックカテゴリ)がユーザーによりマージされたのを受け、「続けて」
という指示で作業を継続。2.6で保留されていた「作業優先順位・売場配置をCanvas側から
即時反映する」変換規則を、`design/DECISIONS/ADR-0005-canvas-task-priority-and-category-area-sync.md`
として決定・実装した。

- **作業優先順位**: Canvas「人員」パネルの人数配分(register/replenishment/
  cleaningの3種)を、Simulation側の優先順リスト(5種)のうちこの3タスクの
  相対順位だけに変換する(人数の多い順、同数はSimulation側の現在の相対順序を
  維持)。Canvas側に概念の無いdelivery_receiving・adminは、現在の優先順リストの
  絶対位置から動かさない(2.6が挙げた2案のうち「元の位置を維持する」側を採用)。
- **売場配置**: Canvas側の各カテゴリの`shelfCapacity`(什器拡張後の実容量)を
  重みとして、Simulation側の`categoryArea`(点数配分、合計70点固定)へ比例配分。
  `dessert`(Simulation側に対応カテゴリが無い)の容量は`category_snacks`の重みへ
  合算。丸め誤差は`src/balance/benchmark.ts`の`weightedCategoryArea()`と同じ
  「最後のカテゴリへ残差を代入」する手法で吸収し、`set_category_area`が要求する
  厳密な合計一致を機械的に満たす。
- 変換ロジックを`src/game/storeCanvasPolicySync.ts`(新規、DOM非依存の純粋関数
  モジュール)へ切り出し、`SIM_CATEGORY_TO_STORE_CATEGORY`マッピングもここへ
  移設。`storeGameRuntime.ts`の`syncPolicyToRealEngine()`が`StoreOperationsEngine`
  を引数に取るよう変更し、既存(営業時間・人員合計・発注/納品方針)と同じ
  署名(シグネチャ)ベースの重複適用防止に組み込んだ。
- 単体テスト`src/tests/storeCanvasPolicySync.test.ts`(8件)を追加。
  `npx tsc --noEmit -p .`・`npx vitest run`(173件全通過)・`npm run balance:ci`
  (Canvasを経由しないため直接の影響は無いが、既存の合格基準を維持)で確認済み。
- Playwrightでの実機確認は0-B/0-Cと同じ環境制約により今回も未実施。
- 詳細は`docs/visual-numeric-engine-integration.md`「フェーズ2b」を参照。

## 0-E. 続く同日セッション(2026-09-02、歩行アニメーション基盤の実装)

PR #70(0-D)がユーザーによりマージされたのを受け、「続けて」の指示で続行。
次候補としてアセット切り出しの継続(2.1)を検討したが、python3にPIL/scipyを
インストールして着手しようとした直前で、**このセッションはPlaywrightによる
実機確認ができず、切り出し結果の視覚的な正しさを検証する手段が無い**ことに
気づき、ユーザーへ確認した。ユーザーは「歩行アニメーション実装に切り替える」を
選択(2.3側は仕組みの実装が主で、視覚差分が無くてもtsc/vitestで客観的に検証
できる部分が多いため)。

- `src/game/storeOperationsEngine.ts`: `StoreCustomerAgent`/`StoreStaffAgent`へ
  `walkCyclePhase`(累積移動距離)を追加。`moveAlongPath()`が実際に移動した
  距離(要求距離ではなく、経路が尽きた分を差し引いた実移動距離)を加算する。
  旧セーブ(このフィールドが無い)は`?? 0`で自己修復
- `src/ui/storeArtAssets.ts`: `resolveWalkFrame(walkCyclePhase, framesPerDirection)`
  (純粋関数)を追加し、`drawAgentArtwork`のセル選択を`row*(4*N) + facing*N + frame`
  へ変更。`CUSTOMER_FRAMES_PER_DIRECTION`/`STAFF_FRAMES_PER_DIRECTION`は
  **どちらも現状1のまま**(実際の複数コマ素材がまだ組み込まれていないため)。
  `N=1`のときは`resolveWalkFrame`が常に0を返すため、**セル選択の計算結果は
  従来と完全に同一**(視覚上の変化は無い、仕組みだけが用意された状態)
- 単体テストを追加(`storeOperationsEngine.test.ts`に2件: 移動でwalkCyclePhaseが
  増えること・経路が無い客は増えないこと、`storeArtAssets.test.ts`に3件:
  N=1では常に0コマ目・Nコマでの巡回・walkCyclePhase欠落時のフォールバック)。
  `npx tsc --noEmit -p .`・`npx vitest run`(178件全通過)・`npm run balance:ci`
  (Canvasの見た目のみの変更のため数値は前回と完全一致、既存の合格基準を維持)
  で確認済み
- 残っている作業(実機確認できるセッションで): ChatGPT製の4方向×3コマ歩行差分
  シートの切り出し・統合、`*_FRAMES_PER_DIRECTION`の引き上げ、Playwrightでの
  目視確認。詳細は2.3を参照
- Playwrightでの実機確認はこのセッションでも環境制約により未実施(今回は
  見た目が変わらない変更のため、影響は限定的)

## 0-F. 続く同日セッション(2026-09-02、店舗の物理拡張メカニクスの新規実装)

PR #71(0-E)がユーザーによりマージされたのを受け、「続けて」の指示で続行。
既に4件PRがマージされていたため、次候補(店舗拡張メカニクス/一区切り)を
ユーザーへ確認し、「店舗の物理拡張メカニクスを新規実装」が選択された。
`docs/free-play-roadmap.md`が「物理的な店舗タイル拡張はまだ」としていた項目に
対応する。`design/DECISIONS/ADR-0006-physical-store-expansion.md`に設計判断を
記録。

- 既存の設備投資(抽象的な棚容量+6、3段階)の上に4段階目「拡張工事」
  (¥280,000、+10)を追加。4段階目は数値だけでなく、対象什器の
  `StoreFixture.tiles`を実際に1行増やし、接客ポイントも新しい行へ移設する
- `createDefaultStoreLayout()`の空きフロア(y3-5・y8-9・y11-12)を実際に座標で
  調べ、9カテゴリ全てについて衝突しない拡張方向を個別に決定
  (`PHYSICAL_EXPANSION_DIRECTIVES`)。snacks/instantのように両面(上下)に
  接客ポイントを持つ什器は片側だけを拡張し、もう片側は維持する
- `nextCapacityInvestment`/`maxShelfTier`をカテゴリ引数付きに変更(既存の
  3段階は全カテゴリ共通のまま、4段階目のみカテゴリごとに利用可否が変わる
  設計。今回は9カテゴリ全てが対応)
- **視覚確認の代わりに、幾何学的な整合性を自動テストで担保**(このセッションも
  Playwright未使用): 9カテゴリ全てを同時に最大まで拡張した状態で、什器同士の
  タイルが一切重複しないこと、全接客ポイントが通行可能なままであること、
  `findStorePath`で入口から全接客ポイント・バックヤードへ実際に到達できる
  ことを検証。**この網羅テストは実装時に一発で通過**(事前に自由フロアの座標を
  精査してから拡張方向を決めたため)
- 単体テストを追加(拡張で什器タイルが増えること・既に向かっている客が
  再ルーティングされること、9カテゴリ同時展開でのタイル非重複・到達可能性)。
  `npx tsc --noEmit -p .`・`npx vitest run`(180件全通過)・`npm run balance:ci`
  (Canvas側のみの変更のため数値は前回と完全一致)で確認済み
- 残っている作業: Playwrightまたは実デバイスでの目視確認(什器アートが
  拡大後も不自然に伸びないか等)。什器描画は`fixture.tiles`から算出した
  boundsを基準にしているため、コード上は追従する設計だが未確認

## 0-G. 続く同日セッション(2026-09-02、ChatGPT製の什器アセット追加受領・不具合修正)

PR #72(0-F)マージ後、ユーザーからChatGPT製の追加什器アセットZIP3つ
(`conveniencestorefrontiererafixtureassetspart{1,2,3}...`)がアップロードされた
(`01_general`一般什器6枚、`02_store_equipment`店舗設備13枚、`03_era_variants`
年代別什器6枚、`04_product_modules`商品モジュール4枚、計29枚。
`/root/.claude/uploads/...`経由、**このセッション限定でアクセス可能**)。

各シートを目視確認する過程で、**`frozen_case`/`hot_case`什器の見た目が
フォールバック矩形描画のままになっている根本原因がコード側の不具合だった**
ことが判明した。`data/assets/store/fixture-bases.png`にはPR #57で追加済みの
本物の什器シェルアート(冷凍=青いチェスト式冷凍庫、HOT=光る温蔵ケース)が
既にあったが、`resolveFixtureArtIndex`(`src/ui/storeArtAssets.ts`)が
`FIXTURE_INDEX`(`fixtures.png`用のマップで、frozen/hotのエントリが無い)
だけを見て`undefined`を返していたため、`drawFixtureArtwork`が早期リターンし、
`fixtureBases.png`を使う描画分岐(`isMerchandiseFixture`側)へ一度も到達して
いなかった。新しいアセット統合を一切伴わない**コードの1行バグ修正**として、
`FIXTURE_BASE_INDEX`にエントリがあれば`FIXTURE_INDEX`に無くても通すよう
修正し、什器シェル自体は本物のアートで描画されるようになった(什器内の陳列
商品アート`merchandise.png`側はまだ別課題として残る、下記参照)。

- `src/tests/storeArtAssets.test.ts`のテストを更新(1件修正・1件追加、回帰
  防止用)。`npx tsc --noEmit -p .`・`npx vitest run`(181件全通過)で確認済み
- ADRは作成していない(新しい設計判断ではなく、既存の承認済みアセットを
  正しく配線し直すだけのバグ修正のため)
- **残っている作業(次セッションへの引き継ぎ)**:
  - 上記29枚のアセットはまだ本格的な取り込み(個体切り出し・アトラス統合)には
    着手していない。目視確認した限りでは:
    - `01_general/コンビニ什器の冷蔵_加熱ディスプレイ集.png`は特に有望
      (冷凍・HOT什器のバリエーションが多数)
    - `03_era_variants`(レトロ・80年代・90年代・近未来等)は
      `docs/store-fixture-zones.md`5節が「仕様のみ、未実装」としていた
      年代別ビジュアル差分に直接対応するが、**年代ゲーティングの仕組み自体が
      ゲームにまだ無い**(現在の実装は特定の年代に固定されておらず、
      年代に応じて什器を切り替える仕組みが存在しない)。着手する場合は
      別途その仕組みの設計から必要
    - `04_product_modules`(商品陳列モジュール)は、ADR-0003/0004と同様
      新しい`StoreCategoryId`/`ProductDefinition`の追加とバランス数値の決定を
      伴う可能性が高く、ゲームデザイン判断が必要
  - このセッションもPlaywrightが使えない環境制約が続いているため、大規模な
    アセット切り出し(座標の細かい確認が必要な作業)は次にPlaywrightが使える
    セッションへ持ち越すことが望ましい(2026-09-02の前セッションでユーザーへ
    確認した結果と同じ結論)
  - ZIP自体は`/root/.claude/uploads/15cd1d4b-.../`にあり、**次のセッションには
    持ち越されない**。本格的に取り込む場合は再アップロードを依頼するか、
    このセッション中に`art-source/`へコミットしておくこと

## 0-H. 続く別セッション(2026-09-03、Playwright環境制約の解消・歩行アニメーション実コマ絵の統合)

前回セッションまで「この実行環境ではPlaywrightが使えない(`#app`の`hidden`属性が
外れない)」という制約が繰り返し記録されていたが、このセッション冒頭で再検証した
ところ、**この制約は解消していた**(`#app`が正常に表示され、店内Canvasが描画される
ことをスクリーンショットで確認)。原因は不明(環境側の変更と推測されるが未確認)。
ただし利用には注意が必要: プロジェクトの`node_modules`には`playwright`パッケージが
無く、`npx playwright`もインストールを要求する。グローバルに`playwright@1.56.1`が
`/opt/node22/lib/node_modules`に入っているため、`NODE_PATH=/opt/node22/lib/node_modules
node -e "require('playwright')..."`のように`NODE_PATH`を明示すれば動く。

ユーザーへ「Playwrightが使えるようになったので保留作業に着手できる」旨を伝え、
次候補(歩行アニメーションの実コマ絵統合/一般什器アセットの追加バリエーション統合/
商品陳列モジュール向けの新カテゴリ追加)を確認したところ、
**「歩行アニメーションの実コマ絵統合」が選択された**(2.3参照)。

### やったこと

`art-source/chatgpt-adopted-v1/characters/base/コンビニ客の歩行スプライトシート.png`
(1254×1254px、alpha透過、4キャラクター×4方向)から、Python(PIL+numpy+scipy)で
連結成分・列方向の空白ギャップ検出を組み合わせて個体を切り出し、
`data/assets/store/customers.png`へ統合した。

- **元素材の実態(想定と異なっていた点)**: 事前の想定(HANDOFF旧記述)は「4キャラクター
  ×4方向×3コマ」だったが、実際にピクセルレベルで検証すると:
  - 4方向のうち実際に描かれているのは前・後・横(左向き)の3方向のみ。4行目は
    横向きの別バリエーション(ほぼ重複)で、右向きは存在しない
  - 4キャラクターのうち2人(チェーンパンツの男子、パーカー+買い物袋の男子)は
    3コマ、残り2人(スタジャン+ミニスカの女子、カーディガン+買い物袋の女子)は
    2コマしか描かれていない
  - 右向きは左向きの水平反転で代用。2コマしか無い2キャラクターは
    [コマA, コマB, コマA]の順で3コマ目にコマAを再利用して埋めた
  - 最初の自動分割(等分割ベース)では女子2人・男子1人(パーカー)で境界がずれて
    首から下が欠けたコマが生成される不具合が起きた。原因はキャラクターごとに
    実際のコマ数が違う(2種類ある)のに全キャラクター3コマ前提で等分割していた
    ため。列方向のアルファ空白ギャップを検出してキャラクターごとの実コマ数を
    判定する方式に直してから正しく切り出せた(コンタクトシートで目視確認)
- **`customers.png`のアトラス拡張**: 4列(前後左右)×32行だったものを、
  12列(4方向×3コマ、`col = facingColumns[facing] * 3 + frame`)×36行(1920×7920px)へ
  拡張。既存行0-31は元の単一コマを3列ぶん複製しただけ(見た目は完全に従来通り、
  静止のまま)。新規行32-35に上記4キャラクターの実コマを配置
- `src/ui/storeArtAssets.ts`: `CUSTOMER_FRAMES_PER_DIRECTION`を1→3に変更(これだけで
  既存の`resolveWalkFrame`/`drawAgentArtwork`のセル選択ロジックがそのまま有効化される
  設計、PR #71で準備済み)。`CUSTOMER_ROWS`を32→36件に拡張。`STORE_ART_ATLAS_SPEC.customers`
  を新しい寸法へ更新
- `src/ui/storeGameRuntime.ts`: `ALL_CUSTOMER_ROWS`を32→36件に拡張(新規4行は
  `COHORT_ARCHETYPE_ROWS`に未登録のため、既存のstudent_university_male等と同じ
  「未モデル化アーキタイプの一律フレーバー枠」から出現する)
- `data/assets/store/customers-manifest.json`: 新規4行(`casual_young_male_chain`・
  `casual_young_female_varsity`・`casual_young_male_hoodie`・
  `casual_young_female_cardigan`)を追加。`framesPerDirection`フィールドと
  列レイアウトの説明を追記
- 単体テスト更新: `src/tests/storeRasterAssets.test.ts`・`src/tests/storeArtAssets.test.ts`
  (アトラス寸法の期待値、stale化していたコメント文言)。`npx tsc --noEmit -p .`・
  `npx vitest run`(181件全通過)で確認済み
- **Playwrightで実機確認**(このセッションで初めて可能になった検証): 店舗を20倍速で
  営業させ、新規アーキタイプ(チェーンパンツの男子)が実際に来店客として描画される
  ことをスクリーンショットで確認。歩行ポーズも壊れずに表示されている。ただし
  スクリーンショットの間隔(1秒間隔、20倍速)ではコマ単位(0.4タイルごと)の
  切り替わりそのものは目視で追い切れておらず、アニメーションの滑らかさの確認は
  `resolveWalkFrame`の単体テストに委ねている
- ADRは作成していない(冷凍食品/HOTスナック追加のような新カテゴリ・バランス数値の
  決定を伴わない、既存の歩行アニメーション基盤(PR #71、ADRなし)への実素材統合の
  ため。方針としてPR #57のキャラフェーズ1と同種の扱い)

### 残っている作業(次セッションへの引き継ぎ)

- `staff.png`(店員)には複数コマの歩行差分アートがまだ無い。`STAFF_FRAMES_PER_DIRECTION`
  は1のまま。店員が接客ポイント間を移動する頻度は客より低いため優先度は客より低いと
  判断し、今回は着手していない
- `customers.png`の残り32行(0-31)は静止のまま。実コマ差分アートが存在しないため、
  これ以上の追加コマ化には新規アート(ChatGPT側)が必要
- `art-source/chatgpt-adopted-v1/`・`art-source/chatgpt-era-fixture-assets-v1/`に残る
  他の未統合素材(一般什器バリエーション、年代別什器、商品陳列モジュール、他の
  キャラクターシート)は引き続き未着手(2.1参照)。今回Playwrightが使えることを
  確認できたので、次はこれらの着手を検討してよい

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
- ~~`characters/base/コンビニ客の歩行スプライトシート.png` — 客4人
  (男子学生風、女子風、男性フーディー、女性)の4方向×3コマ歩行差分~~ →
  2026-09-03、`customers.png`行32-35へ統合済み(0-H参照)。実際には前後左右のうち
  右向きの素材は無く(左向きを反転して代用)、4人中2人は3コマではなく2コマしか
  無かった(3コマ目に1コマ目を再利用)
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

### 2.2 frozen_case/hot_caseがまだプレイ上で見えない → 両方解消済み(2026-09-02)

~~`FixtureKind`とアセットはPR #55/#57で用意済みだが、これらの種類の什器を
実際に配置する経路が無い~~ → `frozen_case`は`design/DECISIONS/ADR-0003-add-frozen-food-category.md`
(上記0-B参照)で`category_frozen_food`を新設し、デフォルトレイアウトへ配置済み。
`hot_case`も`design/DECISIONS/ADR-0004-add-hot-snack-category.md`(上記0-C参照)で
`category_hot_snack`を新設し、同様に配置済み。残るのは両カテゴリの陳列商品アート
(`merchandise.png`)がまだ無いことのみ(ChatGPT側の担当、届き次第
`FIXTURE_INDEX`/`MERCHANDISE_INDEX`へ追記)。

残っているのは`hot_case`(おでん・中華まん等)のみ。ADR-0003は意図的にHOTケースを
対象外とした(理由はADR本文参照)。追加する場合も同様にバランス数値の決定を伴う
ゲームデザイン判断であり、独断で決めるべきではない。

### 2.3 歩行アニメーション → customers.png(客)は解消済み(2026-09-03)、staff.png(店員)はまだ

2026-09-02の続く同日セッション(下記0-E参照)で、フレームアニメーションの仕組み
自体(エージェントごとのアニメーション状態、`drawAgentArtwork`のフレーム番号込み
セル選択)を実装した。その時点では`*_FRAMES_PER_DIRECTION`が両ロールとも1のまま
だったため見た目は従来と完全に同じだった(Playwrightが使えず実素材の統合を
検証できなかったため)。

2026-09-03(下記0-H参照)、Playwrightが使えるようになったことを確認したうえで、
`コンビニ客の歩行スプライトシート.png`から4キャラクター分の実コマを切り出し、
`customers.png`へ統合した(`CUSTOMER_FRAMES_PER_DIRECTION`を1→3)。新規4行
(32-35)が実際に歩行アニメーションする客として描画される。既存客アーキタイプ
(行0-31)は元素材が無いため引き続き静止のまま。

**残っている作業**:
- `staff.png`(店員)には複数コマの歩行差分アートがまだ無い。`STAFF_FRAMES_PER_DIRECTION`
  は1のまま。ChatGPT側に店員用の歩行差分アートを依頼するか、既存の客アーキタイプの
  一部を店員としても流用するかは未検討
- `customers.png`の行0-31を実コマ化するには、それぞれのアーキタイプに対応する
  新しい歩行差分アート(ChatGPT側)が必要(現状は該当素材なし)

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

- 棚面積(`categoryArea`点数配分)とタイル什器レイアウトの統合(什器の物理配置
  そのものの統合。点数の同期自体は2.6参照、解消済み)
- 商品単位とカテゴリ単位の完全統合(在庫欠品表示を含む)
- スロット単位で来店客1人1人を数値エンジンと厳密に対応させる演出
- ~~`set_category_area`/`set_task_priorities`をCanvas側から即時反映すること~~
  → 2.6参照、解消済み

### 2.6 「Canvas側から即時反映」の変換規則 → 解消済み(2026-09-02)

2026-09-02の前セッションで、営業時間・人員数・発注/納品方針と同じ要領で即時反映
できないか検討したが、モデルの対応関係(作業優先順位: 人数配分→順序リストの
変換規則、売場配置: 物理棚容量→点数配分の変換規則)を先に決める必要があると
判断し、着手を見送っていた(下記は当時の論点の記録)。

続く同日セッション(上記0-D参照)で、`design/DECISIONS/ADR-0005-canvas-task-priority-and-category-area-sync.md`
として変換規則を決定・実装済み。作業優先順位は「Canvas側の人数の多い順、
delivery_receiving/adminは現在の絶対位置を維持」、売場配置は「Canvas側の
shelfCapacityを重みとした比例配分、残差は最後のカテゴリへ」を採用した。

当時の論点(参考、いずれもADR-0005で解決済み):

**作業優先順位(`set_task_priorities`)**:
- 数値エンジン側は`OperationTaskId`(register/replenishment/cleaning/
  delivery_receiving/admin の5種、`src/simulation/operations.ts`)を**過不足
  なく1回ずつ含む優先順リスト**を要求し、リスト先頭のタスクから共有作業容量を
  食いつぶす、という「順序ベース」のモデル
- Canvas側(店内Canvasの「人員」パネル)は店員一人ひとりに register/
  replenishment/cleaning のいずれか1タスクを**人数で割り当てる**モデルで、
  delivery_receiving・adminに対応する概念が無い

**売場配置(`set_category_area`)**:
- 数値エンジン側は`categoryArea`という「カテゴリごとの点数配分(合計固定70点)」
  の抽象モデル
- Canvas側は物理的なタイル什器レイアウト(`StoreLayout.fixtures`)で、対応する
  操作も「設備投資(棚容量+6ずつ拡張)」「陳列替え(什器2つのカテゴリを
  入れ替え)」であり、categoryAreaの点数とは単位も意味も異なる

---

## 3. 現在のアーキテクチャ早見表

| 概念 | 数値エンジン(`src/simulation/*.ts`) | 見た目Canvas(`src/game/storeOperationsEngine.ts`) |
|---|---|---|
| 時計 | `SimClock`(15分/スロット、`main.ts`の`setInterval`で進行) | `requestAnimationFrame`。**PR #56以降は共有セッション経由で数値エンジンのday/slotを読む**(`storeGameRuntime.ts`の`simulatedClock()`) |
| 現金 | `Simulation`が正(`applyPolicy`/日報で変動) | **PR #56以降は数値エンジンのcashに同期**(`beginDay`/`setCash`)。ただし売場拡張(`investInCategoryCapacity`)は見た目エンジン独自の支出で、`unsyncedCapacityInvestment`により二重計上を防止 |
| 商品カテゴリ | 8種(`category_ready_to_eat`等、商品単位の在庫バッチを持つ。ADR-0003で`category_frozen_food`、ADR-0004で`category_hot_snack`を追加) | 9種(`StoreCategoryId`、カテゴリ単位の集約在庫のみ。同ADRで`"frozen"`/`"hot"`を追加)。`SIM_CATEGORY_TO_STORE_CATEGORY`で近似変換 |
| 棚面積 | `categoryArea`(カテゴリごとの点数、合計固定) | タイル什器レイアウト(`StoreLayout.fixtures`)。**未統合**(2.5参照) |
| 客の来店 | コホート別の潜在需要→店舗選択→購買 | 個別エージェントがCanvas上を歩く。**来店数はPR #56で実数値に同期済み**だが、誰が何を買ったかの1対1対応は無い |
| 共有ポイント | `src/ui/gameSession.ts`が両者から呼ばれる唯一の`Simulation`インスタンス | 同上 |

---

## 4. 参照ドキュメント索引

- `design/PRINCIPLES.md` — ゲームデザインの憲法(絶対に守ること・中核的な設計原則・本作固有の面白さ。CLAUDE.md指定の必読)
- `design/DECISIONS/ADR-*.md` — 設計判断の記録(ADR-0001: AI協業の役割分担変更、ADR-0002: 文化カード等の復元、ADR-0003: 冷凍食品カテゴリ追加、ADR-0004: ホットスナックカテゴリ追加、ADR-0005: Canvas作業優先順位・売場配置の即時反映変換規則、ADR-0006: 店舗物理拡張メカニクス)
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
- `/root/.claude/uploads/15cd1d4b-.../{54c1153a,81398bca,c5165661}-*.zip` — 0-Gで届いた
  年代別什器アセットZIP3つ(`conveniencestorefrontiererafixtureassetspart{1,2,3}...`)。
  **中身29枚は展開済みで`art-source/chatgpt-era-fixture-assets-v1/`へgitコミット済み
  (PR #73)のため、この項目自体は解消済み**(`art-source/README.md`参照)。ただし
  個体切り出し・アトラス統合自体はまだ未着手(0-G・2.1参照、次はPlaywrightが
  使えるセッションで)
- `/tmp/claude-0/.../scratchpad/` — 展開・切り出し済みの中間ファイル、`split_sheet.py`(alpha連結成分による自動分割スクリプト)、各種確認用コンタクトシート。すべて揮発性
- `/root/.claude/plans/frolicking-wibbling-panda.md` — 数値エンジン統合フェーズ1(ステップA〜D)の計画書。内容は`docs/visual-numeric-engine-integration.md`に集約済みなので参照不要
- `/root/.claude/uploads/212f8891-.../f98a0ec6-*.md` — 2026年7月の初期ブレインストーミングログ(ChatGPTとの壁打ち、約44,000行)。**照合結果は`design/PRINCIPLES.md`・`design/DECISIONS/ADR-0002-*.md`・`docs/game-design.md`4.1/4.2/5.1/8.1節へ書き出し済みのため、通常は再読み込み不要**。ただしこのログにはまだ移していない詳細(v0.9〜v1.1の数式・データ構造案、フランチャイズ・買収など試作範囲外の長期構想)が多く残っているため、将来それらが必要になった場合のみユーザーに再アップロードを依頼すること
