# HAIR MIRROR AI — MVP

スマホ向けのAIヘアスタイル・シミュレーションWebアプリです。

## 機能
- お客様写真のアップロード
- なりたい髪型・髪色を日本語で入力
- OpenAI GPT-Image-2で写真を編集
- Before / AI After 比較
- 生成画像の保存

## ローカル起動
1. Node.js 20以降を用意
2. `npm install`
3. `.env.example` を `.env.local` にコピー
4. `OPENAI_API_KEY` にOpenAI APIキーを設定
5. `npm run dev`
6. `http://localhost:3000` を開く

## Vercelで公開
1. このフォルダをGitHubリポジトリにアップロード
2. VercelでそのリポジトリをImport
3. Vercelの Environment Variables に `OPENAI_API_KEY` を登録
4. Deploy

## 公開前に追加推奨
- 利用規約 / プライバシーポリシー
- 同意チェック（人物写真をAI処理する旨）
- 利用回数制限・レート制限
- 画像保存を行う場合の保存期間と削除機能
- 認証 / 課金（必要になってから）

※ AI生成結果は施術結果を保証するものではない旨を画面内に表示しています。
