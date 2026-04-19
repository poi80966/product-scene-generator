export const metadata = {
  title: "商品場景生成器",
  description: "AI 電商商品圖自動生成工具",
};
 
export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
 
