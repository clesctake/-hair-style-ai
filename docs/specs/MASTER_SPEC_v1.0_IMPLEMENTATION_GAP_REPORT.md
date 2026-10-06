# MASTER SPEC v1.0 IMPLEMENTATION GAP REPORT

監査日：2026-10-03（UTC）。基準：本チャットで受領した **COLOR FUTURE AI MASTER SPECIFICATION v1.0**。保存した本文 `COLOR_FUTURE_AI_MASTER_SPEC_v1.0.md` を今後の唯一の仕様基準とする。過去の実装報告は証拠・履歴であり、仕様の代替ではない。

監査対象：現在の `hair-style-ai` 作業ツリー。HEADは `c38d79a0a7a0f09a457eb28b6b49f7046a6fed03` だが、未コミットの最新デモも対象。GitHub・公開サーバーの現在の稼働状況を監査したものではない。

**結論：カウンセリングUI、手動補正、COLORのライブ調整、薬剤候補検索、端末カルテ保存は動く。一方、写真を理解して骨格に合わせて設計し、MAIN DESIGNから本人実写A〜Eを一括生成する中核は完成していない。必要アンダー逆算と、そのベースからのON COLOR配合最適化も未接続。**

今回は監査と文書保存のみ。実装・API・データ・既存機能を変更していない。94ファイルを監査前後でハッシュ照合し、変更・追加したアプリソースは0件。実際の外部AI呼び出しは0回。

## 判定の読み方

| 区分 | v1.0に沿った意味 |
|---|---|
| REAL | 対象の処理・データの受け渡しが実際に動く。検証環境・範囲を併記する。実施した施術データであることや精度保証を意味しない。 |
| ESTIMATE | AI推定として動作している。固定値、手入力、単純な画素計算をAI推定には含めない。 |
| MOCK | UI・固定サンプル・仮データのみ。実写真解析や実績として扱わない。 |
| UNIMPLEMENTED | 要求された処理・接続が存在しない。型や入力欄があっても計算を実装済みとはしない。 |
| PARTIAL | REALな部分と、MOCK・未接続・未実装の部分が混在。動く境界を記す。 |

「実装コードはあるが外部サービスで未検証」はPARTIALとして検証不足を明記する。機能状態と、データの出所（MANUFACTURER等）は別軸で判定する。

## A. REAL — 実際に動く部分

