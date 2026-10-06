# v1.1 future extension architecture

この文書は接続設計。商品登録・推薦・共有・お持ち帰りUIはUNIMPLEMENTED。

`src/lib/takeaway-contract.ts`に将来の型契約のみを追加。DiagnosisSession.customerTakeawayはoptionalで、既存カルテを増殖・初期化しない。商品台帳はサロン単位で管理し、Takeawayには商品ID・台帳revisionと商品スナップショットを紐づける。

| モジュール | 将来の入力 | 判断・出力 |
|---|---|---|
| NextColorOptions | 実施後カラー、明度、毛髪、残留、必要UNDER、履歴、リスク | 同程度の明るさで可能性を評価した5方向。固定5色は禁止 |
| NextDesignOptions | 次回の長さ/状態、今回の採用デザイン | 次回来店条件で再評価。今回の不採用案の単純コピーはしない |
| MakeupSuggestion | 今回のカラー | lip/cheek/eyeの色方向・視覚効果・理由。将来実写比較 |
| ProductRecommendation | HairAnalysis、施術、Final Design、Color Result、登録台帳 | 候補→美容師選択→状態に沿う理由/使用法→美容師確認・編集 |
| CustomerTakeaway | 上記、実施結果、最終デザイン、次回来店提案 | お客様へ渡す内容をまとめる。自動販売確定しない |

AI_PROPOSED / STYLIST_SELECTED / STYLIST_EDITEDに対応する独立レイヤーを保持。推薦理由は転載でなく「商品特性×今回の状態×仕上がり」から将来生成。未知の実施後色・リスク・必要UNDERを現在の仮値で埋めない。

## 将来のUI構造

RESULTの既存シミュレーション / AIレシピ / 施術工程に「お持ち帰り提案」を追加する位置を予約。今回ライブUIにタブは追加しない。

順序：今回の仕上がり → 次回カラー5案 → 次回前髪/顔周り → メイク → 商品 → 次回来店。写真中心の余白・高級サロンUIを保つ。専門値は詳細へ。

App/PDF/画像/QR/LINE_READYの出力契約は用意するが、アセット・URL・共有機能は未作成。施術結果・実現可能性評価・商品台帳・美容師承認・安全な共有の順で将来接続する。

## Phase 4再構築で追加した参照位置

CustomerTakeaway/TakeawayInputReferencesにoptionalのgenerationReferences契約を追加。MAIN生成イベントID、採用生成イベントID、画像ID一覧を同じDiagnosisSessionのrevisionから参照可能にする。現在の実データはDiagnosisSession.hairSimulation.events/generatedAssets/selectionsに保存する。CustomerTakeawayのUI/共有/商品推薦はUNIMPLEMENTEDのまま、本実装は追加していない。旧契約の読み込みを壊さないoptional差分。
