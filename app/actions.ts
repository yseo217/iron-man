"use server";
// Design Ref: §5 — 버튼을 누르면 서버에서 처리하는 동작 (docs/nextjs16-notes.md §2·§3)

import { refresh, updateTag } from "next/cache";
import { NEWS_CACHE_TAG } from "@/lib/news/top-articles";
import { checkPin, parseSubscription } from "@/lib/push/subscribe-guard";
import {
  readSubscription,
  readSummaryModel,
  saveSubscription,
  saveSummaryModel,
} from "@/lib/store/github-store";
import { isSummaryModel } from "@/lib/summary/models";

export type ModelActionResult =
  | { ok: true }
  | {
      ok: false;
      error: "PIN_NOT_SET" | "PIN_MISMATCH" | "LOCKED" | "INVALID_MODEL" | "SAVE_FAILED";
    };

export type PushActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "PIN_NOT_SET"
        | "PIN_MISMATCH"
        | "LOCKED"
        | "INVALID_SUBSCRIPTION"
        | "SAVE_FAILED";
    };

/** 새로고침: 10분 저장된 구글 뉴스 결과를 지우고 화면을 다시 그린다 */
export async function refreshNews(): Promise<void> {
  updateTag(NEWS_CACHE_TAG);
  refresh();
}

/**
 * (Nice) 요약 모델 바꾸기: PIN이 맞을 때만, 목록에 있는 모델만 저장하고 앞으로 만드는 요약부터 적용된다.
 * (2026-09-18 보안 점검 뒤 PIN 추가 — 누구나 계속 바꿔 저장소 기록을 무한히 만드는 것을 막음)
 */
export async function setSummaryModel(
  model: unknown,
  pin: unknown,
): Promise<ModelActionResult> {
  const pinCheck = checkPin(pin);
  if (pinCheck !== "OK") {
    return { ok: false, error: pinCheck };
  }
  if (!isSummaryModel(model)) {
    return { ok: false, error: "INVALID_MODEL" };
  }
  try {
    // 이미 같은 모델이면 저장소에 커밋을 남기지 않는다 (다른 서버가 바꿨을 수 있어 새로 읽음)
    if ((await readSummaryModel({ fresh: true })) !== model) {
      await saveSummaryModel(model);
    }
  } catch (error) {
    console.error("[actions] 요약 모델 저장 실패:", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
  refresh();
  return { ok: true };
}

export type PushStatus = "MATCH" | "MISMATCH" | "UNKNOWN";

/**
 * 이 기기가 서버에 저장된 알림 받을 기기와 같은지 확인한다 (알림 상태 표시용).
 * 만료돼 서버에서 지워졌거나 다른 기기에서 켜서 바뀌었으면 MISMATCH.
 * 저장된 기기 정보는 돌려주지 않고 같은지 여부만 알려준다.
 */
export async function checkPushStatus(endpoint: unknown): Promise<PushStatus> {
  if (typeof endpoint !== "string" || endpoint.length > 2048) {
    return "UNKNOWN";
  }
  try {
    const stored = await readSubscription();
    return stored?.endpoint === endpoint ? "MATCH" : "MISMATCH";
  } catch (error) {
    console.error("[actions] 기기 정보 읽기 실패:", error);
    return "UNKNOWN";
  }
}

/** 알림 켜기: PIN이 맞으면 이 기기의 구독 정보를 저장소에 저장한다 */
export async function subscribe(
  subscription: unknown,
  pin: unknown,
): Promise<PushActionResult> {
  const pinCheck = checkPin(pin);
  if (pinCheck !== "OK") {
    return { ok: false, error: pinCheck };
  }
  const parsed = parseSubscription(subscription);
  if (!parsed) {
    return { ok: false, error: "INVALID_SUBSCRIPTION" };
  }
  return save(parsed);
}

/** 알림 끄기: PIN이 맞으면 저장된 구독 정보를 지운다 */
export async function unsubscribe(pin: unknown): Promise<PushActionResult> {
  const pinCheck = checkPin(pin);
  if (pinCheck !== "OK") {
    return { ok: false, error: pinCheck };
  }
  return save(null);
}

async function save(
  subscription: Parameters<typeof saveSubscription>[0],
): Promise<PushActionResult> {
  try {
    await saveSubscription(subscription);
    return { ok: true };
  } catch (error) {
    console.error("[actions] 구독 정보 저장 실패:", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}