| 機能 | 確認できた範囲 | 根拠 |
|---|---|---|
| 4STEPのホームと詳細階層 | `/fiole` と `/fiole/demo` に参考画像ベースのホーム、CTA、3カード、Before/After、履歴を配置。詳細へ移動できる。 | `app/fiole/page.tsx`、`src/components/reference-home.tsx:13`、`counseling-studio.tsx:35`。前回ブラウザ検証記録あり。 |
| 写真登録と保存用データ | 現在写真、STYLE、COLOR、施術Afterを独立登録。原ファイルと表示用縮小画像を分離できる。 | `journey-store.ts:14`、`current-photo.ts:3`。現在写真の原画像は `capture.original`、STYLE/COLOR/Afterは `Photo.original`。 |
| 撮影UIとカメラ制御コード | 4方向、方向別ガイド、確認・撮り直し、採用、最終確認、ストリーム終了処理を実装。 | `current-hair-capture.tsx:20,26,71,84,123`。カメラ全体の実機対応はE欄のPARTIALを参照。 |
| 簡易撮影品質計算 | 画素から露出、白飛び、黒つぶれ、逆光、輪郭鮮鋭度、フレーム間変化、条件付き位置プロキシを計算。GOOD/CAUTION/NG、0〜100点、個別結果を保存。警告は最大2種類。 | `capture-quality.ts:13,26,40,54`。これは未校正のルール計算で、AI診断ではない。 |
| 美容師補正・履歴 | ROOT/MID/ENDごとの補正をAI原本とは別に追記。原本・保存済み履歴の変更を拒否する。 | `journey.ts:9,16,33,34,47`、`tests/journey.test.mjs`。AI原本の内容自体は現状MOCK。 |
| STYLE/COLOR分離 | 別画像・別役割・髪型のみ／カラーのみ／両方を扱う。STYLEの変更がレシピの色入力へ混入しない。 | `design-target.ts:3,9,16`、`hair-images.ts:30`、`tests/face-design.test.mjs`。 |
| 髪範囲だけのライブ色調整 | 手動マスク、塗る／消す／戻す、7スライダー、Canvasでの画素補正、元画像との切替、確定を実装。マスク外RGBAを保持する試験に合格。 | `target-color-editor.tsx`、`hair-mask.ts`、`live-tone.ts:48`、`tests/hair-mask.test.mjs`。自動髪抽出は未実装。 |
| ターゲット確定データ | 元COLOR、調整後プレビュー、髪マスク、採色位置、UI値・正規化値、Lab、確定時刻を保存。変更後は再確定を要求。 | `target-adjustment.ts:101`。値は未校正画像の採色値であり、実測毛髪色でもAI分析でもない。 |
| 色空間と色差の演算 | sRGB↔Lab、LCh、明度・彩度・色相差、ΔE76を計算。HEXは表示目的。 | `live-tone.ts:10,20`、`journey.ts:36–39`。現在色がMOCKなら色差もその仮入力に対する計算。 |
| FIOLEデータ読込・候補検索・g換算 | 73資料項目、149確認色番、15資料固有軸。Lab差・残留傾向から図上ベクトルを順位付けし、希望Lv近傍の色番を選ぶ。比率から総量をg換算。 | `catalog.ts:3`、`journey.ts:43–45`。検索処理はREAL、方向重みと2:1処方はデモ仮定である。 |
| 前髪案の美容師編集・採用保存 | 現在の固定A〜Eの原案、編集中値、採用値を別保存。採用パラメータをSTYLEの希望文へ組み込む。 | `bang-design.ts:37–40`、`design-target.ts:17`。個別実写生成は未接続。 |
| カルテの端末保存 | 診断・補正・参考画像・ターゲット・試算・実使用・After・評価を同一相談へ保存。端末版はIndexedDB、埋め込み版はメモリのみ。 | `journey-store.ts:7–12`、`counseling-studio.tsx:42,78`。クラウド共有・学習モデルは含まない。 |
| PRE-LIFT/ON COLOR実績記録 | 2工程を別レコードで保存。実使用薬剤、比率、総量、OX、濃度記録、混合比、時間、部位、到達Lv・トーンを入力できる。 | `base-making.ts:29–31,50`、`base-making-panel.tsx:21`。 |
| 実際のPRE-LIFT結果の引継ぎ | 同じ写真群・同じ部位の直前の到達Lv／トーンを、次のON COLOR記録のBefore Underへコピーし、元工程IDを保持する。 | `base-making.ts:50`。監査時の合成データによる接続確認で成立。 |

## B. ESTIMATE — AI推定として動く部分

**この監査環境では、実接続・実行を確認できたAI推定機能はない。**

- HairAnalyzerは `demoAnalyzer`、FaceAnalyzerは `mockFaceAnalyzer` を既定で使用し、どちらも写真の画素から推定していない。
- 手動採色によるLab、画素ベース品質チェック、デモの薬剤順位付けは実際に計算するが、AI推定には分類しない。
- HAIR MIRRORの外部AI編集APIコードはあるが、APIキー未設定で実生成は未検証。これはPARTIALであり、今回のREALなAI推定として数えない。
- `base-making.ts:38–39` は `image_preview_estimate` を `AI_ESTIMATE` に変換する。このデータラベルは、実際にはCanvas採色でAI推定ではないため、v1.0の機能区分と整理が必要。現段階では修正しない。

## C. MOCK — 固定値・画面のみの部分

