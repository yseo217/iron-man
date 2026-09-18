// 모든 화면 위에 붙는 머리글: 남색 이름 줄 + 빨간 메뉴 줄
import Image from "next/image";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/#articles", label: "주요 기사" },
  { href: "/#video", label: "영상" },
  { href: "/history", label: "지난 기사" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 shadow-md">
      <div className="bg-navy">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="IRON MAN 메인으로">
            {/* 알림·홈 화면 아이콘과 같은 그림 (SVG라 크기 변환 없이 그대로 쓴다) */}
            <Image
              src="/icons/icon.svg"
              alt=""
              width={36}
              height={36}
              unoptimized
              loading="eager"
              className="size-9 rounded-md ring-1 ring-white/20"
            />
            <span className="text-xl font-black uppercase italic tracking-tight text-white">
              Iron Man
            </span>
          </Link>
          <span className="hidden text-xs font-bold uppercase tracking-widest text-white/60 sm:block">
            AI · Semiconductor Daily
          </span>
        </div>
      </div>
      <nav aria-label="주 메뉴" className="bg-brand-red">
        <ul className="mx-auto flex h-10 w-full max-w-6xl items-center gap-6 overflow-x-auto px-4">
          {NAV_ITEMS.map((item) => (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                className="text-sm font-bold uppercase tracking-wide text-white/90 hover:text-white hover:underline hover:underline-offset-4"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-navy-deep">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-white/60">
        <p className="font-black uppercase italic tracking-tight text-white">Iron Man</p>
        <p>구글 뉴스에서 고른 AI·반도체 주요 기사 · 매일 오전 8시·오후 8시 알림</p>
      </div>
    </footer>
  );
}
