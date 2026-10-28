<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## COLOR FUTURE AI の仕様と変更ルール

最新版のユーザー指示と MASTER SPECIFICATION v1.1（v1.0 + ADDENDUM）に基づく開発ルール。

- 「COLOR FUTURE AI マスター仕様」を Single Source of Truth とする。過去の個別指示と矛盾する場合は、ユーザーが指定した最新マスター仕様を優先する。
- 着手前に、参照したマスター仕様の版・更新日時・所在を確認する。更新時は仕様差分と実装差分を対応させる。過去の会話・実装報告・別名称のマスター資料を、無断で正式仕様に昇格させない。
- 既存機能・データを無断で削除せず、追加・変更は差分実装する。仕様変更が削除を伴う場合は、削除の明示的な指示があるか確認し、不明なら削除せず確認を求める。
- 実装後は追加・変更点、既存機能への影響、確認した動作と未検証の範囲を報告する。各機能・計算結果を次の区分で明示する。
  - REAL：実際に動作している機能・処理。検証環境と確認範囲を併記する。実装コードがあるだけで実接続済み・実機検証済みとはしない。
  - ESTIMATE：AI推定として実際に動作している機能。手動の未校正色サンプルや固定試算をAI解析として扱わない。根拠・前提・限界を示す。
  - MOCK：固定サンプル値・デモ用表示等。実画像解析や施術実績として扱わない。
  - PARTIAL：一部のみ動作する機能。動作部分と未接続部分を明記する。
  - UNIMPLEMENTED（未実装）：処理・解析・接続が存在しないもの。導線や画面のみの場合はその範囲を明記する。
- 実装済みだが外部APIや実機で未検証のものは、その旨を別途記す。未実装との区別を保つ。メーカー情報等のデータ出典・信頼区分も引き続き保持する。

### 正式な仕様と監査基準

- Single Source of Truth: [COLOR_FUTURE_AI_MASTER_SPEC_v1.1.md](docs/specs/COLOR_FUTURE_AI_MASTER_SPEC_v1.1.md)。v1.0正式本文を維持し、ユーザー指定のv1.1追加仕様を追記。旧v1.0原本は変更しない。
- 参照した正式原本：v1.0更新2026-10-03T14:55:25.262270Z、Phase 1報告2026-10-04T01:38:02.821009Z、Phase 2報告2026-10-04T04:27:21.004254Z。GAP REPORTは初期監査資料。
- Phase 3実装時に承認された範囲：[IMPLEMENTATION PHASE 3](docs/specs/IMPLEMENTATION_PHASE_3.md)。実効顔/骨格値→デザイン試案5方向、根拠追跡、修正・採用・保存、将来生成契約を接続。
- v1.1のお持ち帰り、商品台帳、次回カラー、メイク、商品推薦は型契約・依存関係・将来UI設計のみ。本実装しない。
- Phase 3ではMAIN・本人実写A〜E・長さ画像生成、必要UNDER本計算、FIOLE最適配合、学習、課金、ログインへ進まない。既存generate APIを作り直さない。
- Phase 3完了後はPHASE_3_IMPLEMENTATION_REPORTを提出し、ユーザーの確認を待つ。自動でPhase 4へ進まない。
- 未知の数値はnull。SourceTypeとFeatureStateを別概念として保持する。AI原本と美容師補正、STYLEとCOLOR、提案処方と実施処方、メーカー情報と経験補正を混同しない。
- 旧保存データは削除・初期化しない。共通モデルは同じカルテID・保存版へ追加し、旧データ版はadapterで読み込む。未対応の将来版は書換えず明示的に拒否する。

### 現在の承認範囲：Phase 4再構築

