// Design Ref: §6.3, §6.6 — (Nice) 최근 90일 동안 알림으로 보낸 기사 목록 (회차별, 최신순)
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { BackToHome } from "@/app/components/BackToHome";
import { SENT_RETENTION_DAYS } from "@/lib/news/pick-top";
import { readSentArticles, readSummaries } from "@/lib/store/github-store";
import type { SentBatch, SummariesFile } from "@/lib/types";

export const metadata: Metadata = {
  title: "지난 기사 · IRON MAN",
};

const SLOT_LABEL = { morning: "아침", evening: "저녁" } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

interface History {
  batches: SentBatch[];
  summaries: SummariesFile["items"];
}

/** 최근 90일 회차(보낸 기사가 있는 것만)를 최신순으로, 요약 저장소와 함께 읽는다 */
async function loadHistory(): Promise<History> {
  const [sentFile, summariesFile] = await Promise.all([
    readSentArticles(),
    // 요약 저장소를 못 읽어도 목록은 원문 제목으로 보여준다
    readSummaries().catch((): SummariesFile => ({ updatedAt: null, items: {} })),
  ]);
  const cutoff = Date.now() - SENT_RETENTION_DAYS * DAY_MS;
  const batches = sentFile.batches
    .filter((batch) => batch.articles.length > 0)
    .filter((batch) => !(Date.parse(batch.sentAt) < cutoff))
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
  return { batches, summaries: summariesFile.items };
}

export default async function HistoryPage() {
  // 발송 기록은 항상 최신으로 읽는다
  await connection();

  let history: History;
  try {
    history = await loadHistory();
  } catch (error) {
    console.error("[history] 발송 기록 읽기 실패:", error);
    return (
      <HistoryLayout>
        <EmptyBox text="지난 기사를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
      </HistoryLayout>
    );
  }
  const { batches, summaries } = history;

  return (
    <HistoryLayout>
      {batches.length === 0 ? (
        <EmptyBox text="아직 보낸 알림이 없어요" />
      ) : (
        batches.map((batch) => {
          const sentAt = new Date(batch.sentAt);
          return (
            <section
              key={batch.sentAt}
              aria-label={`${dayFormat.format(sentAt)} ${SLOT_LABEL[batch.slot]} 알림`}
              className="flex flex-col gap-2"
            >
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <span className="rounded bg-navy px-2 py-0.5 text-xs font-black text-white dark:bg-white/15">
                  {SLOT_LABEL[batch.slot]}
                </span>
                {dayFormat.format(sentAt)}{" "}
                <time dateTime={batch.sentAt} className="font-normal text-zinc-500 dark:text-zinc-400">
                  {timeFormat.format(sentAt)}
                </time>
              </h2>
              <ol className="flex flex-col divide-y divide-zinc-200 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-zinc-200 dark:divide-white/10 dark:bg-navy-deep dark:ring-white/10">
                {[...batch.articles]
                  .sort((a, b) => a.rank - b.rank)
                  .map((article) => {
                    const koTitle = article.ko?.title ?? summaries[article.id]?.title;
                    return (
                      <li key={article.id}>
                        <Link
                          href={`/articles/${article.id}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-white/5"
                        >
                          <span className="w-5 shrink-0 text-center text-xl font-black italic text-brand-red">
                            {article.rank}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span
                              lang={koTitle ? "ko" : "en"}
                              className="truncate font-bold"
                            >
                              {koTitle ?? article.title}
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                              {article.source}
                            </span>
                          </span>
                          <span aria-hidden className="text-zinc-400">
                            ›
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ol>
            </section>
          );
        })
      )}
    </HistoryLayout>
  );
}

function HistoryLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2 border-b-2 border-navy pb-3 dark:border-white/30">
        <BackToHome />
        <p className="text-xs font-bold uppercase tracking-widest text-brand-red">Archive</p>
        <h1 className="text-3xl font-black tracking-tight">지난 기사</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          최근 {SENT_RETENTION_DAYS}일 동안 알림으로 보낸 기사예요.
        </p>
      </header>
      {children}
    </main>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500 dark:border-white/15 dark:bg-navy-deep dark:text-zinc-400">
      {text}
    </p>
  );
}
