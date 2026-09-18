// Design Ref: §2.2 흐름 1·3, §5 — 앱 화면과 알림이 함께 쓰는 "상위 5건 고르기"
import type { NewsFeeds } from "@/lib/news/google-news";
import type { Article, SentArticlesFile, SentBatch } from "@/lib/types";

export const TOP_COUNT = 5;
/** 5건 중 반도체 검색에서 채울 몫 (나머지는 AI 검색) */
export const SEMICONDUCTOR_COUNT = 2;
export const SENT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 구글 뉴스 순서대로 상위 기사를 고른다.
 * excludeIds에 있는 기사(이미 보낸 기사)는 건너뛰고 다음 순위로 채우며,
 * 고른 기사의 순위는 1부터 다시 매긴다. 모자라면 있는 만큼만 돌려준다.
 */
export function pickTopArticles(
  articles: Article[],
  excludeIds: ReadonlySet<string> = new Set(),
  count: number = TOP_COUNT,
): Article[] {
  const skipIds = new Set(excludeIds);
  const picked: Article[] = [];
  const byRank = [...articles].sort((a, b) => a.rank - b.rank);

  for (const article of byRank) {
    if (picked.length >= count) {
      break;
    }
    if (skipIds.has(article.id)) {
      continue;
    }
    skipIds.add(article.id);
    picked.push({ ...article, rank: picked.length + 1 });
  }
  return picked;
}

/**
 * AI 검색 3건 + 반도체 검색 2건을 섞어 5건을 고른다 (AI 기사가 먼저, 순위는 1부터).
 * 한쪽이 모자라면 다른 쪽 기사로 채우고, 두 검색에 같은 기사가 있으면 한 번만 넣는다.
 */
export function pickMixedTop(
  feeds: NewsFeeds,
  excludeIds: ReadonlySet<string> = new Set(),
): Article[] {
  const semiconductor = pickTopArticles(
    feeds.semiconductor,
    excludeIds,
    SEMICONDUCTOR_COUNT,
  );
  const ai = pickTopArticles(
    feeds.ai,
    new Set([...excludeIds, ...semiconductor.map((a) => a.id)]),
    TOP_COUNT - semiconductor.length,
  );
  const extraSemiconductor = pickTopArticles(
    feeds.semiconductor,
    new Set([...excludeIds, ...semiconductor.map((a) => a.id), ...ai.map((a) => a.id)]),
    TOP_COUNT - semiconductor.length - ai.length,
  );
  return [...ai, ...semiconductor, ...extraSemiconductor].map((article, index) => ({
    ...article,
    rank: index + 1,
  }));
}

/** 한국시간 정오 전이면 아침(08:00) 회차, 이후면 저녁(20:00) 회차 */
export function slotFor(date: Date): SentBatch["slot"] {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
  return hour < 12 ? "morning" : "evening";
}

/**
 * 보낸 기록에 새 회차를 더하고, 90일이 지난 회차는 지운 새 기록을 돌려준다.
 * (원래 기록은 바꾸지 않는다)
 */
export function addBatch(
  file: SentArticlesFile,
  batch: SentBatch,
  now: Date = new Date(),
): SentArticlesFile {
  const cutoff = now.getTime() - SENT_RETENTION_DAYS * DAY_MS;
  const kept = file.batches.filter((b) => !(Date.parse(b.sentAt) < cutoff));
  return {
    updatedAt: now.toISOString(),
    batches: [...kept, batch],
  };
}

/** 최근 90일 안에 알림으로 보낸 기사 번호 모음 (중복 확인용) */
export function recentSentIds(
  file: SentArticlesFile,
  now: Date = new Date(),
): Set<string> {
  const cutoff = now.getTime() - SENT_RETENTION_DAYS * DAY_MS;
  const ids = new Set<string>();
  for (const batch of file.batches) {
    if (Date.parse(batch.sentAt) < cutoff) {
      continue;
    }
    for (const article of batch.articles) {
      ids.add(article.id);
    }
  }
  return ids;
}
