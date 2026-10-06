# PHASE_4_GITHUB_RECOVERY_REPORT

2026-10-05。復旧・ローカル検証完了。GitHub保存は連携側403で未完了。mainは変更していない。

## 保持と復旧

正常なPhase 3原本216ファイル・全CRCとSHA-256 d350d5117e43c55525ec1a829090c79483a0ca87538415eca4baa5d84d2eccdaを再確認。全216パス保持、保護対象20ファイルはバイト一致。MASTER v1.1、FIOLE、解析モデル、Phase 1〜3、AI原本/美容師修正、独立STYLE/COLOR、DesignPlan、旧カルテ、将来v1.1契約を維持。

この原本だけから再構築した完全ZIP248ファイル・全CRC、SHA-256 d57808e86b8c409c74403b139354ec012de2a5371dbb4771277577fc39dfffd4を再取得して展開。残存125ファイルは使用していない。

本人元画像+STYLE形状+確定COLOR+Hair/Face+Phase 3 DesignPlan→MAIN→保存MAINからIMAGE_EDITでA〜E→比較→採用→1案編集/再生成→同一DiagnosisSession履歴を復旧。部分失敗/個別再試行/STALE/旧画像保存、snapshot/親SHA/元画像を保持。旧ソースのバイト完全一致は保証しない。

## ファイル

主要Phase 4追加10ファイルは再構築報告と同じ: hair-simulation-types/context/session/validation/instructions/api/client/pipeline、hair-simulation-panel、journey-storage-codec。変更API/session/adapter/generation-contract/journey-store/FeatureRegistry/counseling/home/design/resultの詳細はPHASE_4_RECONSTRUCTION_REPORT.md。

今回の補助追加: ESLint設定、Codespaces devcontainer、自動起動script、VS Codeタスク、本報告。今回の補助変更: package/lock（lint用開発依存のみ、Node24要件）、gitignore（実行ログ除外）、README、photo-analysis-mathの値import重複1か所の整理。既存ファイル削除0。

## 検証

- npm run lint: PASS。型import分離は設定で許可、重複値importのみ整理。
- npm test: PASS、153件/失敗0。
- npm run typecheck / npm run build: PASS。
- Phase 3実モデル/実UI: PASS、4方向、Worker CPU、実髪領域/ランドマーク、設計5方向、補正優先、実IndexedDB、旧版保持/再読込。
- Phase 4実UI/実IndexedDB: PASS、明示MOCK通信8件、MAIN+5案、D部分失敗→個別再試行、B修正→1案再生成、選択/再読込/STALE。外部画像生成0。
- 1194/1024幅で5案比較、390幅で横はみ出しなし。実iPad/iPhoneではない。
- Codespaces起動script/API GET: ローカルLinuxでPASS、configured=false/PARTIAL。実Codespacesは未検証。

## 状態・未解決

REAL: 契約・元画像解決・親子ジョブ・保存・比較/採用・再試行経路。ESTIMATE/PARTIAL: 実モデルの2D画像観測、未校正の設計ルール。MOCK: 通信検証画像。PARTIAL: MAIN/A〜Eの実API・本人維持・画質、実生成0枚。UNIMPLEMENTED: UNDER/LIFT/PRE-LIFT/FIOLE最適化/長さ実写/CustomerTakeaway本実装。

実Safari/カメラ、HEIC、生成PNGを多数保存する容量、永続ジョブ/複数端末は未検証または未解決。既知の容量課題を解決済みにしない。

GitHubのcreate_blobは小さな文字列でも403 Resource not accessible by integration。同じ接続による書き込み権限問題であり、テストや転送サイズだけでは解消しない。GitHubコミット/対象ref更新は実施していない。mainと対象branchの再照合HEADはともにc38d79a0a7a0f09a457eb28b6b49f7046a6fed03。権限確認後、対象branch/HEAD再確認、force=falseで対象refのみ更新する予定。mainへpush/mergeしない。

秘密キー/実行ログ/node_modules/.nextはコミット対象外。.env.exampleは空欄だけ。Phase 4.1/Phase 5は停止。GitHub保存の再開には連携側の書き込み権限確認が必要。
