COLOR FUTURE AI

MASTER SPECIFICATION v1.0

Single Source of Truth

この文書を今後の「COLOR FUTURE AI / HAIR DESIGN LAB」開発における唯一の最新仕様書（Single Source of Truth）とします。

過去の個別指示・試作・デモと本仕様が矛盾する場合は、本仕様を優先してください。

ただし、既存実装・既存データ・既存APIを独自判断で削除しないでください。

今回まず行うのは現実装との差分監査です。

この仕様書を受け取った直後に全機能を一括実装しないでください。

⸻

1. PRODUCT VISION

COLOR FUTURE AIは、単なるヘアカラーシミュレーターではありません。

美容師がお客様とiPadを見ながら、

現在の状態を診断
→ なりたい髪型・髪色を設定
→ 顔・骨格を考慮したヘアデザインを提案
→ 本人写真で完成イメージを確認
→ 実際の施術方法・薬剤レシピまで算出

できる美容師向けAIカウンセリングシステムを目指します。

最終的な思想は、

「見た目の提案」と「実際に美容室で再現するための技術設計」をつなぐこと

です。

⸻

2. UI DESIGN — 正式基準

以前指定した「COLOR FUTURE AI / HAIR DESIGN LAB」の参考画像を正式なUIデザイン基準とします。

基本デザイン：

* アイボリー / オフホワイト
* ホワイトカード
* ゴールド / キャメル / ベージュ系アクセント
* ダークブラウン〜ブラック文字
* 大きな余白
* 細い罫線
* 控えめなシャドウ
* 上質な写真
* 高級サロン向け
* iPad横画面最優先

業務管理システム・複雑なAIダッシュボードのようにしないでください。

内部ロジックが高度になっても、表面UIはシンプルに保ちます。

⸻

3. TOP LEVEL UX

ユーザーに見せるメインフローは4STEPに統一します。

STEP 01

現在の髪を撮影

STEP 02

AI診断を確認

STEP 03

なりたい色・スタイルを選ぶ

STEP 04

シミュレーションとレシピを見る

機能が増えても、トップレベルのSTEP数をむやみに増やさないでください。

⸻

4. STEP 01 — CURRENT PHOTO

現在の髪を規格撮影します。

基本4方向：

* FRONT
* RIGHT
* LEFT
* BACK

入力方法：

* カメラ撮影
* 写真ライブラリ

iPhone / iPadのカメラを優先します。

撮影ガイド

半透明ガイドを表示：

* 頭頂
* 顎
* 左右幅
* センターライン
* 肩位置

「1/4 正面」など現在の撮影方向を表示。

撮影後：

この写真を使う

撮り直す

を選択可能にします。

⸻

5. PHOTO QUALITY ANALYSIS

写真がカラー・骨格分析に使用できる状態か判定します。

評価項目：

* 逆光
* 明るすぎる
* 暗すぎる
* 白飛び
* 黒つぶれ
* ピンぼけ
* 手ブレ
* 光のムラ
* 強い反射
* 色かぶり
* 頭部位置
* 撮影距離
* 頭・髪の見切れ
* レンズ汚れ / 曇りの可能性

状態：

GOOD

CAUTION

NG

必要に応じて0〜100のQuality Scoreを保持。

ただし美容師による強制続行を可能にします。

警告を大量に出さず、優先度の高い1〜2件を表示してください。

⸻

6. STEP 02 — HAIR ANALYSIS

AIが現在毛を解析します。

主な診断：

* Base Level
* Under Level
* Under Tone
* 明度
* 色相
* 彩度
* 赤残留
* オレンジ残留
* 黄残留
* 色ムラ
* ダメージ
* ポロシティ
* 毛髪太さ
* 白髪率
* 根元 / 中間 / 毛先差

履歴：

* カラー
* 暗染め
* 黒染め
* ブリーチ
* ライトナー
* 縮毛矯正
* 酸性ストレート
* パーマ等

AI推定値と美容師修正値は別々に保存してください。

⸻

7. ROOT / MID / END

髪全体を一つの平均値だけで処理しないでください。

最低でも、

ROOT

MID

END

を独立して扱えるデータ構造にします。

例：

根元＝バージン毛
中間＝カラー毛
毛先＝ブリーチ毛

の場合、それぞれ別条件として扱います。

⸻

8. FACE / BONE STRUCTURE ANALYSIS

顔・骨格分析を実施します。

単純な、

* 丸顔
* 面長
* 四角

などのカテゴリ分類だけに依存しません。