| 対象 | 現状 |
|---|---|
| AI毛髪診断 | ROOT/MID/ENDそれぞれ9項目、計27観測値と3つのLab色値を固定で返す。写真はIDと入力有無の確認に使うだけ。`journey.ts:30`。 |
| 顔・骨格計測 | 26項目の格納枠。10項目は固定サンプル比率、残り16項目は未判定。ランドマークは空、実測項目0。`face-measurements.ts:37–42`。 |
| 前髪A〜E | 毎回同じ5方向のテンプレート。analysisIdとbasisMetricsの名前は保持するが、比率値で案が変わらない。`bang-design.ts:22–36`。 |
| 「この前髪を試す」 | 条件を記録するだけ。`state:'not_connected'`、`generatedImage:null`。本人Beforeと概念図を表示し、本人Afterを生成しない。`bang-design.ts:42`、`face-design-panel.tsx:27,31`。 |
| 初期ターゲット色票 | ベージュ・アッシュ・暖色ブラウンのLab/Lvは固定例。未校正Lv換算を行っているわけではない。`journey.ts:27`。 |
| 初期After・履歴表示例 | 事前生成サンプルや参考画像からの表示例。今回の写真からの生成結果でも実施した施術でもない。`journey-sample.ts`、`reference-home.tsx:19,23`。 |
| 比率・推奨名の仮定 | 2剤適合や毛髪発色を探索せず、主候補2部＋補助候補1部、初期総量60gを使う。候補薬剤自体は実カタログ、混合比はデモ値。 |

## D. UNIMPLEMENTED — 処理が存在しない部分

- 現在写真からの本物の毛髪色・明度・残留色素・状態解析、および顔ランドマーク／骨格比率計測。
- HAIR ANALYSIS＋FACE/BONE＋STYLE＋COLORを受け取り、最終条件を作る独立したAI DESIGN PLANNING。
- 顔・骨格の測定値に応じて方向性の異なるA〜Eを設計するエンジン。
- MAIN DESIGNを親とする5つの子実写生成、5案一括生成ジョブ、親ID／生成枝ID／各案の画像対応。
- 本人実写A〜EのRESULT比較、選択後の編集・部分再生成、5長さの実写一括比較。
- 撮影条件の色校正・チャート補正、自動髪領域抽出、根元／中間／毛先／ハイライト／ローライトの自動採色。
- 色かぶり、照明ムラ、反射、レンズ曇り、頭髪の見切れの判定。距離の実測推定、頭部ランドマークも未実装。
- メーカー／実績データに基づく必要アンダー自動逆算、リフトルート自動判定、OX別リフト予測。
- 予測UNDER＋酸化／デポジットからの毛髪発色Lab予測、補色量の最適化、配合の再探索。
- Before/Afterを利用する補正モデルの学習・評価・推論、品質に応じた教師データの選別・重み付け、実績補正の版管理。

## E. PARTIAL — 動く部分と未接続の境界

