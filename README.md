# HAIR MIRROR AI — MVP

スマホ向けのAIヘアスタイル・シミュレーションWebアプリです。

## COLOR FUTURE AI — Phase 4 再構築版（現在）

正常なPhase 3 ZIP（216ファイル）だけをコードの復旧ベースにしています。残存125ファイルは取り込んでいません。正式仕様は [MASTER SPEC v1.1](docs/specs/COLOR_FUTURE_AI_MASTER_SPEC_v1.1.md)、復旧内容と限界は [PHASE_4_RECONSTRUCTION_REPORT](docs/PHASE_4_RECONSTRUCTION_REPORT.md) を参照してください。過去のPhase 4報告書も原文のまま同梱しています。

`/fiole` → 現在写真 → 実写真の髪・顔解析 → STYLE/COLOR設定 → 取得した値からA〜E設計 → COLORを髪だけ調整し確定 → STEP 04「AIシミュレーションを生成」。MAINを保存し、その画像を本人・STYLE・確定COLORとともにA〜Eの画像編集入力へ送ります。選択後に1案だけ編集・再生成できます。

**実API生成は未検証、画像生成全体はPARTIALです。** この復旧では外部画像APIを呼び出していません。キーがなければ生成ボタンは使用できず、MOCKへ自動置換しません。カメラ・解析・ライブラリ・デザイン設計・COLOR調整・カルテ保存はAPIキーなしで利用できます。物理iPad/iPhone Safariは未検証です。

画像、入力条件、親ID、AI原案、修正、選択、確認は同じDiagnosisSessionへ追記し、古い画像を消しません。新しい生成カルテの保存版を可逆gzip圧縮し、旧raw版を保持します。サーバー環境変数は`OPENAI_API_KEY`と`OPENAI_IMAGE_MODEL`。キーはコード・ZIP・ログ・画面へ含めません。

再現検証：`npm ci` → `npm test` → `npm run typecheck` → `npm run build` → `npm start`。解析SDK/WASMとモデルは固定版を同梱。ZIPをiPadで解凍しただけではWebアプリは起動しません。

ブラウザ通信テストはPlaywright/Chromiumを用意し、ビルド後に`PHASE4_START_SERVER=1 node --experimental-strip-types scripts/hair-simulation-ui.mjs`。`PHASE4_PLAYWRIGHT_MODULE` / `PHASE4_TEST_CHROMIUM` / `PHASE4_TEST_OUTPUT`で環境を指定できます。応答は必ずMOCKとして保存・表示し、実APIの画質検証とは区別します。

Phase 4.1実生成とPhase 5のカラー計算には進んでいません。

## COLOR FUTURE AI — デザイン設計 Phase 3（実装履歴）

唯一の正式仕様は [MASTER SPEC v1.1](docs/specs/COLOR_FUTURE_AI_MASTER_SPEC_v1.1.md)（v1.0本文＋追加仕様）。変更・実態・検証は [PHASE_3_IMPLEMENTATION_REPORT](docs/PHASE_3_IMPLEMENTATION_REPORT.md) を参照してください。

`/fiole` → 現在写真を撮影/登録 → STEP 02「写真から髪・顔を解析する」→ STEP 03 STYLE設定「AI前髪・顔周り5案を設計する」。取得済みの正面2D比率と美容師の確認値を、明示した未検証のデザインルールへ渡し、異なるA〜Eを作ります。本人実写生成は行いません。図は **DESIGN STRUCTURE PREVIEW** です。

AI原本・美容師確認・設計原案・修正・採用を別履歴で保存。根拠キー、実使用値、欠損入力を追跡できます。confidenceは未検証の入力充足度で、似合う確率ではありません。STYLE写真の形状や自由文の自動解釈は未接続で、既知の構造化条件だけを設計へ反映します。元写真/解析/STYLE条件が変われば旧案のアクティブ状態を解除し、履歴を保持します。

既存FIOLEデータ、髪だけのCOLOR調整、撮影/品質判定、単枚generate API、旧MOCK前髪案、施術記録を保持。MAIN→A〜Eの生成契約を追加しましたが、APIへは未接続です。v1.1のお持ち帰り・商品・メイク等は将来用の型契約と接続設計のみで、機能はUNIMPLEMENTEDです。

Phase 3のブラウザ検証はビルド後 `PHASE3_START_SERVER=1 node scripts/design-planning-ui.mjs`。Playwright/Chromiumを用意し、`PHASE3_PLAYWRIGHT_MODULE` / `PHASE3_TEST_CHROMIUM` / `PHASE3_TEST_OUTPUT`を指定できます。iPad/iPhone実機Safariの確認は別途必要です。以下はPhase 3時点の記録です。現在の状態は再構築報告を参照してください。

## COLOR FUTURE AI — 実写真解析パイプライン Phase 2（実装履歴）

Phase 2時点の実装範囲は [PHASE_2_IMPLEMENTATION_REPORT](docs/PHASE_2_IMPLEMENTATION_REPORT.md)、唯一の正式仕様は [MASTER SPEC v1.0](docs/specs/COLOR_FUTURE_AI_MASTER_SPEC_v1.0.md) です。

