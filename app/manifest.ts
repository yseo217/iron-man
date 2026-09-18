// Design Ref: §11.1 — 휴대폰 홈 화면에 앱처럼 추가하기 위한 앱 정보 (docs/nextjs16-notes.md §5)
import type { MetadataRoute } from "next";
import { APP_THEME_COLOR } from "@/lib/app-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IRON MAN — AI·반도체 주요 기사",
    short_name: "IRON MAN",
    description: "AI·반도체 해외 주요 기사 5건을 모아 보여주는 개인용 앱",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_THEME_COLOR,
    theme_color: APP_THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