| 対象 | 動く範囲 | 不足・未接続 |
|---|---|---|
| iPhone/iPad標準撮影 | getUserMedia、端末カメラ入力、4方向UI、ガイド、品質・採用記録。以前のChromium仮想カメラ検証記録あり。 | 実iPhone/iPadで未検証。端末カメラへのフォールバックにはライブガイドがない。距離・位置は条件付き画素プロキシで実測ではない。 |
| 品質評価全体 | 7系統の簡易判定と記録。美容師の強制採用も可能。 | 全項目のGOODを保証しない。髪領域限定ではなく頭部ガイドの矩形範囲。未評価項目は `not_assessed`。スコアは未校正。 |
| HAIR MIRROR単枚生成 | 本人＋STYLE＋COLORを役割別にmultipart送信する。調整済みCOLORと採用前髪文を使う。外部編集APIのコード・失敗処理・生成履歴がある。 | 本環境はAPIキーなし、実生成・本人維持品質は未検証。骨格比率と毛髪診断は生成入力に含まれない。生成は `n=1`、MAIN親子関係なし。 |
| COLOR解析 | 手動髪マスク内の選択円から採色して確定Lab・画像を保存。 | 全頭髪・全方向の解析ではない。画像と照明の校正、各ゾーンの採色、青／紫／暖寒方向の統一解析は未接続。 |
| 必要ベース・LIFT ROUTE | 仕上がりLv／必要アンダーLv／トーンを分離。メラニン／人工残留、ROOT/MID/END、6ルート、美容師の入力とnullを保持。 | currentLevel自体はnull。必要アンダーとルートを計算せず美容師設定を返す。毛髪履歴・薬剤・OXからの予測はない。 |
| PRE-LIFT→ON COLOR | 手入力の予想到達値をassessmentへ渡し、実施したPRE-LIFTから新規ON COLOR記録へ到達値をコピー。 | assessmentの最終Lab／デポジット／補色ベクトルはnull、optimizerは未接続。これらは候補レシピ算出には使われない。 |
| FIOLE候補レシピ | 確定COLORのLab・希望Lv・残留指標を使い、図上構成により候補を抽出。OX候補とg換算を表示。 | 髪質・履歴・必要アンダー・リフト後トーン・OX効果による配合補正を行わない。OX候補は固定列挙。科学的発色予測ではない。 |
| 前髪パラメータ | kind/length/width/density/part/flow/sideBang/faceFrameを保存・編集・採用。採用案を単枚生成の希望文へ渡す。 | face_frame_length/direction/volume_position等の独立パラメータが不足。5案それぞれの実写API生成なし。 |
| 長さバリエーション | −10／−5／0／＋5／＋10cmの選択・保存・単枚生成の希望文への伝達。 | 校正済みcm計測なし。5枚の生成・比較・子画像関係なし。 |
| RESULT | 実写Before/After表示の器、生成導線、ホームのシミュレーション／AIレシピ／注意点タブ。 | MAIN＋実写A〜E＋5長さという結果モデル・比較画面なし。詳細では生成とレシピが同時表示。タブ引数は `jump` 内で使用されず、詳細の目的タブへ直接切替しない。 |
| カルテ・学習用記録 | ローカル相談リビジョンに写真、品質、仮診断／修正、参考画像、ターゲット、試算／実使用、工程実績、After、評価を保持。 | Afterは主に1枚。工程別Afterの追加入力と後からの関連付けは不足。AI生成5案の親子履歴・モデル版・選択後編集履歴、学習セット変換・補正モデルはない。 |
| 出所・状態管理 | 6つのデータ信頼区分、計測方法、sourceIds、MOCKや未接続の注記がある。 | 全モジュール共通の機能状態台帳なし。DEMO・推定・AIおすすめ等の表示が混在。手動採色のAI_ESTIMATE扱い、希望Lvの出所追跡不足を解消する必要がある。 |

## 17本の接続監査

「到達先に画面がある」だけでは接続済みとしない。以下は現行の既定実行経路を監査した結果。

