# 写真入りサンプルデモ

架空の現在写真・希望写真を設定し、8ステップの完成時の使い方を確認するケースです。新しい画面は `/fiole/demo`、通常の `/fiole` からも「写真入りサンプルで完成形を見る」で開けます。

- 現在：赤みのある肩下ブラウン。
- 希望：ベージュ系の鎖骨ロブ・薄めの前髪・柔らかい顔周り。
- 仕上がり：現在写真の顔・服・背景を保ち、髪だけを変更した事前生成イメージ。
- 診断とCIELABは固定のデモ値で、写真解析・実測ではありません。
- 149色番・73項目・15色素軸の既存FIOLE資料データを候補表示に利用。2：1等の比率は仮計算です。
- OXと放置時間は未入力です。施術条件の正解として自動設定していません。
- AI原本・美容師補正・提案・実使用・After・評価は別項目です。事前生成画像はカルテのAfter・実施術結果に保存しません。
- 写真・目標・診断・選択レシピがサンプル条件から変わると、この事前生成画像は非表示になります。条件変更による画像再生成のAPIは未接続です。

## 生成画像の保存先

ビルトイン画像生成を使用。下記3枚は同じプロジェクトの資産です。人物は架空です。

- [現在写真](sandbox:/workspace/scratch/1bd9f00e9a35/hair-style-ai/public/demo/fictional-current-v1.png)
- [希望写真](sandbox:/workspace/scratch/1bd9f00e9a35/hair-style-ai/public/demo/fictional-target-v1.png)
- [仕上がりイメージ](sandbox:/workspace/scratch/1bd9f00e9a35/hair-style-ai/public/demo/fictional-result-v1.png)

表示用JPEGへの縮小・圧縮のみを行い、写真内容や色の追加編集はしていません。

## 使用した生成プロンプト

### 現在写真

Use case: photorealistic-natural. Asset type: fictional current-hair photo for a hairstylist consultation demo. Create one realistic portrait photograph of a fictional Japanese adult woman around 30, facing the camera with a relaxed neutral expression. Chest-up framing, all hair visible with generous margin above the head and below hair ends. Straight hair ending 8 cm below shoulders, grown-out darker brown roots, warm reddish chestnut brown mid lengths, slightly lighter yellow-orange uneven ends, a few natural flyaways. Long grown-out parted fringe rather than short bangs. Natural realistic hair, no exaggerated damage. Simple ivory round-neck blouse, no accessories. Warm off-white salon wall, soft diffuse neutral daylight, eye-level camera, genuine skin texture. Portrait aspect 4:5. No text, no labels, no collage, no interface, no watermark. The subject is invented and is not a celebrity.

### 希望写真

Use case: photorealistic-natural. Asset type: fictional desired-style reference photograph for a hairstylist consultation demo. Create one realistic chest-up salon portrait photograph of a fictional Japanese adult woman around 30, with a soft neutral expression, head turned only slightly. Hair: translucent muted beige brown with reduced red/orange cast, natural darker roots, softly layered collarbone-length lob, airy see-through bangs with soft cheekbone framing strands, gentle inward curve at ends. Medium lightness, not platinum, not gray, not bleached white. Fine individual hair strands and realistic texture. All hair visible with margin. Simple sand-colored blouse, neutral light beige salon wall, soft neutral daylight, realistic skin texture. Portrait aspect 4:5. No text, no labels, no collage, no interface, no watermark. The subject is invented and is not a celebrity.

### 仕上がりイメージ

Use case: identity-preserve. Asset type: pre-generated illustrative hair makeover image for a salon consultation demo, not an actual treatment photograph. Input image 1 is the EDIT TARGET and identity source, current-hair portrait. Input image 2 is ONLY a hairstyle and hair-color reference; do not use its face. Edit only the HAIR in image 1. Preserve image 1 woman's exact facial features, proportions, eye color, expression, gaze, skin texture, neck, shoulders, ivory blouse, body pose, background, lighting, camera angle and crop. Give her the hairstyle of image 2: a softly layered collarbone-length lob, airy see-through eyebrow-length bangs and soft cheekbone framing strands, gentle natural curves at ends. Shorten about 8 cm compared with her original. Change the current reddish orange chestnut hair to a softly luminous neutral beige brown with reduced red/orange warmth, subtle natural dark roots, realistic strand variation, and medium brightness. Preserve the existing photo's natural texture; no retouching of skin or face. All hair remains fully visible in the original frame. One portrait photograph, no split panels, no text, no labels, no UI, no watermark. This should visibly be the SAME woman as image 1 with only her hair changed.

## 検証

型チェック、9件のテスト、Next.jsの本番ビルドが成功。Next.js画面と会話内のデモの両方で、3枚の写真表示、AIと美容師補正の区別、CIELAB差分、3候補、保存・再読込、実施術への混入防止、別レシピでの画像非表示、149色番のライブラリ、320px・390px・1024pxの表示を確認しました。

