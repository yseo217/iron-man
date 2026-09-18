// Design Ref: §4.2, §5 — 비공개 GitHub 저장소의 data/ 파일 읽기·쓰기 (GitHub API)
import "server-only";
import { parseSubscription } from "@/lib/push/subscribe-guard";
import { isSummaryModel, type SummaryModel } from "@/lib/summary/models";
import type {
  Article,
  SentArticlesFile,
  SentBatch,
  SettingsFile,
  StoredPushSubscription,
  SubscriptionFile,
  SummariesFile,
} from "@/lib/types";

const GITHUB_API = "https://api.github.com";
const FETCH_TIMEOUT_MS = 10_000;

export const SENT_ARTICLES_PATH = "data/sent-articles.json";
export const SUBSCRIPTION_PATH = "data/subscription.json";
export const SUMMARIES_PATH = "data/summaries.json";
export const SETTINGS_PATH = "data/settings.json";

const EMPTY_SENT_ARTICLES: SentArticlesFile = { updatedAt: null, batches: [] };

function githubHeaders(token: string, accept: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * 토큰은 데이터 저장소 전용 DATA_REPO_TOKEN(배포 서버용, my-app 파일 읽기·쓰기만)을 먼저 쓰고,
 * 없으면 GITHUB_TOKEN(GitHub Actions가 자동으로 주는 토큰·내 PC)을 쓴다.
 * 저장소 이름은 .env의 GITHUB_REPO를 쓰고, 없으면
 * GitHub Actions·Vercel이 자동으로 넣어주는 값을 쓴다.
 */
function githubConfig(): { token: string; repo: string } {
  const env = process.env;
  const token = env.DATA_REPO_TOKEN || env.GITHUB_TOKEN;
  const vercelRepo =
    env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG
      ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
      : undefined;
  const repo = env.GITHUB_REPO || env.GITHUB_REPOSITORY || vercelRepo;
  if (!token || !repo) {
    throw new Error("DATA_REPO_TOKEN(또는 GITHUB_TOKEN)이나 GITHUB_REPO 환경 변수가 없어요");
  }
  return { token, repo };
}

/**
 * 읽은 파일을 이 서버 안에서 60초 동안 다시 쓴다.
 * 누가 화면을 계속 새로고침해도 GitHub 사용 한도(시간당 약 5,000번)가 금방 차지 않게 한다.
 * 이 서버에서 저장하면 바로 새 내용으로 바뀐다. 다른 서버·GitHub Actions가 저장한 내용은 최대 60초 늦게 보인다.
 */
const READ_CACHE_MS = 60_000;
const readCache = new Map<string, { at: number; value: Promise<unknown> }>();

function rememberRead(path: string, data: unknown): void {
  readCache.set(path, { at: Date.now(), value: Promise.resolve(data) });
}

/** 시험용: 기억해 둔 파일 내용을 모두 지운다 */
export function clearReadCache(): void {
  readCache.clear();
}

/**
 * 저장소 파일을 읽는다. 파일이 아직 없으면 null.
 * fresh: true면 기억해 둔 내용을 쓰지 않고 GitHub에서 새로 읽는다.
 * 돌려받은 값을 고쳐도 기억해 둔 내용은 바뀌지 않도록 복사본을 준다.
 */
export async function readJson(
  path: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<unknown> {
  const hit = readCache.get(path);
  if (!fresh && hit && Date.now() - hit.at < READ_CACHE_MS) {
    return structuredClone(await hit.value);
  }
  const value = fetchJson(path);
  readCache.set(path, { at: Date.now(), value });
  // 읽기에 실패한 결과는 기억하지 않는다
  value.catch(() => {
    if (readCache.get(path)?.value === value) {
      readCache.delete(path);
    }
  });
  return structuredClone(await value);
}

async function fetchJson(path: string): Promise<unknown> {
  const { token, repo } = githubConfig();
  const response = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    headers: githubHeaders(token, "application/vnd.github.raw+json"),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GitHub 파일 읽기 실패: ${path} (HTTP ${response.status})`);
  }
  return response.json();
}

/**
 * 저장소 파일을 JSON으로 저장한다 (커밋 1개가 생긴다).
 * 그 사이 다른 곳에서 파일이 바뀌어 충돌하면 최신 상태로 한 번 더 시도한다.
 */
export async function writeJson(
  path: string,
  data: unknown,
  message: string,
): Promise<void> {
  const { token, repo } = githubConfig();
  const url = `${GITHUB_API}/repos/${repo}/contents/${path}`;
  const content = Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString(
    "base64",
  );

  for (let attempt = 1; attempt <= 2; attempt++) {
    const sha = await readFileSha(url, token);
    const response = await fetch(url, {
      method: "PUT",
      headers: githubHeaders(token, "application/vnd.github+json"),
      body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }),
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.ok) {
      rememberRead(path, structuredClone(data));
      return;
    }
    const isConflict = response.status === 409 || response.status === 422;
    if (!isConflict || attempt === 2) {
      throw new Error(`GitHub 파일 저장 실패: ${path} (HTTP ${response.status})`);
    }
  }
}

const UPDATE_ATTEMPTS = 3;

/**
 * 저장소 파일을 "최신 내용 읽기 → 바꾸기 → 저장"한다.
 * 그 사이 다른 곳(화면·GitHub Actions)이 먼저 저장해 충돌하면, 그 최신 내용을 다시 읽어
 * update를 다시 적용하므로 다른 쪽이 저장한 내용을 덮어쓰지 않는다.
 * update가 null을 돌려주면 저장하지 않는다. 최종 내용을 돌려준다.
 */
export async function updateJson<T>(
  path: string,
  parse: (data: unknown) => T,
  update: (current: T) => T | null,
  message: string,
): Promise<T> {
  const { token, repo } = githubConfig();
  const url = `${GITHUB_API}/repos/${repo}/contents/${path}`;

  for (let attempt = 1; attempt <= UPDATE_ATTEMPTS; attempt++) {
    const { data, sha } = await readFileWithSha(url, token);
    const current = parse(data);
    // 방금 읽은 최신 내용을 기억해 둔다 (update가 current를 고칠 수 있어 먼저 복사)
    rememberRead(path, structuredClone(data));
    const next = update(current);
    if (next === null) {
      return current;
    }
    const content = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8").toString(
      "base64",
    );
    const response = await fetch(url, {
      method: "PUT",
      headers: githubHeaders(token, "application/vnd.github+json"),
      body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }),
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.ok) {
      rememberRead(path, structuredClone(next));
      return next;
    }
    const isConflict = response.status === 409 || response.status === 422;
    if (!isConflict || attempt === UPDATE_ATTEMPTS) {
      throw new Error(`GitHub 파일 저장 실패: ${path} (HTTP ${response.status})`);
    }
  }
  throw new Error(`GitHub 파일 저장 실패: ${path}`);
}

/** 파일 내용(JSON)과 버전 번호(sha)를 한 번에 읽는다. 파일이 없으면 둘 다 null */
async function readFileWithSha(
  url: string,
  token: string,
): Promise<{ data: unknown; sha: string | null }> {
  const response = await fetch(url, {
    headers: githubHeaders(token, "application/vnd.github+json"),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 404) {
    return { data: null, sha: null };
  }
  if (!response.ok) {
    throw new Error(`GitHub 파일 읽기 실패 (HTTP ${response.status})`);
  }
  const body = (await response.json()) as { sha?: unknown; content?: unknown };
  const sha = typeof body.sha === "string" ? body.sha : null;
  if (typeof body.content !== "string") {
    return { data: null, sha };
  }
  try {
    return { data: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")), sha };
  } catch {
    return { data: null, sha };
  }
}

async function readFileSha(url: string, token: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: githubHeaders(token, "application/vnd.github+json"),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GitHub 파일 정보 읽기 실패 (HTTP ${response.status})`);
  }
  const body: unknown = await response.json();
  return typeof body === "object" && body !== null && "sha" in body
    ? String(body.sha)
    : null;
}