| # | 接続 | 判定 | 実データの到達範囲／停止点 | コード根拠 |
|---|---|---|---|---|
| 1 | CURRENT PHOTO → Hair Analysis | MOCK | Photo[]とIDは渡るが、画素を読まず固定27値・固定Labを返す。異なる写真でも同じ値。 | `counseling-studio.tsx:40` → `journey.ts:30` |
| 2 | CURRENT PHOTO → Face/Bone Analysis | MOCK | 正面有無、入力ID、品質参照は渡る。比率は固定例、ランドマーク空。 | `face-design-panel.tsx:14` → `face-measurements.ts:37–42` |
| 3 | Face/Bone → Design Planning | UNIMPLEMENTED | 生の骨格値を受け取る計画エンジンがない。生成入力にも入らない。 | `hair-images.ts:30–47`、`design-target.ts:17` |
| 4 | STYLE → HAIR MIRROR | PARTIAL | 画像をstyleReferenceImageとして送信、APIが形だけの参照として追加。実AIは未検証。 | `hair-image-client.ts:22`、`route.js:36,48,50` |
| 5 | COLOR → Target Color Analysis | PARTIAL | 手動髪範囲＋選択円→実画素Lab→確定色。自動分割・照明補正・部位別解析なし。 | `live-tone.ts:72`、`target-color-editor.tsx:142`、`target-adjustment.ts:101` |
| 6 | Adjusted COLOR → HAIR MIRROR | PARTIAL | 確定プレビューをcolorReferenceに選択し、API画像と希望文に送る。実生成の色反映は未検証。 | `hair-images.ts:38,41`、`hair-image-client.ts:22` |
| 7 | Adjusted COLOR → Recipe Engine | PARTIAL | 確定Labをtarget.colorへ保存し、direction/proposeRecipesが参照。現在は仮重み・2:1の候補検索。 | `target-adjustment.ts:121`、`journey.ts:43–44` |
| 8 | Face/Bone → Bang/Face Frame A–E | MOCK | analysisIdは紐付くが、測定値でパラメータが変わらない。basisMetricsは根拠項目名の記録。 | `bang-design.ts:22–36` |
| 9 | A–E Parameters → 実写生成 | PARTIAL | 美容師が採用した1案だけ、希望文として単枚生成入力へ到達。個別「試す」は未接続、5案画像はない。 | `design-target.ts:17`、`hair-images.ts:39–44`、`bang-design.ts:42` |
| 10 | MAIN → A–E Parent/Child | UNIMPLEMENTED | 親画像・子案・枝別生成のモデルや処理なし。APIはn=1、クライアントも単一画像。 | `route.js:60,75`、`hair-images.ts:8–23` |
| 11 | CURRENT → REQUIRED UNDER | PARTIAL | 現在・目標データの枠と部位別計画はあるが、requiredUnderCalculatorは入力値かnullを返すだけ。 | `base-making.ts:38,40,43` |
| 12 | REQUIRED UNDER → LIFT ROUTE | PARTIAL | 必要Lv・トーンは計画内に保持。routeは独立した美容師選択で、自動判定しない。 | `base-making.ts:45`、`base-making-panel.tsx:19` |
| 13 | PRE-LIFT → ON COLOR | PARTIAL | 手入力予測はassessmentに到達。実績は次工程Beforeへ引継ぎ。ON COLORの発色計算は空。 | `base-making.ts:47–50` |
| 14 | ON COLOR → FIOLE Recipe | UNIMPLEMENTED | onColorAssessmentの結果をproposeRecipesへ渡して最適化する接続なし。現在の候補検索は従来のCURRENT/TARGET方向デモ。 | `base-making.ts:48` 対 `journey.ts:44` |
| 15 | AI Recipe → Treatment Record | REAL | 選択提案を実使用欄へコピーし、提案IDを保持。編集・確認後に別実使用として保存する。処方内容の精度は保証しない。 | `counseling-studio.tsx:78`、`journey.ts:22`、`journey-store.ts:7` |
| 16 | Actual Treatment → After Record | PARTIAL | session.actual＋after＋outcomeを保存。工程ごとに現在のAfter IDをコピーする枠もある。 | `journey.ts:23`、`base-making-panel.tsx:21`。複数After／工程後の後付け連携は不足。 |
| 17 | Before/After → Empirical Learning Data | PARTIAL | 学習素材となる相談・工程実績・品質を保存できる。 | `journey-store.ts:7–12`、`base-making.ts:31`。教師データセット化・学習・品質重み・補正モデルは未実装。 |

この17本ではREAL 1、MOCK 3、UNIMPLEMENTED 3、PARTIAL 10。ESTIMATEとして実動作確認した接続は0。これは接続の区分であり、アプリ全体の完成率ではない。

## 特に重要な仕様差分

