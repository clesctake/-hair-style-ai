COLOR FUTURE AI

MASTER SPECIFICATION v1.1

ADDENDUM — Customer Takeaway / Next Visit / Product Recommendation

MASTER SPECIFICATION v1.0を維持したまま、以下をv1.1追加仕様として正式に追記してください。

この追加仕様は今後の正式要件ですが、今回のPhase 3で本実装しないでください。

Phase 3の主目的は引き続き、

Face / Bone Analysis → Design Planning → 前髪・顔周りA〜E設計

です。

今回追加するv1.1項目は、将来の拡張を見越してデータモデル・依存関係・UI構造だけを正式仕様に加えてください。

⸻

1. Customer Takeaway

最終的にお客様へ渡せる、CustomerTakeawayを正式モジュールとして追加します。

目的：今回の仕上がりだけでなく、次回来店までの提案をお客様へ持ち帰ってもらうこと。

⸻

2. CustomerTakeawayに含める内容

最低限、以下を扱える構造にします。

CURRENT RESULT

* 今回の最終デザイン
* 今回のカラー
* 今回選択した前髪・顔周り
* 仕上がりポイント

NEXT COLOR OPTIONS

* 同程度の明るさで可能な次回カラー5案

NEXT BANG / FACE FRAME OPTIONS

* 前髪・顔周りの次回候補

MAKEUP SUGGESTIONS

* 今回の髪色に対するメイク色の見え方比較

PRODUCT RECOMMENDATIONS

* ホームケア
* スタイリング
* 店販商品

⸻

3. NEXT COLOR OPTIONS

次回カラー5案は、ランダムな5色ではありません。

今回の仕上がり明度、現在の髪状態、残留色素、必要アンダー、施術履歴、ダメージリスク等を考慮し、現在と同程度の明るさ帯で実現可能性が高い別方向5案を提案する構造にしてください。

例：Beige / Greige / Olive Beige / Lavender Beige / Pink Beige等。ただし固定テンプレートにはしません。

⸻

4. NEXT DESIGN OPTIONS

前髪・顔周りについて、今回選択したデザインとは別に、次回来店時のデザイン候補を保持可能にします。

今回選ばなかったA〜Eをそのまま再利用するだけではなく、次回来店時の髪の長さ・状態に応じて再提案できる構造にしてください。

⸻

5. MAKEUP SUGGESTION

今回のヘアカラーに対して、lip / cheek / eyeそれぞれの色方向を提案可能にします。

MakeupSuggestion：category / colorFamily / visualEffect / reason / priority。

目的は今回の髪色とメイク色の組み合わせによる印象差を見せること。将来的には実写シミュレーション対応も可能な構造にしてください。

⸻

6. ProductCatalog

美容師が事前にサロンの商品を登録できるProductCatalogを正式追加します。

最低限：productId / brand / productName / category / image / price / targetConcerns / features / usageTiming / usageMethod / salonMemo / active。

category：SHAMPOO / TREATMENT / OIL / MILK / MIST / STYLING / SCALP / OTHER。

⸻

7. 商品推薦フロー

商品はAIが勝手に販売対象として確定しません。

HairAnalysis ＋ 施術内容 ＋ Final Design ＋ Color Result

↓ AIが登録商品から候補提示

↓ 美容師が商品を選択

↓ AIがお客様向けおすすめ理由を生成

↓ 美容師が確認・編集

↓ CustomerTakeawayへ追加

⸻

8. Recommendation Reason Generator

商品説明の転載ではなく、今回のお客様の状態と結びついた文章を生成してください。

入力：damage / porosity / hairThickness / color result / treatment / styling goal / selected product features。

出力：recommendationReason / usageAdvice / usageTiming。

例：「今回のカラーの透明感を保ちながら、毛先の乾燥を抑えやすいように、軽めの保湿ミルクを選びました。」

商品特性 × 今回の髪状態 × 今回の仕上がりをつなげます。

⸻

9. 美容師最終判断

商品提案・次回カラー・メイク提案は、AI自動確定ではなく、AI_PROPOSED / STYLIST_SELECTED / STYLIST_EDITEDを分離してください。

⸻

10. CUSTOMER TAKEAWAY UI

最終RESULT画面に将来的に、シミュレーション / AIレシピ / 施術工程 / お持ち帰り提案のタブを持たせます。

お持ち帰り提案：

1. 今回の仕上がり
2. 次回カラー5案
3. 次回前髪・顔周り
4. メイク提案
5. 商品提案
6. 次回来店提案

⸻

11. OUTPUT

将来的にApp表示 / PDF / 画像 / QR / LINE等で共有しやすい形式へ展開可能な構造にしてください。

現時点では共有機能を本実装しません。

⸻

12. Phase 3では実装しない

今回のv1.1追記で、ProductCatalog / CustomerTakeaway / NextColorOptions / MakeupSuggestion / ProductRecommendationを本実装しないでください。

データ構造・将来接続位置・MASTER SPECへの追加のみです。

⸻

MASTER SPEC v1.1 ADDENDUM END