- 正常なPhase 3 ZIP（216ファイル、SHA-256 d350d5117e43c55525ec1a829090c79483a0ca87538415eca4baa5d84d2eccda）だけをコードの復旧元とする。残存125ファイルを利用・マージしない。
- 元の [PHASE_4_IMPLEMENTATION_REPORT](docs/PHASE_4_IMPLEMENTATION_REPORT.md)、ユーザー指示を再収録した [IMPLEMENTATION_PHASE_4](docs/specs/IMPLEMENTATION_PHASE_4.md)、MASTER v1.1を根拠とする。MASTERとPhase 1〜3報告は書き換えない。
- MAIN→保存したMAINからIMAGE_EDITでA〜E、比較・採用・1案編集・再生成・履歴保存・契約検証を差分追加する。実API未検証はPARTIAL。通信テスト画像はMOCK_TRANSPORT_FIXTURE。
- 今回は実画像生成を行わない。Phase 4.1、Phase 5は停止。必要UNDER、LIFT、PRE-LIFT、FIOLE最適配合、CustomerTakeaway等の本実装へ進まない。
- APIキーを環境変数以外へ含めない。完全ZIPは中央ディレクトリ/EOCD/全CRC/試験展開/再オープン/展開数を検証する。
- 再構築報告を提出し、ユーザーの確認を待つ。旧コードのバイト単位の完全一致とは主張しない。

### 現在の承認範囲：Page 1 生成機能の追加

- 唯一のVisual Masterは docs/visual-master/20261008-final/COUNSELING_VISUAL_MASTER.png。7カードの位置・外寸・余白は維持。今回ユーザーが許可した変更はCOLORカード内部を1枚入力へ変更すること。
- CURRENT本人＋STYLE形＋確定COLOR色を共通にMAIN→IMAGE_EDITでA〜E。承認済みA前髪あり/Bシースルー/Cセンター/D顔周りレイヤー/Eワイドの違いを美容師指定として保持。Phase 3 AI原本は変更しない。
- Page 1への接続・採用・最終表示・保存まで差分実装。APIキーが設定されていない場合は実生成不可と明示し、MOCK/未生成をREAL扱いしない。実生成品質は別の未検証状態を維持。
- GitHubのmainへ変更・push・mergeしない。既存の非公開デモの保存先はGitHubとは別のSiteソースリポジトリ。Page 2/3、Phase 5は変更しない。

### 最新の承認範囲：Page 2 PRO DESIGN（旧Page 2停止条件に対する差分）

- 今回のユーザー指示によりPage 2だけ実装を許可。[Page 2 v1.0](docs/specs/IMPLEMENTATION_PAGE_2_PRO_DESIGN_v1.0.md)を機能基準とする。
- デザインは `docs/visual-master/APPROVED_THREE_PAGES.png` の中央ページだけ。新規カードや独自の配置を追加しない。Page 1のCSSと表示は変更しない。必要なPage 1 CTAのデータ引継ぎ・遷移だけ接続する。
- TARGET／レシピ3方針／次回カラー3案／AFTERCARE／美容師メッセージ。旧前処理カードは今回指示のAFTERCAREへ同じ配置で対応。Page 3はデータ契約と確定スナップショットのみ。
- 登録FIOLEの図上構成候補検索はPARTIAL。必要UNDER・リフト・発色・最適配合・再現度を捏造せずnull。キー未設定時のAI補完・AI文章生成は未接続として表示する。
- 既存分析・画像API・FIOLE・旧保存データを削除しない。GitHub clesctake/-hair-style-ai のmainにpush・merge・変更しない。承認までPage 3 UIとPhase 5へ進まない。

### 最新の承認範囲：Page 3 AFTER SUPPORT

- ユーザー指定の最新差分 [Page 3 v1.0](docs/specs/IMPLEMENTATION_PAGE_3_AFTER_SUPPORT_v1.0.md) を優先する。過去のPage 3停止条件は今回の承認で解除。化学エンジン・PHOTO LAB・SYSTEM MANAGEMENTは対象外。
- 唯一の正本は `docs/visual-master/page3/AFTER_SUPPORT_VISUAL_MASTER.jpeg`（1024×1536）。10カードの構成・順番・比率を保持。Page 1/2のCSSと写真配置は変更しない。Page 2 CTAの遷移だけ接続。
- Page 2の確定handoffを参照し、Page 1の確定本人画像/過去A〜Eを再利用。未生成角度と未知値は捏造しない。サンプル写真はMOCK、未登録商品を推薦しない。
- 新規画像はDISPLAY_ONLY/learningImageStorage=false。AI学習用画像DB、PDF/QR/LINE出力、商品台帳管理は構築しない。APIキーはサーバー環境変数のみ。実生成未検証をREALとして報告しない。
- GitHubのmainを変更しない。private Siteのソース保存先は元のGitHubとは別。