1. **骨格を生成条件に使う接続がない（§9・24・28）。** 顔比率を変えても、固定5案と生成request/contextは変わらない。採用前髪を文章へ入れる処理だけがある。
2. **5案は固定概念図であり、本人実写5案ではない（§26・29・30）。** 現UIの個別「試す」は条件記録で、結果の代替にしてはいけない。
3. **MAIN DESIGNという親生成の仕組みがない（§25・31）。** 単一Afterの生成履歴はあるが、Main→A〜Eの親子関係・バッチ完了状態はない。
4. **生成前に案を手動編集する順序が中心（§39）。** 実写5案を見て選択し、その後編集するUXへは接続していない。既存編集機能は残して次階層に再配置する対象。
5. **ON COLORの計算結果と候補レシピは別経路（§16・18–22）。** PRE-LIFT予測を14Lv/yellowから3Lv/redへ変えても候補薬剤・配合比は変わらない。baseMakingの値がcontextに入ることと、計算で使うことは別。
6. **実際の分析用元画像と数値の出所に不足がある（§5・6・14・42）。** 元画像は保持するが、現在毛の実採色・校正へは使っていない。Base LevelとUnder Levelの独立診断は未完成。ライトナー履歴の専用選択なし、黒染め／暗染めは同じ選択肢。
7. **アプリ入口が統一されていない（§45）。** `/fiole` は正式参考ホームだが、ルート `/` は従来の2画像HAIR MIRROR画面。独自削除せず、今後の指定フェーズで入口と旧機能の導線を整理する。
8. **既存開発文書も最新版へまだ整合していない（§48–50）。** AGENTS.mdにはマスター未確認という以前の記録が残る。今回はコード・開発設定を変更せず、受領した本文とこの監査を正式な参照資料として提出する。

## 全50項目の対応表