可能な範囲で比率・位置情報として扱います。

例：

* face_width_ratio
* face_height_ratio
* forehead_height_ratio
* forehead_width_ratio
* midface_ratio
* lower_face_ratio
* cheekbone_position
* cheekbone_width_ratio
* jaw_width_ratio
* chin_position
* brow_position
* eye_position
* brow_eye_distance
* hairline_position
* facial_balance

将来的には、

* 頭頂
* ハチ
* 側頭部
* 後頭部
* 頭部縦横比
* 頭部前後形状

にも拡張可能な構造にします。

⸻

9. 骨格分析は表示だけではない

最重要仕様です。

FACE / BONE STRUCTURE ANALYSISは診断結果を表示するだけではありません。

実際のヘアデザイン生成条件として使用します。

基本：

CURRENT PHOTO

↓

FACE / BONE ANALYSIS

↓

DESIGN PLANNING

↓

BANG / FACE FRAME PARAMETERS

↓

HAIR SIMULATION

とします。

骨格分析は、

本人の顔をAIで変形するためには使用しません。

本人の顔は維持し、

髪をどのようにデザインするか

を決定するために使用します。

⸻

10. STEP 03 — STYLE / COLOR

「なりたいスタイル」を1枚の画像だけで処理しません。

完全に、

STYLE

なりたい髪型

と

COLOR

なりたい髪色

を分離してください。

異なる人物の写真でも使用可能です。

⸻

11. STYLE REFERENCE

STYLE画像から使用する情報：

* Length
* Silhouette
* Layer
* Weight
* Volume
* Ends
* Bang
* Face framing
* Part
* Hair flow
* Styling

STYLE画像の人物や顔は使用しません。

またSTYLE画像の髪色を最終COLORとして勝手に使用しないでください。

⸻

12. COLOR REFERENCE

COLOR画像から使用する情報：

* Lightness
* Hue
* Chroma
* Red
* Yellow
* Blue
* Violet
* Mutedness
* Beige
* Transparency
* Warm / Cool

COLOR画像の髪型は使用しません。

可能な限り髪領域のみを解析します。

将来的には、

* ROOT
* MID
* END
* Highlight
* Lowlight

も分離可能にします。

⸻

13. LIVE COLOR ADJUSTMENT

COLOR参考画像を登録した後、美容師がリアルタイムで調整できます。

主要パラメータ：

* 明るさ
* 彩度
* 赤み
* 黄み
* くすみ
* ベージュ
* 透明感

将来的に、

* Ash
* Olive
* Violet等

を追加可能。

調整中は毎回AI画像生成を行わず、フロントエンド上の軽量プレビューを使用してください。

確定後、

この色味で確定

高精度シミュレーションを見る

レシピを計算する

へ接続します。

⸻

14. COLOR DATA ARCHITECTURE

色データをHEXだけで処理しません。

役割を分離します。

RGB / HEX

表示・UI・保存

CIELAB / LCh

現在色と目標色の知覚的差分計算

FIOLE DYE VECTOR

FIOLE薬剤選択・染料方向

基本：

PHOTO

↓

撮影条件補正

↓

HAIR SEGMENTATION

↓

RGB / HEX

↓

Lab / LCh

↓

CURRENT ⇄ TARGET DIFFERENCE

↓

REQUIRED PIGMENT DIRECTION

↓

FIOLE DYE COMPOSITION

↓

毛髪履歴・UNDER・ポロシティ補正

↓

RECIPE

とします。

HEX → FIOLEレシピへ直接変換しないでください。

⸻

15. FIOLE DATABASE

既存のFIOLEデータベースは保持してください。

対象：

* FIOLE BL
* QUALUCIA
* RADICE等、今後正式に採用されたFIOLEデータ

メーカー独自の色素構成軸を保持します。

メーカー資料の色素構成図をRGBへ単純変換しないでください。

またメーカー資料の視覚バーを、

実際の化学的染料濃度

として扱わないでください。

不明値はUNKNOWN / NULLとします。

⸻

16. HAIR COLOR CHEMISTRY MODEL

カラー計算を、

現在色＋足す色＝仕上がり

という単純モデルにしません。

酸化染毛を、

LIFT

＋

DEPOSIT

として扱います。

概念：

CURRENT HAIR

↓

MELANIN LIFT

↓

PREDICTED UNDER

↓

DYE OXIDATION / DEPOSIT

↓

PREDICTED FINAL COLOR

とします。

⸻

