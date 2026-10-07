import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Pause&Ponder 포즈앤폰더",
  description: "생각·할 일·사고 싶은 것을 한곳에 적고, 필요한 기록부터 확인하세요.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