| § | 仕様 | 判定・現状 |
|---|---|---|
| 1 | PRODUCT VISION | PARTIAL：操作フローの土台はあるが分析→設計→実施計算は途切れる。 |
| 2 | 正式UI | REAL（画面実装）：参考配置・配色・階層。iPad実機は未検証。 |
| 3 | 4STEP | REAL：メインは4STEP。旧8STEPコードは保存されるが現行メインとしては使わない。 |
| 4 | CURRENT PHOTO | PARTIAL：4方向撮影・ライブラリ・ガイド・確認を実装、iOS実機未検証。 |
| 5 | PHOTO QUALITY | PARTIAL：画素ヒューリスティック実装、高度判定・校正未実装。 |
| 6 | HAIR ANALYSIS | MOCK＋PARTIAL：固定診断、部位補正保存はREAL。実AI、Base Level、履歴の細分化に不足。 |
| 7 | ROOT/MID/END | REAL（データ構造）：診断・補正・ベース計画・工程に部位キー。自動領域解析なし。 |
| 8 | FACE/BONE | MOCK＋PARTIAL：26計測枠、固定比率・null、実ランドマークなし。 |
| 9 | 骨格を生成条件に使用 | UNIMPLEMENTED：比率から計画・生成への実接続なし。 |
| 10 | STYLE/COLOR分離 | REAL（入力と役割）。 |
| 11 | STYLE特徴 | PARTIAL：画像と希望文を形としてAPIへ送る。独立した自動形状分析・実生成検証なし。 |
| 12 | COLOR特徴 | PARTIAL：手動髪採色と調整、部位枠のみ。自動解析・多領域なし。 |
| 13 | LIVE COLOR | REAL（フロント処理）：7項目、確定、候補計算への導線。高精度実生成はPARTIAL。 |
| 14 | RGB/Lab/染料軸分離 | PARTIAL：色演算と別軸保存はREAL、撮影補正・履歴／UNDER補正は未実装。 |
| 15 | FIOLE DB | REAL（読込）：73/149/15を保持。RADICEは現行データにない。正式採用時の追加対象。 |
| 16 | LIFT＋DEPOSITモデル | PARTIAL：概念と型、数値予測は未実装。 |
| 17 | 1剤／2剤 | PARTIAL：独立記録枠、効果の定量モデルはnull。 |
| 18 | REQUIRED UNDER | PARTIAL：別Lv＋tone、美容師入力のみ。自動逆算なし。 |
| 19 | メラニン／人工残留 | REAL（独立記録枠）、その影響を使う予測は未実装。 |
| 20 | LIFT ROUTE | PARTIAL：6候補と手動選択、自動判定なし。 |
| 21 | PRE-LIFT PREDICTION | PARTIAL：出力枠・手動予想、予測モデルなし。 |
| 22 | ON COLOR CALCULATION | UNIMPLEMENTED（計算）：最終Lab・deposited vector・optimizerなし。 |
| 23 | DOUBLE COLOR | REAL（実績記録）：別工程。生成処方・工程画像の詳細連携はPARTIAL。 |
| 24 | AI DESIGN PLANNING | UNIMPLEMENTED。 |
| 25 | MAIN DESIGN | PARTIAL：単枚生成APIの器。正式Main役割・親生成関係なし。 |
| 26 | 個人別A〜E | MOCK：固定テンプレート。 |
| 27 | 前髪／顔周りパラメータ | PARTIAL：8キー＋原案／修正分離。顔周り詳細キーが不足。 |
| 28 | 骨格→5方向設計 | UNIMPLEMENTED。 |
| 29 | 本人実写A〜E | UNIMPLEMENTED：概念図はあるが完成実写5案なし。 |
| 30 | 5案一括生成 | UNIMPLEMENTED。 |
| 31 | 親子生成 | UNIMPLEMENTED。 |
| 32 | 本人維持 | PARTIAL：プロンプト制約あり、実出力検証・髪以外の維持確認なし。 |
| 33 | 長さ5種類 | PARTIAL：選択と希望文、実寸・5枚比較なし。 |
| 34 | RESULT最重要 | PARTIAL：写真中心の器、指定した最終結果の構成は未完成。 |
| 35 | MAIN/A〜E/長さ/色 | PARTIAL：単枚Before/After・色候補、5案と長さ実写なし。 |
| 36 | RESULT TABS | PARTIAL：ホーム3タブあり。施術工程は詳細内、詳細タブ指定未使用。 |
| 37 | 簡易レシピ表示 | PARTIAL：現在→必要→施術→候補を表示。値は未判定・手入力／仮処方。 |
| 38 | プロ向け詳細 | PARTIAL：項目・入力あり、逆算から最適化までの計算なし。 |
| 39 | 実写案選択後の編集 | PARTIAL：手動案編集・採用はREAL。実写5案選択後の再生成UXなし。 |
| 40 | BEFORE/AFTER RECORD | PARTIAL：多くの項目を保存、生成枝と複数After等に不足。 |
| 41 | 実績学習 | PARTIAL：素材保存、学習・実績補正モデル・評価なし。 |
| 42 | 出所ラベル | PARTIAL：6区分あり、手動採色のラベル等の整合に不足。 |
| 43 | 機能状態 | PARTIAL：個別注記あり、共通台帳なし。実AI推定の稼働確認0。 |
| 44 | ホーム簡略化 | REAL（画面実装）：高度編集を次階層に収納。 |
| 45 | 正式ホーム | PARTIAL：`/fiole` は対応、ルート `/` は旧画面。 |
| 46 | 無断削除禁止 | 今回遵守：コード・API・データ変更0件。 |
| 47 | 全体体験 | PARTIAL：分析・計画・5案生成・物理処方が未接続。 |
| 48 | 受領後の差分監査 | 完了：A〜E分類を提出。実装は開始しない。 |
| 49 | 17接続 | 完了：全17本を上表で確認。 |
| 50 | GAP REPORTと依存順 | 完了：本報告と下記の候補を提出。次フェーズの指定を待つ。 |

## 検証結果と限界

- 既存の単体試験 **40/40合格**。写真品質、マスク外画素保持、確定ターゲット、役割分離、履歴分離、2工程記録等を確認。
- TypeScript型検査合格（`--noEmit --incremental false`）。アプリの修正や再ビルドは行っていない。
- 監査専用の合成入力で9件の追加接続確認を実行。異なる写真でも固定診断、骨格値が5案に影響しない、診断値が生成条件に入らない、確定COLORが生成入力・候補計算へ渡る、アンダー入力だけではルートが算出されない、PRE-LIFT→ON COLOR実績連携等を確認。施術実績やAI推定を作り出したものではない。
- API単体試験は外部応答の差し替えであり、実際のOpenAI成功や画像品質を証明しない。本環境にOPENAI_API_KEYはなく、外部AI呼び出し0。
- 今回のブラウザ再検証はChromium本体の起動異常（SIGSEGV）で開始できず、完了していない。前回のホーム操作・レスポンシブ検証は履歴として参照するが、今回の成功として数えない。
- iPad/iPhone実機、公開サイト、課金環境、実顧客の教師データ件数は未確認。実顧客データが蓄積しているかは分からない。
- メーカーデータ原本は変更なし。SHA-256：`fiole_catalog.json` = `b355af7db8a795633268dc0d1a705dea1426a8cf8c9f9478c4bb4681a7c70513`、`web_research.json` = `25ca6f58684c0219d3c6616edf5e72d5cecc3df4afacc7e5ad88f384b61ff301`。

