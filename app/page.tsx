// Design Ref: §6.1 — 메인 화면 (실시간 주요 기사 5건)
import Link from "next/link";
import { connection } from "next/server";
import { ArticleCard } from "@/app/components/ArticleCard";
import { HeadlineList } from "@/app/components/HeadlineList";
import { InstallGuide } from "@/app/components/InstallGuide";
import { ModelSelector } from "@/app/components/ModelSelector";
import { PushSubscribe } from "@/app/components/PushSubscribe";
import { RefreshButton } from "@/app/components/RefreshButton";
import { SectionTitle } from "@/app/components/SectionTitle";
import { NoVideoCard, VideoCard } from "@/app/components/VideoCard";
import { getTopArticles } from "@/lib/news/top-articles";
import { getTopVideo } from "@/lib/news/youtube";
import { readSummaryModel } from "@/lib/store/github-store";
import { DEFAULT_SUMMARY_MODEL, isSummaryModel, type SummaryModel } from "@/lib/summary/models";
import { attachSummaries } from "@/lib/summary/summarize";

/** 버튼에 표시할 지금 요약 모델 (설정을 못 읽으면 .env 또는 기본 모델) */
async function currentSummaryModel(): Promise<SummaryModel> {
  const chosen = await readSummaryModel().catch(() => null);
  const envModel = process.env.OPENAI_MODEL;
  return chosen ?? (isSummaryModel(envModel) ? envModel : DEFAULT_SUMMARY_MODEL);
}

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function Home() {
  // 요약 저장소는 항상 최신으로 읽어야 해서 요청마다 화면을 만든다 (뉴스·영상 응답은 각각 저장된 것을 재사용)
  // 빌드할 때는 OpenAI를 부르지 않는다
  await connection();
  const [{ articles, updatedAt }, video, summaryModel] = await Promise.all([
    getTopArticles(),
    getTopVideo(),
    currentSummaryModel(),
  ]);
  const updated = new Date(updatedAt);
  // 기다리지 않고 넘겨서, 기사 카드는 먼저 보이고 요약은 준비되는 대로 채워진다
  const summaries = attachSummaries(articles).catch(() => articles);

  return (
    <>
      {/* 경기 일정 줄처럼 보이는 상태 줄: 알림 시간과 마지막 업데이트 */}
      <div className="border-b border-zinc-200 bg-white dark:border-white/10 dark:bg-navy-deep">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 text-sm">
          <StatusChip label="LIVE" tone="red" />
          <span className="shrink-0 font-bold text-zinc-900 dark:text-white">
            업데이트 <time dateTime={updatedAt}>{timeFormat.format(updated)}</time>
          </span>
          {/* 좁은 화면에서는 새로고침 버튼이 가려지지 않게 알림 시간을 숨긴다 */}
          <div className="hidden items-center gap-3 sm:flex">
            <span aria-hidden className="h-5 w-px shrink-0 bg-zinc-200 dark:bg-white/15" />
            <StatusChip label="08:00" tone="navy" />
            <span className="shrink-0 font-semibold text-zinc-600 dark:text-zinc-300">아침 알림</span>
            <StatusChip label="20:00" tone="navy" />
            <span className="shrink-0 font-semibold text-zinc-600 dark:text-zinc-300">저녁 알림</span>
          </div>
          <div className="ml-auto shrink-0">
            <RefreshButton />
          </div>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-red">
              Today&apos;s Top Stories
            </p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              AI와 반도체 주요 기사
            </h1>
          </div>

          {video ? <VideoCard video={video} /> : <NoVideoCard />}

          <section id="articles" aria-labelledby="articles-heading" className="flex flex-col gap-4">
            <SectionTitle id="articles-heading" title="주요 기사" moreHref="/history" moreLabel="지난 기사" />
            {articles.length > 0 ? (
              <ol className="flex flex-col gap-4">
                {articles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    now={updated}
                    summaries={summaries}
                  />
                ))}
              </ol>
            ) : (
              <p className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500 dark:border-white/15 dark:bg-navy-deep dark:text-zinc-400">
                지금 새 기사가 없어요
              </p>
            )}
          </section>
        </div>

        {/* 오른쪽 칸 (휴대폰에서는 아래로 내려감) */}
        <aside className="flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
          {articles.length > 0 && (
            <section aria-labelledby="headlines-heading" className="flex flex-col gap-3">
              <SectionTitle id="headlines-heading" title="Headlines" moreHref="/history" moreLabel="전체 보기" />
              <HeadlineList articles={articles} summaries={summaries} />
            </section>
          )}

          <section
            aria-labelledby="push-heading"
            className="flex flex-col gap-3 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-navy-deep dark:ring-white/10"
          >
            <h2 id="push-heading" className="bg-navy px-4 py-3 text-sm font-black uppercase tracking-wide text-white">
              알림 받기
            </h2>
            <div className="flex flex-col gap-3 px-4 pb-4">
              <PushSubscribe />
              <InstallGuide />
            </div>
          </section>

          <section
            aria-labelledby="model-heading"
            className="flex flex-col gap-3 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-navy-deep dark:ring-white/10"
          >
            <h2 id="model-heading" className="bg-navy px-4 py-3 text-sm font-black uppercase tracking-wide text-white">
              요약 AI 모델
            </h2>
            <div className="px-4 pb-4">
              <ModelSelector current={summaryModel} />
            </div>
          </section>

          <Link
            href="/history"
            className="rounded-md bg-brand-red px-5 py-3 text-center text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-red-dark"
          >
            지난 기사 보기 →
          </Link>
        </aside>
      </main>
    </>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "red" | "navy" }) {
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-xs font-black tracking-wide text-white ${
        tone === "red" ? "bg-brand-red" : "bg-navy dark:bg-white/15"
      }`}
    >
      {label}
    </span>
  );
}
