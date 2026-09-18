"use client";
// (Nice) 한국어 요약에 쓸 AI 모델 고르기 — PIN을 넣고 고르면 앞으로 만드는 요약부터 적용

import { useOptimistic, useState, useTransition } from "react";
import { setSummaryModel, type ModelActionResult } from "@/app/actions";
import { SUMMARY_MODELS, type SummaryModel } from "@/lib/summary/models";

type ModelError = Extract<ModelActionResult, { ok: false }>["error"] | "NETWORK";

const ERROR_TEXT: Record<ModelError, string> = {
  PIN_NOT_SET: "서버에 PIN이 설정되지 않았어요",
  PIN_MISMATCH: "PIN이 맞지 않아요",
  LOCKED: "PIN을 여러 번 틀려서 10분 동안 잠겼어요",
  INVALID_MODEL: "고를 수 없는 모델이에요",
  SAVE_FAILED: "저장하지 못했어요. 잠시 후 다시 시도해 주세요",
  NETWORK: "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요",
};

export function ModelSelector({ current }: { current: SummaryModel }) {
  const [selected, setSelected] = useOptimistic(current);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function choose(model: SummaryModel) {
    if (model === selected || isPending) {
      return;
    }
    if (pin.length === 0) {
      setMessage("모델을 바꾸려면 PIN을 먼저 입력해 주세요");
      return;
    }
    startTransition(async () => {
      setMessage("");
      setSelected(model);
      // 서버에 닿지 못해도 오류 화면 대신 안내 문구를 띄운다 (실패하면 선택 표시는 원래대로 돌아감)
      const result: ModelActionResult | { ok: false; error: "NETWORK" } = await setSummaryModel(
        model,
        pin,
      ).catch((error) => {
        console.error("[model] 저장 요청 실패:", error);
        return { ok: false, error: "NETWORK" } as const;
      });
      if (result.ok) {
        setPin("");
        setMessage("저장했어요. 새 기사 요약부터 이 모델을 써요");
      } else {
        setMessage(ERROR_TEXT[result.error]);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="요약 AI 모델" className="grid grid-cols-2 gap-2">
        {SUMMARY_MODELS.map((model) => {
          const active = model.id === selected;
          return (
            <button
              key={model.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={isPending}
              onClick={() => choose(model.id)}
              className={`flex flex-col items-start gap-0.5 rounded-md border-2 px-3 py-2 text-left transition-colors disabled:cursor-wait ${
                active
                  ? "border-brand-red bg-brand-red text-white"
                  : "border-zinc-200 hover:border-navy dark:border-white/15 dark:hover:border-white/40"
              }`}
            >
              <span className="text-sm font-black">{model.label}</span>
              <span
                className={`text-xs ${active ? "text-white/80" : "text-zinc-500 dark:text-zinc-400"}`}
              >
                {model.note}
              </span>
            </button>
          );
        })}
      </div>
      <label htmlFor="model-pin" className="sr-only">
        모델 변경 PIN
      </label>
      <input
        id="model-pin"
        type="password"
        autoComplete="off"
        maxLength={64}
        placeholder="바꾸려면 PIN 입력"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
        disabled={isPending}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 dark:border-white/20 dark:bg-navy"
      />
      <p aria-live="polite" className="text-xs text-zinc-600 dark:text-zinc-400">
        {isPending ? "저장하는 중…" : message || "이미 만든 요약은 그대로 두고, 새 요약부터 적용돼요"}
      </p>
    </div>
  );
}
