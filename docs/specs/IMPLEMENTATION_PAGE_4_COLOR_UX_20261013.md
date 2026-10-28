# Page 4・COLOR調整モーダル：2026-10-13 承認差分

根拠は今回のユーザー指示「Page 4新規実装・Page 1カラー調整UX改善・実AI生成検証 一括指示書」。旧Phase/Page停止条件に対し、Page 4とPage 1 COLORモーダル内部、および必要な限定API・画像処理・テストだけを許可する差分。旧MASTER SPEC v1.1本文は更新しない。

## 正本

- `docs/visual-master/20261013-page4-color/COLOR_MODAL_MASTER.jpeg`：864×1536、SHA-256 `ee54dc359ef4dc41e7e0bf40d017cdbfa1d5af32199507c4291c9f89bff13c08`。
- `docs/visual-master/20261013-page4-color/PAGE4_MASTER.jpeg`：1122×1402、SHA-256 `fbdb698e701fd71a04999981ddea6b18215c6d9150306774cd7980ae8cea47bf`。
- 添付ファイルの原バイトを保持。OSステータスバーはWeb UIへ複製しない。

## 実装との対応

| 指示 | 実装 |
|---|---|
| COLOR写真固定・下部だけスクロール | CounselingColorModal、COLOR限定CSS、既存確定ボタンのportal |
| 既存7項目の範囲・計算維持 | TargetColorEditorの配置だけ変更。hueの既存追加操作もdetails内に保持 |
| 髪だけの補正・比較 | 既存CounselingHairPhotoと編集可能マスクを再利用。Before/Adjustedと比較range |
| Page 4の6セクション | AfterReviewPage、1122×1402固定比率シート、画面幅で全体縮小 |
| 一時的な施術後写真 | readReviewPhoto、コンポーネント状態のみ。Journey/IndexedDBへの追加保存なし |
| 独立分析線 | 髪領域の外輪郭と局所テクスチャ方向のSVG overlay。元画像不変 |
| 撮影差を考慮 | 既存端末内MediaPipe顔・毛髪解析と2D similarity transform。yaw/pitch差の大きい写真は判定不可 |
| 根拠のある参考指標 | mask IoU、画像Lab色差、局所方向比較。未解析null、未校正LOW |
| 改善と教育 | 数値差に条件づけた初期説明＋匿名数値だけの任意AI文章API |
| 本物の生成 | 既存/api/generateを維持。キー未設定時は接続不可と表示、固定画像を返さない |

## 禁止範囲の保護

Page 1本体のmain JSXとSTYLE branch、既存CSSを固定hashで回帰検証。Page 2/3、PNG出力、FIOLE、旧session管理・保存処理は編集しない。GitHub mainへpush/mergeしない。Sites専用ソースへ保存・配信する。

Page 4は校正された美容技術評価モデルではない。物理骨格、レイヤー内部構造、ウエイトの実測、毛根→毛先の確定方向、物理的な毛髪色、髪質・触感の確定は実装済みと扱わない。2D yaw/pitchの推定は低信頼度の比較可否判定用で、3D再構築や見えない部分の生成補完は行わない。
