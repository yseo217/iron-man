import Link from "next/link";

/** 굵은 칸 제목 + 옆의 "전체 보기" 링크 */
export function SectionTitle({
  id,
  title,
  moreHref,
  moreLabel,
}: {
  id: string;
  title: string;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b-2 border-navy pb-2 dark:border-white/30">
      <h2 id={id} className="text-2xl font-black tracking-tight">
        {title}
      </h2>
      {moreHref && moreLabel && (
        <Link
          href={moreHref}
          className="text-sm font-bold text-brand-red underline underline-offset-4 hover:text-brand-red-dark dark:text-red-400"
        >
          {moreLabel}
        </Link>
      )}
    </div>
  );
}
