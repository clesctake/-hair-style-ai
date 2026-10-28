# COLOR FUTURE AI — IMPLEMENTATION PHASE 4

## 出典と再収録の範囲

ユーザーがこの会話で提示した「IMPLEMENTATION PHASE 4 — MAIN DESIGN + Realistic A–E Hair Simulation」を、再構築用の契約として再収録した文書。旧ファイルが見つかったという意味ではない。正式マスターはMASTER SPEC v1.1。原Phase 4実装報告は `docs/PHASE_4_IMPLEMENTATION_REPORT.md` に変更せず保存。

今回の最新指示により、実API生成の必須検証はPhase 4.1へ保留。今回はPhase 3 ZIPからコード/UI/契約/保存/テストを再構築し、PARTIALを維持する。Phase 5は停止。

## 1〜3. 生成フロー・MAIN入力

CURRENT本人元画像＋独立STYLE＋確定COLOR＋Hair/FaceのAI原本と美容師補正＋Phase 3 DesignPlan → MAIN1枚 → MAINを親としてA〜E5枚。generation-contractを既存生成APIへ接続。STYLEの長さ/シルエット/レイヤー/ウェイト/ボリューム/毛先/分け目/毛流れ/スタイリング、COLORの確定プレビューと7調整値、実効前髪・顔周りを渡す。

## 4〜7. 役割分離と本人維持

STYLEは髪型の形だけ、COLORは髪色だけ。参考写真の人物をコピーしない。本人の顔/目/鼻/口/顎/輪郭/表情/年齢感/肌/ポーズ/頭の向き/アングル/背景/服装/構図を可能な限り維持。顔分析は髪を設計するために使用し、本人の顔を変形しない。A〜Eは主に前髪/幅/密度/分け目/毛流れ/サイドバング/顔周りを変える。

## 8〜11. 親子とseed

ChildはparentDesignId、parentGenerationId、requestId、variantType、designParameters、sourceAnalysisIds、generatedImage、generationStatus、retryCount、createdAtを追跡。保存済みMAIN画像を実際の編集入力へ渡すIMAGE_EDITを優先。画像親を使えない場合だけLOGICAL_PARENTを区別。今回の再構築はIMAGE_EDIT。APIが返さないseedはnull。

## 12〜15. 生成指示と共通条件

Preserve identity/face/expression/background/pose/camera angle、Modify hair only。自然な生え際、毛流れ、密度、根元、ハイライト/影、ウィッグ状にならないこと。確定COLORを最終画像にも反映し、全Childで同じ髪色と基本STYLEを固定する。既に適用済みのプレビューへスライダー補正を二重適用しない。

## 16〜19. 初回一括生成と例外再試行

最初は1操作でMAIN→A〜E。生成中の案を簡潔に表示。Child部分失敗時は成功画像を残し、失敗案だけ再試行。MAIN失敗時は子を送らない。結果確認後は個別再生成を可能にする。

## 20〜26. RESULTと編集

MAINの本人実写イメージを大きく配置。A〜Eは実写比較を主役とし、iPad横画面で5案を一画面で比較。図はDESIGN STRUCTURE PREVIEWとして別階層へ残す。各案に名称/視覚効果/短い説明。選択をDiagnosisSessionへ保存し、その案だけ長さ/幅/密度/分け目/顔周りを美容師が修正・再生成。AI原案と補正を別保存。

## 27〜33. 保存・履歴・検証・状態

画像参照、生成入力snapshot、日時、provider/model、requestId、親関係、選択、DesignPlan/STYLE/COLOR根拠を同じDiagnosisSessionへ保存。旧画像は削除せず、入力が変わればSTALEとして保持。A〜EのDesignPlan IDと送信パラメータを追跡。本人/背景/色/5案の差を人が確認できる構造。API成功と美容師用途の品質合格は別。状態NOT_STARTED/QUEUED/GENERATING/COMPLETE/FAILED/STALE。実API画像だけREAL_API、通信テスト画像はMOCK。

## 34〜40. 既存API・秘密情報・範囲

既存 `/api/generate` とHAIR MIRRORを再利用し、旧単枚生成は正式A〜Eとして扱わない。環境変数方式を維持し秘密情報をコード/ZIP/ログ/報告へ含めない。初回一括、失敗案のみ再試行、選択編集1案のみ再生成。送信ジョブ数とusageを記録。長さ5種の構造は維持し、前髪5案を優先。アイボリー/ベージュ/ゴールド・写真中心・iPad優先のUIを維持。CustomerTakeaway/ProductCatalog/次回カラー/メイク/商品推薦は本実装しないが、MAIN/採用案/生成画像を将来契約から参照可能にする。

## 41〜43. 検証

契約→API、MAIN生成/保存、子5案/親画像、共通STYLE/COLOR、異なる設計パラメータ、選択、部分失敗/個別再試行、STALE、snapshot、MOCK/REAL区別、旧履歴、API回復、補正1案を検証。MAIN+A〜Eの比較出力を用意し、自動評価値だけで画質完成としない。APIキーがない場合は実生成未検証と報告する。今回の復旧指示に従い実生成は行わない。

## 44〜46. 完了報告と停止

契約/API経路/UI/保存の復旧と、実画像6枚の品質検証は区別する。実生成成功なしに本人実写生成の最終完了としない。原Phase 4報告と対応する再構築報告にprovider/model、親派生、本人/STYLE/COLOR/DesignPlan維持方法、実生成枚数/失敗/再試行、機能状態、実機、コスト記録、保存構造、未解決事項を明記。Phase 4.1、Phase 5へはユーザー確認なしで進まない。
