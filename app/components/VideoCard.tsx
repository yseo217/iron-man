// Design Ref: §6.1 — (Nice) 오늘의 주요 영상 칸
import { VideoPlayer } from "@/app/components/VideoPlayer";
import type { NewsVideo } from "@/lib/types";

const viewsFormat = new Intl.NumberFormat("ko-KR", { notation: "compact" });
const dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 영상을 못 가져왔을 때: 칸을 작게 남겨 메뉴의 "영상" 링크가 갈 곳이 있게 한다 */
export function NoVideoCard() {
  return (
    <section
      id="video"
      aria-labelledby="top-video-heading"
      className="rounded-md border-l-4 border-brand-red bg-navy px-5 py-4 shadow-md"
    >
      <h2
        id="top-video-heading"
        className="text-xs font-black uppercase tracking-widest text-red-300"
      >
        오늘의 주요 영상
      </h2>
      <p className="mt-1.5 text-sm text-white/70">
        지금은 보여줄 영상이 없어요. 잠시 후 다시 확인해 주세요.
      </p>
    </section>
  );
}

export function VideoCard({ video }: { video: NewsVideo }) {
  return (
    <section
      id="video"
      aria-labelledby="top-video-heading"
      className="overflow-hidden rounded-md bg-navy shadow-md"
    >
      <div className="aspect-video w-full bg-black">
        <VideoPlayer id={video.id} title={video.title} />
      </div>
      <div className="flex flex-col gap-1.5 border-l-4 border-brand-red px-5 py-4">
        <h2
          id="top-video-heading"
          className="text-xs font-black uppercase tracking-widest text-red-300"
        >
          오늘의 주요 영상
        </h2>
        <p lang="en" className="text-lg font-extrabold leading-snug text-white">
          {video.title}
        </p>
        <p className="text-sm text-white/60">
          {video.channel} · 조회수 {viewsFormat.format(video.views)}회 ·{" "}
          <time dateTime={video.publishedAt}>
            {dateTimeFormat.format(new Date(video.publishedAt))}
          </time>
        </p>
      </div>
    </section>
  );
}
