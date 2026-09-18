// Design Ref: §5, §6.7, §7 — 기사 알림 1건 발송 + 실패 시 1번 재시도
import "server-only";
import webpush from "web-push";
import type { Article, StoredPushSubscription } from "@/lib/types";

const RETRY_DELAY_MS = 5_000;
/** 12시간 안에 전달하지 못한 알림은 버린다 (다음 회차와 겹치지 않게) */
const NOTIFICATION_TTL_SECONDS = 12 * 60 * 60;

export type SendResult =
  | { ok: true }
  | { ok: false; expired: boolean; reason: string };

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

type SendFn = (
  subscription: StoredPushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;

/** 서비스 워커(public/sw.js)가 받는 알림 내용 */
export function buildPayload(article: Article, total: number): PushPayload {
  return {
    title: `AI·반도체 주요 기사 ${article.rank}/${total}`,
    body: article.ko?.title ?? article.title,
    url: `/articles/${article.id}`,
    tag: article.id,
  };
}

/**
 * 기사 알림 1건을 보낸다. 일시적인 실패는 5초 뒤 1번 더 시도하고,
 * 기기 정보가 만료된 경우(404·410)는 다시 시도하지 않는다.
 */
export async function sendArticlePush(
  subscription: StoredPushSubscription,
  article: Article,
  total: number,
  { send, retryDelayMs = RETRY_DELAY_MS }: { send?: SendFn; retryDelayMs?: number } = {},
): Promise<SendResult> {
  const sendFn: SendFn = send ?? configuredSend();
  const payload = JSON.stringify(buildPayload(article, total));

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await sendFn(subscription, payload, {
        TTL: NOTIFICATION_TTL_SECONDS,
        urgency: "normal",
        topic: article.id.slice(0, 32),
      });
      return { ok: true };
    } catch (error) {
      const status = readStatusCode(error);
      if (status === 404 || status === 410) {
        return { ok: false, expired: true, reason: `기기 정보 만료 (HTTP ${status})` };
      }
      if (attempt === 2) {
        return { ok: false, expired: false, reason: describeError(error, status) };
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  return { ok: false, expired: false, reason: "알 수 없는 오류" };
}

function configuredSend(): SendFn {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("알림 키 환경 변수(VAPID_*)가 없어요");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return (subscription, payload, options) =>
    webpush.sendNotification(subscription, payload, options);
}

function readStatusCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const { statusCode } = error;
    return typeof statusCode === "number" ? statusCode : undefined;
  }
  return undefined;
}

function describeError(error: unknown, status: number | undefined): string {
  if (status !== undefined) {
    return `알림 서버 오류 (HTTP ${status})`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 200);
}
