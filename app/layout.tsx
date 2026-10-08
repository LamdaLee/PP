import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Pause&Ponder 포즈앤폰더",
  description: "생각·할 일·사고 싶은 것을 한곳에 적고, 필요한 기록부터 확인하세요.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <footer className="legal-footer" aria-label="서비스 정책">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            개인정보처리방침
          </a>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">
            서비스 이용약관
          </a>
        </footer>
      </body>
    </html>
  );
}
