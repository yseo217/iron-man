import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/app/components/SiteHeader";
import { APP_THEME_COLOR } from "@/lib/app-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IRON MAN",
  description: "AI·반도체 해외 주요 기사 5건을 모아 보여주는 개인용 앱",
  appleWebApp: {
    title: "IRON MAN",
    statusBarStyle: "default",
  },
  // 개인용 앱이라 검색엔진에 올리지 않는다 (PIN 입력칸을 찾기 어렵게)
  robots: { index: false, follow: false },
};

// Next.js 16에서 테마 색은 metadata가 아니라 viewport에 둔다
export const viewport: Viewport = {
  themeColor: APP_THEME_COLOR,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
