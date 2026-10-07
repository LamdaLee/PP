import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Pause&Ponder 포즈앤폰더",
  description: "생각함에서 시작하는 감정과 돈의 기록",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
