"use client";
// 화면을 그리다 예상하지 못한 오류가 나면 Next.js 기본 화면 대신 보여주는 안내 (Design §7)

import { useEffect } from "react";
import { BackToHome } from "@/app/components/BackToHome";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] 화면 오류:", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 px-4 py-16 text-center">
      <p className="text-5xl font-black italic tracking-tighter text-brand-red">앗!</p>
      <p className="text-xl font-black">화면을 불러오지 못했어요</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        인터넷 연결을 확인하고 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md bg-navy px-5 py-2.5 text-sm font-bold text-white hover:bg-navy-deep dark:bg-white/15 dark:hover:bg-white/25"
      >
        다시 시도
      </button>
      <BackToHome label="메인으로 가기" align="self-center" />
    </main>
  );
}
