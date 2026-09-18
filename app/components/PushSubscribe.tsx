"use client";
// Design Ref: §2.2 흐름 2, §6.6 — PIN 입력 + 알림 켜기/끄기

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import {
  checkPushStatus,
  subscribe,
  unsubscribe,
  type PushActionResult,
  type PushStatus,
} from "@/app/actions";

type Status = "checking" | "off" | "on";
type ActionError = Extract<PushActionResult, { ok: false }>["error"];

const ERROR_TEXT: Record<ActionError, string> = {
  PIN_NOT_SET: "서버에 PIN이 설정되지 않았어요",
  PIN_MISMATCH: "PIN이 맞지 않아요",
  LOCKED: "PIN을 여러 번 틀려서 10분 동안 잠겼어요",
  INVALID_SUBSCRIPTION: "이 기기의 알림 정보가 올바르지 않아요",
  SAVE_FAILED: "저장에 실패했어요. 잠시 후 다시 시도해 주세요",
};

const EXPIRED_TEXT =
  "이 기기의 알림이 서버에 없어요 (기기 정보가 만료됐거나 다른 기기에서 켰어요). PIN을 넣고 다시 켜 주세요";
const NETWORK_TEXT = "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요";

const noopSubscribe = () => () => {};

function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function registerWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
}

/** 공개 키 글자를 브라우저가 원하는 바이트 모양으로 바꾼다 (Next.js 공식 안내 방식) */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function PushSubscribe() {
  // 서버에서 그릴 때는 알 수 없으므로 null (확인 중)
  const supported = useSyncExternalStore(noopSubscribe, isPushSupported, () => null);
  const [status, setStatus] = useState<Status>("checking");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!supported) {
      return;
    }
    let cancelled = false;
    registerWorker()
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (existing): Promise<{ status: Status; note: string }> => {
        if (!existing) {
          return { status: "off", note: "" };
        }
        // 이 브라우저에 구독이 남아 있어도, 서버에서 지워졌거나(만료) 다른 기기로 바뀌었으면 꺼진 것으로 본다
        const server = await checkPushStatus(existing.endpoint).catch(
          (): PushStatus => "UNKNOWN",
        );
        return server === "MISMATCH"
          ? { status: "off", note: EXPIRED_TEXT }
          : { status: "on", note: "" };
      })
      .then(({ status: next, note }) => {
        if (!cancelled) {
          setStatus(next);
          setMessage(note);
        }
      })
      .catch((error) => {
        console.error("[push] 서비스 워커 등록 실패:", error);
        if (!cancelled) {
          setStatus("off");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  function turnOn() {
    startTransition(async () => {
      setMessage("");
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setMessage("알림 키가 설정되지 않았어요");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("알림 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요");
        return;
      }

      let subscription: PushSubscription;
      try {
        await registerWorker();
        const registration = await navigator.serviceWorker.ready;
        // 만료됐을 수 있는 예전 구독은 버리고 새로 받는다
        await (await registration.pushManager.getSubscription())?.unsubscribe();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      } catch (error) {
        console.error("[push] 구독 실패:", error);
        setMessage("이 기기에서 알림을 켜지 못했어요");
        return;
      }

      let result: PushActionResult;
      try {
        result = await subscribe(JSON.parse(JSON.stringify(subscription)), pin);
      } catch (error) {
        // 서버에 닿지 못했으면 이 기기만 켜진 상태가 되지 않도록 구독을 되돌린다
        console.error("[push] 서버 저장 요청 실패:", error);
        await subscription.unsubscribe().catch(() => {});
        setMessage(NETWORK_TEXT);
        return;
      }
      if (!result.ok) {
        // 서버에 저장하지 못했으면 이 기기의 구독도 되돌린다
        await subscription.unsubscribe();
        setMessage(ERROR_TEXT[result.error]);
        return;
      }
      setPin("");
      setStatus("on");
      setMessage("알림이 켜졌어요. 매일 오전 8시·오후 8시에 주요 기사가 와요");
    });
  }

  function turnOff() {
    startTransition(async () => {
      setMessage("");
      let result: PushActionResult;
      try {
        result = await unsubscribe(pin);
      } catch (error) {
        console.error("[push] 서버 끄기 요청 실패:", error);
        setMessage(NETWORK_TEXT);
        return;
      }
      if (!result.ok) {
        setMessage(ERROR_TEXT[result.error]);
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      await existing?.unsubscribe();
      setPin("");
      setStatus("off");
      setMessage("알림을 껐어요");
    });
  }

  if (supported === false) {
    return <p className="text-sm text-zinc-500">이 브라우저는 알림을 지원하지 않아요</p>;
  }

  const ready = supported === true && status !== "checking";
  const statusText =
    !ready ? "알림 상태를 확인하는 중…" : status === "on" ? "알림이 켜졌어요" : "알림이 꺼져 있어요";

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-bold">
        <span
          aria-hidden
          className={`size-2.5 rounded-full ${ready && status === "on" ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
        />
        {statusText}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (status === "on") {
            turnOff();
          } else {
            turnOn();
          }
        }}
      >
        <label htmlFor="push-pin" className="sr-only">
          PIN
        </label>
        <input
          id="push-pin"
          type="password"
          autoComplete="off"
          maxLength={64}
          placeholder="PIN 입력"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          disabled={!ready || isPending}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 dark:border-white/20 dark:bg-navy"
        />
        <button
          type="submit"
          disabled={!ready || isPending || pin.length === 0}
          className="shrink-0 rounded-md bg-brand-red px-4 py-2 text-sm font-bold text-white hover:bg-brand-red-dark disabled:opacity-50"
        >
          {isPending ? "처리 중…" : status === "on" ? "알림 끄기" : "알림 켜기"}
        </button>
      </form>
      {status === "on" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          알림은 마지막으로 켠 기기 한 곳으로만 가요.
        </p>
      )}
      <p aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
        {message}
      </p>
    </div>
  );
}
