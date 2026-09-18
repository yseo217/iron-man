// Design Ref: §6.6 — (Nice) 한국어 요약과 새 기술 쉬운 설명
import type { KoreanSummary } from "@/lib/types";

export function SummaryDetails({ ko }: { ko: KoreanSummary }) {
  const lines = ko.summary.split("\n").filter(Boolean);
  return (
    <div className="flex flex-col gap-2">
      {lines.length > 1 ? (
        // 3줄 요약: 한 줄씩 번호를 붙여 보여준다
        <ol className="flex flex-col gap-1.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {lines.map((line, index) => (
            <li key={index} className="flex gap-2">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-black text-white dark:bg-brand-red"
              >
                {index + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      ) : (
        // 예전에 만든 1~2문장 요약은 그대로 한 문단으로
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{ko.summary}</p>
      )}
      {ko.techNote && (
        <p className="border-l-4 border-navy bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-800 dark:border-red-400 dark:bg-white/5 dark:text-slate-200">
          <span className="font-semibold">💡 쉬운 설명 </span>
          {ko.techNote}
        </p>
      )}
    </div>
  );
}

// 자리표시 줄 길이: 완성된 3줄 요약처럼 보이게 조금씩 다르게
const PLACEHOLDER_WIDTHS = ["w-11/12", "w-4/5", "w-2/3"];

/**
 * 요약을 기다리는 동안: 완성된 3줄 요약과 같은 모양의 회색 자리표시 + 걸리는 시간 안내.
 * 요약이 들어와도 카드 높이가 크게 바뀌지 않고, 얼마나 기다리면 되는지 알 수 있다.
 */
export function SummaryLoading() {
  return (
    <div role="status" className="flex flex-col gap-2">
      <ol aria-hidden className="flex flex-col gap-1.5 motion-safe:animate-pulse">
        {PLACEHOLDER_WIDTHS.map((width, index) => (
          <li key={width} className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-black text-zinc-400 dark:bg-white/10 dark:text-zinc-500">
              {index + 1}
            </span>
            <span className={`h-3.5 rounded bg-zinc-200 dark:bg-white/10 ${width}`} />
          </li>
        ))}
      </ol>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        한국어 3줄 요약을 만드는 중이에요 · 새 기사는 보통 30초~1분 걸려요
      </p>
    </div>
  );
}
