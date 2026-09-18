import { BackToHome } from "@/app/components/BackToHome";

export default function ArticleNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 px-4 py-16 text-center">
      <p className="text-5xl font-black italic tracking-tighter text-brand-red">404</p>
      <p className="text-xl font-black">기사를 찾을 수 없어요</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        알림으로 보낸 지 90일이 지났거나, 주소가 잘못됐을 수 있어요.
      </p>
      <BackToHome label="메인으로 가기" align="self-center" />
    </main>
  );
}