`/fiole` の「現在の髪を撮影」からカメラ／写真ライブラリで写真を登録し、STEP 02の「写真から髪・顔を解析する」を押してください。4方向の**元画像**を使い、MediaPipeの実モデルで髪領域と顔表面ランドマークを端末内解析します。検出した髪の未校正Lab/LCh、画像上の色のばらつき、正面の位置比率、撮影品質を同じ`DiagnosisSession`へ保存します。詳細で髪領域・部位区切りと美容師確認値を修正できます。AI原本と修正履歴は別保存です。

ダメージ・薬剤の吸い込みやすさ・人工色素量・正確なLv・白髪率・生え際・物理骨格は取得していません。未取得値は`null`／「美容師確認」。ROOT/MID/ENDは画像上の候補区切りで、実際の毛髪部位と一致する保証はありません。以前のMOCK診断・前髪案は折りたたみ内に保持しています。必要アンダー逆算、FIOLE最適配合、本人実写A〜Eの生成には接続していません。

Phase 2解析にOpenAI APIキーは不要です。解析SDK・WASM・モデルを`public/analysis`に同梱し、同じWebサイトから読み込みます。SDKの利用状況ログを無効化した限定パッチと全アセットのSHA-256は [NOTICE](public/analysis/NOTICE.md) と`asset-manifest.json`に記録しています。`npm ci`後の`npm run build`で、固定版SDKの確認とアセット準備を自動実行します。画像生成APIは以前のままで、生成時には別途サーバー側キーが必要です。

`npm test`（83件）、`npm run typecheck`、`npm run build`が合格。Chromiumで実モデル・4方向ライブラリ・仮想カメラ・保存・再読込・EXIF回転・大きな元画像・Worker／メインスレッドの両経路を検証しました。**iPad／iPhone実機Safariは未検証**です。

追加ブラウザ確認はPlaywrightとChromiumを用意し、ビルド後に`PHASE2_START_SERVER=1 node --experimental-strip-types scripts/photo-analysis-ui.mjs`で実行できます。`PHASE2_PLAYWRIGHT_MODULE`、`PHASE2_TEST_CHROMIUM`、`PHASE2_TEST_OUTPUT`を指定可能。`PHASE2_FORCE_MAIN_THREAD=1`で互換経路を検証します。HTTPSのWeb画面で操作してください。ZIPの解凍だけではアプリは起動しません。

## COLOR FUTURE AI — 共通データ基盤 Phase 1（実装履歴）

正式仕様は [MASTER SPEC v1.0](docs/specs/COLOR_FUTURE_AI_MASTER_SPEC_v1.0.md)、今回の変更と状態は [PHASE_1_IMPLEMENTATION_REPORT](docs/PHASE_1_IMPLEMENTATION_REPORT.md) を参照してください。

`DiagnosisSession`を既存カルテと同じID・保存版へ追加しました。ROOT/MID/END、診断原本と補正、STYLEとCOLOR、MAINとA〜E、提案と実施、出所と機能状態を分離して管理します。旧データはadapterで読み込み、旧保存版・元画像・FIOLE資料を保持します。

確認画面は `/fiole/demo` の「出典 / データ → 開発・検証 · 機能状態と共通データ」です。Phase 1時点の毛髪・骨格診断はMOCKでした。最新状態はPhase 4再構築報告書を参照してください。必要アンダー逆算・配合最適化・本人実写5案生成は未実装です。既存の単枚画像生成APIは変更していません。

検証は `npm test`（63件）、`npm run typecheck`、`npm run build`。追加のブラウザ確認はPlaywrightとChromiumを用意し、`PHASE1_START_SERVER=1 node --experimental-strip-types scripts/session-foundation-ui.mjs`で実行できます。利用する既存環境は`PHASE1_PLAYWRIGHT_MODULE`、`PHASE1_TEST_CHROMIUM`、出力先は`PHASE1_TEST_OUTPUT`で指定可能です。iPad／iPhone実機検証は未実施です。

## 機能
- お客様写真のアップロード
- なりたい髪型・髪色を日本語で入力
- OpenAI GPT-Image-2で写真を編集
- Before / AI After 比較
- 生成画像の保存

## ローカル起動
1. Node.js 24（この統合版の検証環境）を用意
2. `npm install`
3. `.env.example` を `.env.local` にコピー
4. `OPENAI_API_KEY` にOpenAI APIキーを設定
5. `npm run dev`
6. `http://localhost:3000` を開く

## Vercelで公開
1. このフォルダをGitHubリポジトリにアップロード
2. VercelでそのリポジトリをImport
3. Vercelの Environment Variables に `OPENAI_API_KEY` を登録
4. Deploy

## 公開前に追加推奨
- 利用規約 / プライバシーポリシー
- 同意チェック（人物写真をAI処理する旨）
- 利用回数制限・レート制限
- 画像保存を行う場合の保存期間と削除機能
- 認証 / 課金（必要になってから）

※ AI生成結果は施術結果を保証するものではない旨を画面内に表示しています。

## FIOLE資料・診断記録