## 次に実装する候補 — 依存関係順

以下は提案であり、実装開始の承認ではない。ユーザーが最初のフェーズを指定した後に差分実装する。

| 順 | 候補 | 先に必要なもの | 完了確認の基準 |
|---|---|---|---|
| 1 | 共通データ契約・機能状態台帳 | v1.0 | 診断入力／測定値／原案／修正／MAIN／子案／工程実績の責務・ID・版を分離。既存保存とAPI互換を保持。REAL/ESTIMATE/MOCK/未実装の意味を統一。 |
| 2 | 現在写真・解析入力の標準化 | 1 | 元画像・品質・方向・校正状態を解析に渡す。iPhone/iPadで撮影→保存を検証。品質未評価を良好と断定しない。 |
| 3 | 実Hair／Face分析の接続 | 1–2 | 写真の変化に応じた結果、モデル版・根拠・信頼度を保存。本人の顔を変形せず、測定不能項目はnull。 |
| 4 | 骨格→AI DESIGN PLANNING→A〜E条件 | 1・3、既存STYLE/COLOR | 生の骨格値・毛髪・形・確定色が計画入力になる。5案が固定ではなく条件で変わり、視覚意図と構造化パラメータを持つ。 |
| 5 | MAIN DESIGNの実生成確認 | 1・4、API接続設定 | 本人＋STYLEの形＋調整COLORの色＋設計条件が生成へ到達。出力・本人維持を確認し、親画像として保存。既存単枚APIは無断置換しない。 |
| 6 | MAIN→A〜Eの一括親子生成 | 4–5 | 1操作で親と5子案を取得。共通STYLE/COLORを保持し、案別の進行・失敗・再試行と親IDを記録。 |
| 7 | RESULT・選択後編集・長さ比較 | 5–6 | シミュレーションを初期表示、iPad横で実写5案比較→採用→選択案だけ微調整。長さ5種類も本人画像・条件履歴で比較。 |
| 8 | 施術記録の不足部分を接続 | 1・5–7 | 生成案／選択／編集、工程別Actual UnderとAfter、提案からの変更を別保存。実施前データを実績と混同しない。 |
| 9 | メーカー・検証済み実績の定量データ整備 | 1–3・8 | 色剤の版別特性、OX表示と濃度根拠、公式混合条件、ベース別発色・到達アンダーを出所付きで保持。不足をAIで埋めない。 |
| 10 | REQUIRED UNDER→ROUTE→PRE-LIFT→ON COLOR | 3・9 | 毛髪／履歴／部位／OXを使用し、仕上がりLvと必要ベースを分離。予測UNDERが実際に配合探索へ影響する。未検証のLvや回数を断定しない。 |
| 11 | EMPIRICAL CORRECTION／学習評価 | 8–10と十分な実績 | 品質・出所・予測・実測差を持つ学習データ、分離した検証、補正モデルの版管理。メーカー情報を上書きしない。 |

生成系の1–7とカラー計算用のデータ整備は、共通契約を決めた後に別の実装単位として扱える。まずは **1のデータ契約・状態台帳** を最初の候補とする。これは既存機能を維持しつつ、後続の接続を検証可能にするため。

**監査はここで終了。次の実装フェーズの指定を受けるまで、修正・接続・一括実装へ進まない。**
