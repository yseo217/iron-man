"use client";

import { useTransition } from "react";
import { refreshNews } from "@/app/actions";

export function RefreshButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => refreshNews())}
      disabled={isPending}
      className="shrink-0 rounded-full bg-emerald-600 px-3.5 py-1 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
    >
      {isPending ? "불러오는 중…" : "새로고침 ↻"}
    </button>
  );
}
