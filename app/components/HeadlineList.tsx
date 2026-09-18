// 오른쪽 칸의 짧은 제목 목록. 누르면 아래 기사 카드로 이동한다
import { Suspense } from "react";
import type { Article } from "@/lib/types";

interface Props {
  articles: Article[];
  /** (Nice) 한국어 요약이 붙은 기사 목록. 준비되면 한국어 제목으로 바뀐다 */
  summaries: Promise<Article[]>;
}

export function HeadlineList({ articles, summaries }: Props) {
  return (
    <Suspense fallback={<Headlines articles={articles} />}>
      <SummarizedHeadlines articles={articles} summaries={summaries} />
    </Suspense>
  );
}

async function SummarizedHeadlines({ articles, summaries }: Props) {
  const list = await summaries;
  const merged = articles.map((article) => ({
    ...article,
    ko: list.find((item) => item.id === article.id)?.ko,
  }));
  return <Headlines articles={merged} />;
}

function Headlines({ articles }: { articles: Article[] }) {
  return (
    <ol className="flex flex-col divide-y divide-zinc-200 dark:divide-white/10">
      {articles.map((article) => (
        <li key={article.id}>
          <a href={`#article-${article.id}`} className="group flex gap-3 py-3">
            <span className="w-4 shrink-0 text-lg font-black leading-tight text-brand-red">
              {article.rank}
            </span>
            <span
              lang={article.ko ? "ko" : "en"}
              className="line-clamp-3 font-bold leading-snug group-hover:underline"
            >
              {article.ko?.title ?? article.title}
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}
