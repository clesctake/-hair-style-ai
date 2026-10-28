# IMPLEMENTATION PHASE 3 — Face / Bone Analysis → Design Planning

正式基準：MASTER v1.0 + v1.1 ADDENDUM、GAP REPORT、Phase 1/2 IMPLEMENTATION REPORT。ユーザーが2026-10-04の作業で承認した範囲。

目的は取得済みの本人の顔表面比率を前髪・顔周りA〜Eの設計へ接続すること。

1. Stylist Correction → active AI Estimate → null の実効値を使用し、AI原本を変更しない。
2. 未取得の額・生え際・頭頂・ハチ・後頭部・3D骨格を補完しない。
3. 毛髪・現在の長さ/毛量/前髪/顔周り/毛流れ・STYLE・仕上げ方向を既知値だけ使用。
4. 固定MOCK A〜Eを保持し、正式設計結果と分離。本人の分析値で5方向を設計する。
5. 10の前髪/顔周りパラメータ、視覚効果、rationale、basedOnMetrics、実使用値/出所を保持。
6. valuesWereUsedは真に使用した観測値だけを根拠にする。
7. confidence / missingInputs / needsStylistConfirmationを保持。似合う絶対判定は行わない。
8. AI提案・美容師編集中・保存済み補正・採用/未採用を分離。
9. STEP 03 STYLEに5案・簡易構造プレビュー・パラメータ・根拠・美容師調整を置く。
10. 簡易図はDESIGN STRUCTURE PREVIEWと明記。最終RESULTの本人実写の代替にしない。
11. generation-contractへselectedDesign / styleTarget / colorTarget / faceBoneAnalysis / hairAnalysisを渡す。
12. 将来MAIN→A〜EにparentDesignId / variantType / designParameters / generationSeedMetadata / sourceAnalysisIdsを渡せる構造。
13. FeatureRegistryは接続・推定試案・実写画像生成を分離して更新。
14. 実入力・補正優先・null・5方向差・根拠一致・valuesWereUsed・不確実性・修正/採用保存・STYLE結合・生成契約のテストを追加。
15. テスト、型検査、本番ビルドを通しPHASE_3_IMPLEMENTATION_REPORTを提出する。

今回は本人実写A〜E、MAIN/長さ画像生成、Required Under本計算、FIOLE最適化、学習、課金、ログインへ進まない。v1.1のお持ち帰り/商品等は将来契約と依存関係・UI設計のみ。

Phase 3完了後、ユーザーの確認なしにPhase 4へ進まない。
