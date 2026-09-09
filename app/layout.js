import "./globals.css";

export const metadata = {
  title: "HAIR MIRROR AI",
  description: "AIヘアスタイル・髪色シミュレーション",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
