// Design Ref: §2.2 흐름 1, §5 — 화면용 주요 기사 5건 (구글 뉴스 응답은 10분 동안 재사용)
import { fetchGoogleNewsTopic } from "@/lib/news/google-news";
import { pickMixedTop } from "@/lib/news/pick-top";
import type { Article } from "@/lib/types";

/** 새로고침 버튼이 이 태그로 저장된 결과를 즉시 지운다 (docs/nextjs16-notes.md §2) */
export const NEWS_CACHE_TAG = "news";
export const NEWS_REVALIDATE_SECONDS = 600;

export interface TopArticlesResult {
  articles: Article[];
  /** 구글 뉴스에서 받아온 시각 (ISO 8601 문자열) */
  updatedAt: string;
}

/**
 * 메인 화면용 기사 5건(AI 3건 + 반도체 2건).
 * 구글 뉴스 응답은 10분 동안 저장해 다시 쓰고, 읽기에 실패하면 빈 목록이 된다.
 */
export async function getTopArticles(): Promise<TopArticlesResult> {
  const init: RequestInit = {
    next: { revalidate: NEWS_REVALIDATE_SECONDS, tags: [NEWS_CACHE_TAG] },
  };
  const [ai, semiconductor] = await Promise.all([
    fetchGoogleNewsTopic("ai", init),
    fetchGoogleNewsTopic("semiconductor", init),
  ]);
  const fetchedTimes = [ai.fetchedAt, semiconductor.fetchedAt]
    .filter((time): time is string => time !== null)
    .map((time) => Date.parse(time));
  return {
    articles: pickMixedTop({ ai: ai.articles, semiconductor: semiconductor.articles }),
    updatedAt: new Date(
      fetchedTimes.length > 0 ? Math.min(...fetchedTimes) : Date.now(),
    ).toISOString(),
  };
}
