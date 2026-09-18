// Design Ref: §8 — 알림 켜기·끄기 보호: PIN 확인, 여러 번 틀리면 잠시 거절, 구독 정보 검사
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { StoredPushSubscription } from "@/lib/types";

export const MAX_FAILED_TRIES = 5;
export const LOCK_MS = 10 * 60 * 1000;

export type PinCheck = "OK" | "PIN_NOT_SET" | "PIN_MISMATCH" | "LOCKED";

// 서버가 켜져 있는 동안만 기억한다 (Vercel처럼 서버가 여러 개면 서버마다 따로 센다)
const failures = { count: 0, lockedUntil: 0 };

export function checkPin(input: unknown, now: number = Date.now()): PinCheck {
  const expected = process.env.SUBSCRIBE_PIN;
  if (!expected) {
    return "PIN_NOT_SET";
  }
  if (now < failures.lockedUntil) {
    return "LOCKED";
  }
  if (typeof input === "string" && sameText(input, expected)) {
    failures.count = 0;
    return "OK";
  }
  failures.count += 1;
  if (failures.count >= MAX_FAILED_TRIES) {
    failures.count = 0;
    failures.lockedUntil = now + LOCK_MS;
  }
  return "PIN_MISMATCH";
}

/** 시험용: 틀린 횟수 기록을 지운다 */
export function resetPinFailures(): void {
  failures.count = 0;
  failures.lockedUntil = 0;
}

/** 글자 길이와 상관없이 같은 시간에 비교해, 응답 시간으로 PIN을 짐작하지 못하게 한다 */
function sameText(a: string, b: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * 브라우저 회사들의 알림 서버 주소만 받는다 (크롬·엣지·파이어폭스·사파리).
 * 다른 주소를 넣으면 발송 작업이 그 서버로 요청을 보내게 되므로 막는다.
 */
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "web.push.apple.com"];
const PUSH_SERVICE_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

export function isPushServiceHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    PUSH_SERVICE_HOSTS.includes(host) ||
    PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

/** 브라우저가 보낸 구독 정보가 올바른 모양인지 검사하고, 필요한 칸만 남긴다 */
export function parseSubscription(value: unknown): StoredPushSubscription | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { endpoint, expirationTime, keys } = value as Record<string, unknown>;
  if (typeof endpoint !== "string" || endpoint.length > 1000) {
    return null;
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !isPushServiceHost(url.hostname)) {
      return null;
    }
  } catch {
    return null;
  }
  if (typeof keys !== "object" || keys === null) {
    return null;
  }
  const { p256dh, auth } = keys as Record<string, unknown>;
  const isKey = (key: unknown): key is string =>
    typeof key === "string" && key.length <= 200 && BASE64URL.test(key);
  if (!isKey(p256dh) || !isKey(auth)) {
    return null;
  }
  return {
    endpoint,
    expirationTime: typeof expirationTime === "number" ? expirationTime : null,
    keys: { p256dh, auth },
  };
}