17. 1剤 / 2剤を分離

1剤

* Dye composition
* Set level
* Alkaline characteristics
* Lift characteristics
* Deposit characteristics

2剤

* H₂O₂ concentration
* Mixing ratio
* Lift effect
* Hair-condition impact

を独立データとして扱います。

⸻

18. REQUIRED UNDER CALCULATOR

最終目標色から、

どのアンダーまでベースを作る必要があるか

を逆算するエンジンを設計します。

重要：

TARGET FINISH LEVEL ≠ REQUIRED UNDER LEVEL

です。

必要アンダーは、

UNDER LEVEL

＋

UNDER TONE

として扱います。

⸻

19. NATURAL MELANIN / ARTIFICIAL PIGMENT

同じ7Lvでも、

7Lv virgin

と

7Lv dark-dyed

を同じ状態として扱わないでください。

最低でも、

NATURAL MELANIN

と

ARTIFICIAL PIGMENT RESIDUE

を分離します。

⸻

20. LIFT ROUTE CALCULATOR

CURRENT → REQUIRED UNDERから施術ルートを判定します。

候補：

* ONE COLOR
* HIGH LIFT COLOR
* LIGHTENER
* BLEACH ×1
* BLEACH ×2+
* HIGH RISK / STYLIST JUDGMENT

メーカー・実測データがない正確なリフト数を勝手に作らないでください。

⸻

21. PRE-LIFT PREDICTION

PRE-LIFT後の状態を予測します。

出力例：

* predicted_under_level
* predicted_under_tone
* predicted_residual_red
* predicted_residual_orange
* predicted_residual_yellow
* predicted_artificial_pigment

この予測UNDERをON COLOR計算へ渡します。

⸻

22. ON COLOR CALCULATION

基本モデル：

PREDICTED UNDER

＋

DEPOSITED DYE VECTOR

↓

PREDICTED FINAL COLOR

↓

TARGETとの差分

↓

RE-OPTIMIZE

↓

FIOLE RECIPE

とします。

⸻

23. DOUBLE COLOR

ダブルカラーは1つの施術として潰さず、

STEP 1 — PRE-LIFT

* Drug
* OX
* Mixing ratio
* Area
* Time
* Starting Level
* Target Under
* Actual Under Level
* Actual Under Tone

STEP 2 — ON COLOR

* FIOLE Drug
* Ratio
* OX
* Mixing Ratio
* Area
* Time
* Before Under
* Target
* After

を別レコードとして保存可能にします。

⸻

24. AI DESIGN PLANNING

毛髪分析・骨格分析・STYLE・COLORを受け取った後、

AI DESIGN PLANNING

を実行します。

入力：

CURRENT PERSON

＋

HAIR ANALYSIS

＋

FACE / BONE ANALYSIS

＋

STYLE REFERENCE

＋

COLOR REFERENCE / ADJUSTED TARGET

から最終デザイン条件を作ります。

⸻

25. MAIN DESIGN

まず1枚、

MAIN DESIGN

を生成します。

MAIN DESIGNは、

本人

＋

STYLE shape

＋

COLOR

を統合した基本完成イメージです。

このMAIN DESIGNを、その後のバリエーション生成の親デザインとして使用します。

⸻

26. 前髪・顔周り5案

前髪・顔周りは、

DESIGN A / B / C / D / E

の5案を生成します。

ただし固定テンプレート5種類を毎回出すのではありません。

骨格分析をもとに、AIが5方向を設計します。

各案は十分に差を持たせます。

⸻

27. BANG / FACE FRAME PARAMETERS

各DESIGNに構造化パラメータを持たせます。

例：

* bang_length
* bang_width
* bang_density
* bang_part
* bang_flow
* side_bang_length
* face_frame_start
* face_frame_length
* face_frame_direction
* face_frame_volume_position

AI提案値と美容師による最終修正値を別保存します。

⸻

28. 骨格分析 → 5案生成

5案は骨格分析を直接使用します。

例として、

* 額の見える面積
* 顔の縦方向の見え方
* 横方向の見え方
* 頬骨位置
* 顔周りの空間
* 下顔面とのつながり
* ボリューム位置

等を考慮します。

ただし、

「似合う / 似合わない」を絶対判定するシステムにはしません。

各案について、

どのような視覚効果を狙ったデザインなのか

を短く説明します。

⸻

29. 前髪5案はイラストではなく実写

非常に重要です。

最終RESULTに表示するA〜Eはイラストではありません。

本人写真を使用したAI実写シミュレーション

