// Design Ref: §5 — 구글 뉴스 RSS(API 키 없음) 검색 결과를 기사 목록으로 바꾼다
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { Article } from "@/lib/types";

const FETCH_TIMEOUT_MS = 10_000;
const UNKNOWN_SOURCE = "알 수 없는 매체";

// "AI"가 넓은 단어라 한 번에 검색하면 반도체 기사가 밀려나서, 주제별로 따로 검색한다
export const SEARCH_QUERIES = {
  ai: '(AI OR "artificial intelligence" OR semiconductor OR chipmaker)',
  semiconductor:
    '(semiconductor OR semiconductors OR chipmaker OR chipmakers OR TSMC OR Nvidia OR "SK Hynix" OR "Samsung Electronics" OR HBM OR foundry) when:1d',
} as const;

export type NewsTopic = keyof typeof SEARCH_QUERIES;

export type NewsFeeds = Record<NewsTopic, Article[]>;

export function googleNewsRssUrl(topic: NewsTopic): string {
  const params = new URLSearchParams({
    q: SEARCH_QUERIES[topic],
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  return `https://news.google.com/rss/search?${params}`;
}

/** 모든 주제를 동시에 검색한다. 한 주제가 실패해도 다른 주제는 그대로 돌려준다 */
export async function fetchGoogleNewsFeeds(
  init?: RequestInit,
): Promise<NewsFeeds> {
  const [ai, semiconductor] = await Promise.all([
    fetchGoogleNews("ai", init),
    fetchGoogleNews("semiconductor", init),
  ]);
  return { ai, semiconductor };
}

interface RssItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  source?: unknown;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // 숫자처럼 보이는 제목도 글자 그대로 둔다
  parseTagValue: false,
  htmlEntities: true,
  // 기사가 1건뿐이어도 항상 목록으로 받는다
  isArray: (tagName) => tagName === "item",
});

/**
 * 한 주제의 구글 뉴스 RSS를 읽어 구글 뉴스 순서대로 기사 목록을 돌려준다.
 * 읽기에 실패하면 빈 목록을 돌려준다 (Design §7: "새 기사 없음"으로 처리).
 * 화면에서는 캐시 옵션(`next.revalidate` 등)을 init으로 넘긴다.
 */
export async function fetchGoogleNews(
  topic: NewsTopic,
  init?: RequestInit,
): Promise<Article[]> {
  return (await fetchGoogleNewsTopic(topic, init)).articles;
}

export interface TopicResult {
  articles: Article[];
  /** 구글 뉴스가 응답한 시각 (저장된 응답이면 처음 받은 시각). 실패하면 null */
  fetchedAt: string | null;
  /** 읽기에 실패했는지 (기사 0건과 구분하기 위해) */
  failed: boolean;
}

export async function fetchGoogleNewsTopic(
  topic: NewsTopic,
  init?: RequestInit,
): Promise<TopicResult> {
  try {
    const response = await fetch(googleNewsRssUrl(topic), {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const date = new Date(response.headers.get("date") ?? "");
    return {
      articles: parseGoogleNewsRss(await response.text()),
      fetchedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      failed: false,
    };
  } catch (error) {
    console.error(`[google-news] ${topic} RSS 읽기 실패:`, error);
    return { articles: [], fetchedAt: null, failed: true };
  }
}

export function parseGoogleNewsRss(xml: string): Article[] {
  const items: RssItem[] = parser.parse(xml)?.rss?.channel?.item ?? [];
  const articles: Article[] = [];
  for (const item of items) {
    const article = toArticle(item, articles.length + 1);
    if (article) {
      articles.push(article);
    }
  }
  return articles;
}

/** 원문 링크로 만든 12자리 고유 번호 */
export function makeArticleId(link: string): string {
  return createHash("sha1").update(link).digest("hex").slice(0, 12);
}

function toArticle(item: RssItem, rank: number): Article | null {
  const link = readText(item.link);
  const rawTitle = readText(item.title);
  const publishedAt = new Date(readText(item.pubDate));
  if (!rawTitle || !isHttpUrl(link) || Number.isNaN(publishedAt.getTime())) {
    return null;
  }

  const source = readSourceName(item.source);
  // 구글 뉴스는 제목 끝에 " - 매체 이름"을 붙이므로 떼어서 매체 칸에 둔다
  const suffix = ` - ${source}`;
  const title =
    source && rawTitle.endsWith(suffix)
      ? rawTitle.slice(0, -suffix.length)
      : rawTitle;

  return {
    id: makeArticleId(link),
    rank,
    title,
    link,
    source: source || UNKNOWN_SOURCE,
    publishedAt: publishedAt.toISOString(),
  };
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readSourceName(value: unknown): string {
  if (value && typeof value === "object" && "#text" in value) {
    return readText(value["#text"]);
  }
  return readText(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