`/fiole` に統合しました。保存先と検証結果は [FIOLE_INTEGRATION.md](./FIOLE_INTEGRATION.md) を参照してください。

## カラー相談の4ステップデモ

`/fiole` に写真中心の4ステップUIを用意しました。`/fiole/demo` は架空写真入りです。画像生成ボタンは既存の `/api/generate` を呼び出し、本人・STYLE・COLORの役割を分けた写真（最大3枚）と希望文を送ります。利用にはサーバー側のAPIキー設定が必要です。今回の作業環境ではキー未設定のため実生成は未確認です。

写真付きカルテと生成履歴はIndexedDBに端末内保存します。実装・仮値・接続方法・検証結果は [LIVE_IMAGE_DEMO.md](./LIVE_IMAGE_DEMO.md)、UI再設計は [FIOLE_Counseling_Redesign_Report.md](./FIOLE_Counseling_Redesign_Report.md) を参照してください。以前の手動記録は `/fiole/records` に残しています。

## 希望写真のライブ色調整

ステップ3で7つのスライダーを動かすと、希望写真の選択した髪だけがその場で変わります。「範囲を調整」から髪を塗る／消す操作ができ、範囲外の画素を保持します。髪をタップして採色し、「この色味で確定」から色差・レシピ候補へ進めます。元画像・調整後画像・髪マスク・UI値・CIELAB推定値・確定時刻を分けて保存します。

サンプルの髪の範囲は手動作成済み。COLOR参考画像のライブ調整では範囲を手動指定します。Phase 2の自動髪認識はCURRENT写真専用です。目標色は未校正の画像推定、配合は試算です。「ポロシティ」の表示は「薬剤の吸い込みやすさ」に変更し、内部キーと1〜5の尺度は維持しています。実装内容と保存形式は [FIOLE_Live_Target_Report.md](./FIOLE_Live_Target_Report.md) を参照してください。

## 4方向の標準化Before撮影

`/fiole`・`/fiole/demo` の「現在の髪を撮影」に、正面／右側／左側／後ろの専用カメラ、方向別ガイド、撮影後の採用・撮り直し、4枚確認、簡易品質チェックを追加しました。元画像・撮影条件・品質判定を表示用画像と分けて保存します。CAUTION／NGでも美容師が採用できます。

実機の専用カメラは、アプリを起動したHTTPSのWeb画面をSafariで開いて確認してください。ZIPの解凍だけではアプリは起動しません。カメラ不可時は端末カメラまたは写真ライブラリを利用できます。iPad／iPhone実機検証は未実施です。

実装範囲・簡易判定の限界・Phase 2・保存データ・実機確認手順は [CAMERA_CAPTURE_REPORT.md](./CAMERA_CAPTURE_REPORT.md) を参照してください。

## FACE DESIGNとSTYLE / COLOR

以前のMOCK顔分析と前髪A〜Eの編集・採用、髪型とカラーの独立した参考画像、3モードを追加しました。最終画像生成には本人＋STYLEの形＋確定済みCOLORの色＋採用前髪を統合します。調整後COLORはレシピと画像生成の双方へ接続。顔表面の実解析はPhase 2のSTEP 02から確認できます。骨格→前髪案の本設計・個別前髪生成は未接続です。保存構造・検証・次工程は [FACE_STYLE_COLOR_REPORT.md](./FACE_STYLE_COLOR_REPORT.md) を参照してください。

## 必要アンダーと2工程のカラー設計（Phase 1）

STEP4にベース作り→オンカラーを追加。仕上がりLvと必要アンダーLv/トーンを分離し、根元/中間/毛先、天然メラニン/人工染料、1剤/2剤、PRE-LIFT/ON COLOR実績を別保存します。自動逆算・リフト/発色予測は未実装でnull、美容師入力は出典を明記。従来の候補レシピはデモ試算として保持します。詳細は [PRE_LIFT_REPORT.md](./PRE_LIFT_REPORT.md) を参照してください。

## 正式UIリファレンス対応

[DESIGN_REFERENCE.md](DESIGN_REFERENCE.md) / [REFERENCE_UI_REPORT.md](REFERENCE_UI_REPORT.md) を参照。ホームの基本構成をユーザー提供画像へ統一し、既存の高度な機能は各カードの編集・詳細に収納しています。
# Phase 4復旧ブランチ / iPad向け起動

- 対象は `phase-4-reconstructed` のみ。mainへ統合しない。
- Node.js 24以上。既存のNext.js/React/MediaPipeの依存バージョンを維持。
- このブランチから新しいCodespaceを作成すると、依存関係と解析アセットの準備後、3000番ポートで自動起動する設定。
- `/fiole` がカラー未来AIの画面。VS Codeには `COLOR FUTURE AI: start Phase 4` タスクもある。
- 起動中の古いCodespaceへ新しい設定/コミットを自動反映したとは扱わない。
- lint / test / typecheck / buildを独立検証。lintは危険構文/構文の復旧baselineであり全React性能規則監査ではない。
- 実画像生成は未検証、PARTIAL。Phase 4.1とPhase 5は停止。
- 自動起動はローカルLinuxで検証。実Codespaces/iPad/iPhoneは未検証。