にしてください。

イラストは内部説明用として使用しても構いませんが、

完成結果の代替にしないでください。

⸻

30. 5案を一括生成

メインフローでは、

「この前髪を試す」

を5回押させません。

ユーザーは最初に条件設定を行い、

AIシミュレーションを生成

を実行。

その結果としてA〜Eをまとめて取得します。

⸻

31. PARENT → CHILD GENERATION

5案を完全に独立した画像としてゼロから作らない設計を優先します。

基本：

MAIN DESIGN

├ DESIGN A
├ DESIGN B
├ DESIGN C
├ DESIGN D
└ DESIGN E

という親子関係にします。

可能な限り、

* 本人
* 顔
* 表情
* 年齢感
* 背景
* 構図
* 基本STYLE
* COLOR

を共通化。

主に、

前髪＋サイドバング＋顔周り

を変化させます。

⸻

32. PERSON PRESERVATION

HAIR MIRROR生成では、

* 顔
* 目
* 鼻
* 口
* 顎
* 輪郭
* 表情
* 年齢感
* 人物特徴
* ポーズ
* アングル
* 背景

を可能な限り維持します。

髪を中心に編集してください。

骨格分析を使って本人の顔そのものを理想化・変形しないでください。

⸻

33. LENGTH VARIATIONS

長さについて、

* −10cm
* −5cm
* BASE
* ＋5cm
* ＋10cm

のバリエーションを扱えるようにします。

これも最終的には本人実写で比較可能にします。

⸻

34. STEP 04 — RESULT

RESULT画面を、このアプリの最重要画面とします。

お客様が最初に見るものは、

薬剤計算ではなく完成イメージ

です。

⸻

35. RESULT STRUCTURE

基本構成：

MAIN DESIGN

大きな本人実写完成イメージ。

BANG & FACE FRAME

本人実写A〜E。

5案を一括比較可能にします。

iPad横画面では5案を一画面で確認できる比較モードを用意してください。

必要なら、

大きな選択画像
＋
A〜Eサムネイル

も使用可能。

LENGTH VARIATION

−10 / −5 / BASE / ＋5 / ＋10。

COLOR / RECIPE

確定色・施術方法・レシピ。

⸻

36. RESULT TABS

例：

シミュレーション

AIレシピ

施術工程

注意点

デフォルトは、

シミュレーション

です。

⸻

37. RECIPE SIMPLE VIEW

お客様と見る表面UIでは、

CURRENT BASE

↓

REQUIRED UNDER

↓

RECOMMENDED PROCESS

↓

FIOLE RECIPE

程度に簡潔に表示します。

⸻

38. RECIPE PROFESSIONAL VIEW

詳細では、

CURRENT

↓

TARGET

↓

REQUIRED UNDER LEVEL

＋

UNDER TONE

↓

LIFT ROUTE

↓

PRE-LIFT

↓

ON COLOR

↓

1剤

＋

2剤 / OX

↓

FIOLE RECIPE

を確認可能にします。

⸻

39. AFTER DESIGN SELECTION

5案を見た後に美容師が1案を選択します。

その後、

このデザインを編集

から、

* 長く
* 短く
* 薄く
* 厚く
* 幅を狭く
* 幅を広く
* 分け目変更
* 顔周りを長く
* 顔周りを短く

等を微調整可能にします。

生成前に細かい設定を大量入力させないでください。

AI案を見てから微調整するUXを優先します。

⸻

40. BEFORE / AFTER RECORD

施術後、

* Before photos
* AI Hair Analysis
* Stylist Correction
* Face / Bone Analysis
* STYLE Reference
* COLOR Reference
* Adjusted Target Color
* AI Design Proposals
* Selected Design
* AI Recipe
* Actual Recipe
* OX
* Mixing Ratio
* Processing Time
* Actual Under
* After Photos
* Result Evaluation

を保存可能にします。

⸻

41. EMPIRICAL LEARNING

将来的に、

AI予測

と

実際の施術結果

の差を蓄積します。

これにより、

* Lift Prediction
* Required Under
* FIOLE Mixing
* OX
* Processing Time
* Porosity correction
* Residual pigment correction

等を実績データから補正できる構造にします。

メーカー値を上書きせず、

MANUFACTURER DATA

と

EMPIRICAL CORRECTION

を分離してください。

⸻

42. DATA TRUST / SOURCE LABELS

データには出所を持たせます。

最低限：

MANUFACTURER

メーカー公式資料

REFERENCE

