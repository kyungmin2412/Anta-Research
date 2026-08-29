import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anta Research — DART 기업분석",
  description:
    "금융감독원 전자공시(DART) 데이터로 기업의 재무·수익성·안정성을 한눈에 살펴보세요.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-grey-100 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500 text-[13px] font-bold text-white">
                A
              </span>
              <span className="text-[15px] font-bold text-grey-900">Anta Research</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                href="/analysis"
                className="text-[13px] font-medium text-grey-500 hover:text-grey-700"
              >
                개별 기업 분석
              </Link>
              <a
                href="https://opendart.fss.or.kr"
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-medium text-grey-500 hover:text-grey-700"
              >
                DART 오픈API
              </a>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-5 pb-24">{children}</main>

        <footer className="border-t border-grey-100 bg-white">
          <div className="mx-auto max-w-5xl px-5 py-10 text-[13px] leading-relaxed text-grey-500">
            <p className="font-semibold text-grey-700">Anta Research</p>
            <p className="mt-2">
              모든 데이터의 출처는 금융감독원 전자공시시스템(DART) 오픈API입니다. 공시
              원문과 다를 수 있으며, 투자 판단의 책임은 이용자 본인에게 있습니다.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