/**
 * 보낸 기사 기록을 저장한다. 저장 직전의 최신 기록에 update(예: 회차 추가)를 적용하므로
 * 그 사이 다른 곳에서 바뀐 내용을 덮어쓰지 않는다.
 */
export async function updateSentArticles(
  update: (current: SentArticlesFile) => SentArticlesFile,
  slot: SentBatch["slot"],
): Promise<SentArticlesFile> {
  return updateJson(
    SENT_ARTICLES_PATH,
    parseSentArticles,
    update,
    `data: record ${slot} push batch`,
  );
}

/** (Nice) 저장된 한국어 요약. 아직 파일이 없거나 모양이 이상하면 빈 저장소 */
export async function readSummaries(options?: { fresh?: boolean }): Promise<SummariesFile> {
  return parseSummaries(await readJson(SUMMARIES_PATH, options));
}

/** 요약 저장소를 최신 내용 기준으로 바꿔 저장한다 (충돌 시 다시 읽어 다시 적용) */
export async function updateSummaries(
  update: (current: SummariesFile) => SummariesFile | null,
  message: string,
): Promise<SummariesFile> {
  return updateJson(SUMMARIES_PATH, parseSummaries, update, message);
}

function parseSummaries(data: unknown): SummariesFile {
  const items =
    typeof data === "object" && data !== null && "items" in data
      ? (data as SummariesFile).items
      : null;
  if (typeof items !== "object" || items === null || Array.isArray(items)) {
    return { updatedAt: null, items: {} };
  }
  return data as SummariesFile;
}


