import { Suspense } from "react";
import { SummaryDetails, SummaryLoading } from "@/app/components/SummaryDetails";
import type { Article } from "@/lib/types";

const relativeTime = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

/** 발행 시각을 "3시간 전" 같은 말로 바꾼다 */
function formatAgo(iso: string, now: Date): string {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 60) {
    return relativeTime.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return relativeTime.format(hours, "hour");
  }
  return relativeTime.format(Math.round(hours / 24), "day");
}

interface CardProps {
  article: Article;
  now: Date;
  /** (Nice) 한국어 요약이 붙은 기사 목록. 준비되는 대로 카드에 채워진다 */
  summaries?: Promise<Article[]>;
}

export function ArticleCard({ article, now, summaries }: CardProps) {
  return (
    <li
      id={`article-${article.id}`}
      className="flex gap-4 rounded-md bg-white p-5 shadow-sm ring-1 ring-zinc-200 transition-shadow hover:shadow-md sm:gap-5 sm:p-6 dark:bg-navy-deep dark:ring-white/10"
    >
      <span
        aria-label={`${article.rank}위`}
        className="w-7 shrink-0 text-4xl font-black italic leading-none tracking-tighter text-brand-red"
      >
        {article.rank}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {summaries ? (
          <Suspense fallback={<ArticleBody article={article} now={now} loading />}>
            <SummarizedBody article={article} now={now} summaries={summaries} />
          </Suspense>
        ) : (
          <ArticleBody article={article} now={now} />
        )}
      </div>
    </li>
  );
}

async function SummarizedBody({
  article,
  now,
  summaries,
}: CardProps & { summaries: Promise<Article[]> }) {
  const list = await summaries;
  const ko = list.find((item) => item.id === article.id)?.ko;
  return <ArticleBody article={{ ...article, ko }} now={now} />;
}

function ArticleBody({
  article,
  now,
  loading = false,
}: {
  article: Article;
  now: Date;
  loading?: boolean;
}) {
  const { ko } = article;
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span className="text-navy dark:text-white">{article.source}</span> ·{" "}
        <time dateTime={article.publishedAt}>{formatAgo(article.publishedAt, now)}</time>
      </p>
      {ko ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-extrabold leading-snug sm:text-xl">{ko.title}</h3>
          <p lang="en" className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
            {article.title}
          </p>
        </div>
      ) : (
        <h3 lang="en" className="text-lg font-extrabold leading-snug sm:text-xl">
          {article.title}
        </h3>
      )}
      {loading && <SummaryLoading />}
      {ko && <SummaryDetails ko={ko} />}
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 self-start rounded-md bg-navy px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-navy-deep dark:bg-white/15 dark:hover:bg-white/25"
      >
        원문 보기 →
      </a>
    </>
  );
}
