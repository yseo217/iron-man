import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Design Ref: §8 — 허락한 곳의 스크립트·영상만 쓰게 하는 규칙 (Next.js CSP 안내의 "Without Nonces" 방식)
// 유튜브: 자막 조작 스크립트(www.youtube.com, s.ytimg.com)와 영상 칸(youtube-nocookie.com)만 허용
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.youtube.com https://s.ytimg.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Design Ref: §8 — 기본 보안 헤더와 서비스 워커(sw.js) 헤더 (docs/nextjs16-notes.md §5)
const nextConfig: NextConfig = {
  // 응답에 "Next.js로 만든 사이트"라는 표시를 붙이지 않는다
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 한 번 접속한 브라우저는 앞으로 1년 동안 항상 HTTPS로만 접속한다
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // 카메라·마이크·위치는 쓰지 않으니 막아 둔다
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // 서비스 워커는 항상 최신 파일을 받게 한다
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