/** (Nice) 화면에서 고른 요약 모델. 파일이 없거나 목록에 없는 값이면 null */
export async function readSummaryModel(options?: {
  fresh?: boolean;
}): Promise<SummaryModel | null> {
  const data = await readJson(SETTINGS_PATH, options);
  const model =
    typeof data === "object" && data !== null && "summaryModel" in data
      ? (data as SettingsFile).summaryModel
      : null;
  return isSummaryModel(model) ? model : null;
}

export async function saveSummaryModel(model: SummaryModel): Promise<void> {
  const file: SettingsFile = { updatedAt: new Date().toISOString(), summaryModel: model };
  await writeJson(SETTINGS_PATH, file, `data: use ${model} for summaries`);
}

/** 저장된 알림 받을 기기 정보. 없거나 모양이 이상하면 null */
export async function readSubscription(): Promise<StoredPushSubscription | null> {
  const data = await readJson(SUBSCRIPTION_PATH);
  if (typeof data !== "object" || data === null || !("subscription" in data)) {
    return null;
  }
  return parseSubscription((data as SubscriptionFile).subscription);
}

/** 알림 받을 기기 정보를 저장한다. null이면 알림 끄기 */
export async function saveSubscription(
  subscription: StoredPushSubscription | null,
): Promise<void> {
  const file: SubscriptionFile = {
    updatedAt: new Date().toISOString(),
    subscription,
  };
  await writeJson(
    SUBSCRIPTION_PATH,
    file,
    subscription ? "data: turn on push notifications" : "data: turn off push notifications",
  );
}

/**
 * 만료된 알림 기기 정보를 지운다. 저장소의 기기가 방금 보낸 기기(endpoint)와 같을 때만 지워서,
 * 발송하는 사이 다른 기기에서 새로 켠 알림은 지우지 않는다. 지웠으면 true.
 */
export async function clearSubscriptionIfSame(endpoint: string): Promise<boolean> {
  let cleared = false;
  await updateJson<SubscriptionFile>(
    SUBSCRIPTION_PATH,
    (data) =>
      typeof data === "object" && data !== null && "subscription" in data
        ? (data as SubscriptionFile)
        : { updatedAt: null, subscription: null },
    (current) => {
      cleared = current.subscription?.endpoint === endpoint;
      return cleared ? { updatedAt: new Date().toISOString(), subscription: null } : null;
    },
    "data: remove expired push subscription",
  );
  return cleared;
}

/** 보낸 기사 기록. 아직 파일이 없으면 빈 기록, 모양이 깨졌으면 오류 (빈 기록으로 덮어쓰지 않도록) */
export async function readSentArticles(): Promise<SentArticlesFile> {
  return parseSentArticles(await readJson(SENT_ARTICLES_PATH));
}

function parseSentArticles(data: unknown): SentArticlesFile {
  if (data === null) {
    return EMPTY_SENT_ARTICLES;
  }
  if (!isSentArticlesFile(data)) {
    // 빈 기록으로 보고 저장하면 지난 기록이 사라지고 같은 기사가 다시 나가므로, 멈추고 알린다
    throw new Error(`${SENT_ARTICLES_PATH} 모양이 올바르지 않아요 (파일을 직접 확인해 주세요)`);
  }
  return data;
}

export interface SentArticleMatch {
  article: Article;
  batch: SentBatch;
}

/** 기사 번호로 보낸 기록을 찾는다. 여러 번 보냈다면 가장 최근 회차 */
export function findSentArticle(
  file: SentArticlesFile,
  id: string,
): SentArticleMatch | null {
  const newestFirst = [...file.batches].sort(
    (a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt),
  );
  for (const batch of newestFirst) {
    const article = batch.articles.find((a) => a.id === id);
    if (article) {
      return { article, batch };
    }
  }
  return null;
}

function isSentArticlesFile(value: unknown): value is SentArticlesFile {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as SentArticlesFile).batches) &&
    (value as SentArticlesFile).batches.every((batch) =>
      Array.isArray(batch?.articles),
    )
  );
}
