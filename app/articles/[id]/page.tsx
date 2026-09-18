// Design Ref: §6.2 — 알림을 누르면 열리는 기사 화면 (항상 최신 기록을 읽음)
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackToHome } from "@/app/components/BackToHome";
import { SummaryDetails, SummaryLoading } from "@/app/components/SummaryDetails";
import { findSentArticle, readSentArticles } from "@/lib/store/github-store";
import { attachSummaries } from "@/lib/summary/summarize";
import type { Article, SentArticlesFile } from "@/lib/types";

const ARTICLE_ID = /^[0-9a-f]{12}$/;
const SLOT_LABEL = { morning: "아침", evening: "저녁" } as const;

const dayFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

async function SummarizedText({ article }: { article: Article }) {
  const [withSummary] = await attachSummaries([article]).catch(() => [article]);
  return <ArticleText article={withSummary} />;
}

function ArticleText({ article, loading = false }: { article: Article; loading?: boolean }) {
  const { ko } = article;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black leading-snug tracking-tight sm:text-3xl">
          {ko?.title ?? article.title}
        </h1>
        {ko && (
          <p lang="en" className="text-sm leading-snug text-zinc-500 dark:text-zinc-400">
            {article.title}
          </p>
        )}
      </div>
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span className="text-navy dark:text-white">{article.source}</span> ·{" "}
        <time dateTime={article.publishedAt}>
          {dateTimeFormat.format(new Date(article.publishedAt))}
        </time>
      </p>
      {loading && <SummaryLoading />}
      {ko && <SummaryDetails ko={ko} />}
    </>
  );
}

export default async function ArticlePage(props: PageProps<"/articles/[id]">) {
  const { id } = await props.params;
  if (!ARTICLE_ID.test(id)) {
    notFound();
  }

  let file: SentArticlesFile;
  try {
    file = await readSentArticles();
  } catch (error) {
    console.error("[articles] 보낸 기사 기록 읽기 실패:", error);
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
        <BackToHome />
        <p className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500 dark:border-white/15 dark:bg-navy-deep dark:text-zinc-400">
          기사를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      </main>
    );
  }

  const match = findSentArticle(file, id);
  if (!match) {
    notFound();
  }
  const { article, batch } = match;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <BackToHome />
      <p className="flex items-center gap-2 text-sm font-bold">
        <span className="rounded bg-brand-red px-2 py-0.5 text-xs font-black text-white">
          인기 {article.rank}위
        </span>
        {dayFormat.format(new Date(batch.sentAt))} {SLOT_LABEL[batch.slot]} 알림
      </p>
      <article className="flex flex-col gap-4 rounded-md border-t-4 border-brand-red bg-white p-6 shadow-sm ring-1 ring-zinc-200 sm:p-8 dark:bg-navy-deep dark:ring-white/10">
        {article.ko ? (
          <ArticleText article={article} />
        ) : (
          // 요약 없이 보낸 예전 기록은 여기서 요약을 만들어 채운다 (저장해서 다음부터 재사용)
          <Suspense fallback={<ArticleText article={article} loading />}>
            <SummarizedText article={article} />
          </Suspense>
        )}
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start rounded-md bg-navy px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-navy-deep dark:bg-white/15 dark:hover:bg-white/25"
        >
          원문 기사 열기 →
        </a>
      </article>
    </main>
  );
}