教育資料・参考理論

EMPIRICAL

実際の施術結果

AI ESTIMATE

AIによる推定

STYLIST CORRECTED

美容師による修正

MOCK

デモ・仮データ

不明な数値を科学的事実として作らないでください。

⸻

43. REAL / ESTIMATE / MOCK / UNIMPLEMENTED

機能について必ず状態を管理してください。

REAL

実際に接続・動作している

ESTIMATE

AI推定として動作

MOCK

UI・仮データのみ

UNIMPLEMENTED

未実装

画面上でも必要に応じて区別します。

⸻

44. UI COMPLEXITY RULE

内部機能が増えても、

ホーム画面を複雑にしない

ことを最優先します。

専門的な、

* Lab
* LCh
* Dye Vector
* OX calculation
* Under prediction
* Residual pigment
* Face ratios

などは、必要なときに「詳細を見る」から確認できるようにします。

⸻

45. HOME SCREEN

正式ホーム画面は以前指定した参考デザインを基準とします。

左：

COLOR FUTURE AI
HAIR DESIGN LAB

ナビ：

* 新しい診断
* 過去の診断
* 薬剤ライブラリ
* 施術実績

メイン：

4つのステップで、理想のヘアカラーへ。

01 現在の髪を撮影
02 AI診断を確認
03 なりたい色・スタイルを選ぶ
04 シミュレーションとレシピを見る

メインCTA：

＋ 新しいカラー診断を始める

⸻

46. DEVELOPMENT PRINCIPLE

実装のために既存機能を無断削除しないでください。

UIを簡単にする場合は、

機能を削除するのではなく階層化して隠す

ことを優先します。

⸻

47. 今回の最重要ユーザー体験

COLOR FUTURE AIで実現したい体験は、

写真を撮る

↓

AIが髪と顔・骨格を理解する

↓

なりたい髪型と髪色を設定する

↓

AIがその人に合わせてデザインを考える

↓

本人写真で完成イメージを見る

↓

前髪・顔周り5案も一度に比較する

↓

選んだデザインを微調整する

↓

そのデザイン・カラーを実現するための施術工程とFIOLEレシピを見る

です。

「AI機能がたくさん並んでいるアプリ」ではなく、

美容師のカウンセリングから技術設計までが一本につながっているアプリ

にしてください。

⸻

48. v1.0受領後に行う作業

まだ大規模実装を開始しないでください。

まず現在のコード・データ・APIを確認し、このMASTER SPEC v1.0との差分監査を行ってください。

以下の形式で報告してください。

A. REAL

現在すでに実際に動作している機能。

B. ESTIMATE

AI推定として動作している機能。

C. MOCK

画面や固定データだけ存在し、実処理につながっていない機能。

D. UNIMPLEMENTED

まだ存在しない機能。

E. PARTIAL

一部だけ実装されている機能。

PARTIALについては、

どこまで動き、どこから未接続なのか

を明記してください。

⸻

49. 特に確認してほしい接続

以下は画面が存在するかではなく、本当にデータが次工程へ渡っているかをコードで確認してください。

1. CURRENT PHOTO → Hair Analysis
2. CURRENT PHOTO → Face/Bone Analysis
3. Face/Bone Analysis → Design Planning
4. STYLE Reference → HAIR MIRROR
5. COLOR Reference → Target Color Analysis
6. Adjusted COLOR → HAIR MIRROR
7. Adjusted COLOR → Recipe Engine
8. Face/Bone Analysis → Bang/Face Frame A–E
9. A–E Parameters → 実写画像生成
10. MAIN DESIGN → A–E Parent/Child Generation
11. CURRENT → REQUIRED UNDER
12. REQUIRED UNDER → LIFT ROUTE
13. PRE-LIFT → ON COLOR
14. ON COLOR → FIOLE Recipe
15. AI Recipe → Treatment Record
16. Actual Treatment → After Record
17. Before/After → Empirical Learning Data

UIだけつながっているように見える状態と、実データが接続されている状態を区別してください。

⸻

50. 差分監査の最後に出すもの

監査終了後、勝手に全実装へ進まず、

「MASTER SPEC v1.0 IMPLEMENTATION GAP REPORT」

を提出してください。

最後に、

次に実装すべき項目を依存関係順に提示してください。

ただし、この段階ではコード変更を開始しないでください。

こちらがGAP REPORTを確認してから、最初の実装フェーズを指定します。

⸻

MASTER SPECIFICATION v1.0 END

⸻
