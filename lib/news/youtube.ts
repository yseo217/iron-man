// Design Ref: §2.2 흐름 5, §5 — (Nice) 해외 뉴스 채널 유튜브 RSS에서 주요 영상 1개 고르기
import { XMLParser } from "fast-xml-parser";
import type { NewsVideo } from "@/lib/types";

export const VIDEO_CACHE_TAG = "video";
export const VIDEO_REVALIDATE_SECONDS = 43_200;

const FETCH_TIMEOUT_MS = 10_000;
const RECENT_HOURS = 48;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** 유튜브 채널 RSS는 요청마다 404·500이 잦아서 여러 채널을 함께 본다 */
export const NEWS_CHANNELS = {
  CNBC: "UCvJJ_dzjViJCoLf5uKUTwoA",
  "CNBC Television": "UCrp_UI8XtuYfpiqluWLD7Lw",
  "Bloomberg Television": "UCIALMKvObZNtJ6AmdCLP7Lg",
  Reuters: "UChqUTb7kYRX8-EiaN3XFrSQ",
  WSJ: "UCK7tptUDHh-RYDsdxO1-5QQ",
  "Yahoo Finance": "UCEAZeUIeJs0IjQiqTCdVSIg",
} as const;

const TOPIC_PATTERN =
  /\b(?:AI|artificial intelligence|OpenAI|Anthropic|ChatGPT|chips?|chipmakers?|semiconductors?|Nvidia|TSMC|ASML|Micron|Hynix|Samsung Electronics|Broadcom|AMD|HBM|foundry|data cent(?:er|re)s?)\b|\bA\.I\./i;

interface FeedEntry {
  "yt:videoId"?: unknown;
  title?: unknown;
  link?: unknown;
  author?: { name?: unknown };
  published?: unknown;
  "media:group"?: {
    "media:community"?: { "media:statistics"?: { "@_views"?: unknown } };
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  htmlEntities: true,
  isArray: (tagName) => tagName === "entry",
});

/** 화면용: 채널 RSS를 동시에 읽고(성공한 응답만 12시간 저장) 영상 1개를 고른다 */
export async function getTopVideo(): Promise<NewsVideo | null> {
  const lists = await Promise.all(
    Object.values(NEWS_CHANNELS).map((channelId) =>
      fetchChannelVideos(channelId, {
        next: { revalidate: VIDEO_REVALIDATE_SECONDS, tags: [VIDEO_CACHE_TAG] },
      }),
    ),
  );
  return pickTopVideo(lists.flat());
}

/** 채널 영상 목록. 실패하면 빈 목록 (Next.js는 200 응답만 저장하므로 실패는 다음에 다시 시도됨) */
export async function fetchChannelVideos(
  channelId: string,
  init?: RequestInit,
): Promise<NewsVideo[]> {
  try {
    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!response.ok) {
      console.warn(`[youtube] ${channelId} RSS 실패 (HTTP ${response.status})`);
      return [];
    }
    return parseChannelFeed(await response.text());
  } catch (error) {
    console.warn(`[youtube] ${channelId} RSS 실패:`, error);
    return [];
  }
}

export function parseChannelFeed(xml: string): NewsVideo[] {
  const entries: FeedEntry[] = parser.parse(xml)?.feed?.entry ?? [];
  return entries.flatMap((entry) => {
    const video = toVideo(entry);
    return video ? [video] : [];
  });
}

/**
 * 최근 48시간 안에 올라온 AI·반도체 영상 중 조회수 1위.
 * 일반 영상을 먼저 고르고, 없을 때만 세로형 짧은 영상에서 고른다.
 */
export function pickTopVideo(
  videos: NewsVideo[],
  now: Date = new Date(),
): NewsVideo | null {
  const cutoff = now.getTime() - RECENT_HOURS * 60 * 60 * 1000;
  const candidates = videos.filter(
    (video) => Date.parse(video.publishedAt) >= cutoff,
  );
  const byViews = (a: NewsVideo, b: NewsVideo) =>
    b.views - a.views || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  const regular = candidates.filter((video) => !video.isShort).sort(byViews);
  const shorts = candidates.filter((video) => video.isShort).sort(byViews);
  return regular[0] ?? shorts[0] ?? null;
}

function toVideo(entry: FeedEntry): NewsVideo | null {
  const id = readText(entry["yt:videoId"]);
  const title = readText(entry.title);
  const publishedAt = new Date(readText(entry.published));
  // 설명글까지 보면 관련 없는 영상이 섞여서 제목만 본다
  if (
    !VIDEO_ID.test(id) ||
    !title ||
    Number.isNaN(publishedAt.getTime()) ||
    !TOPIC_PATTERN.test(title)
  ) {
    return null;
  }

  const views = Number(
    entry["media:group"]?.["media:community"]?.["media:statistics"]?.["@_views"],
  );
  const link = entry.link;
  const href =
    link && typeof link === "object" && "@_href" in link
      ? readText(link["@_href"])
      : "";

  return {
    id,
    title,
    channel: readText(entry.author?.name) || "알 수 없는 채널",
    publishedAt: publishedAt.toISOString(),
    views: Number.isFinite(views) ? views : 0,
    isShort: href.includes("/shorts/"),
  };
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
