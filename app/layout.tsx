import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Pause&Ponder 포즈앤폰더",
  description: "마음함에서 시작하는 기록",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
