"use client";
// (Nice) 영상 재생 칸. 자막을 한국어 → 영어(자동 자막 포함) 순서로 골라 자동으로 켠다

import Script from "next/script";
import { useRef } from "react";

/** 유튜브 플레이어가 알려주는 자막 한 줄의 정보 (필요한 것만) */
interface CaptionTrack {
  languageCode: string;
  kind?: string;
}

interface YouTubePlayer {
  getOption(module: "captions", option: "tracklist"): CaptionTrack[] | undefined;
  setOption(module: "captions", option: "track", value: CaptionTrack): void;
}

interface YouTubeApi {
  Player: new (
    element: HTMLIFrameElement,
    options: { events: { onApiChange: () => void } },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// 자막을 켠 채로 시작(cc_load_policy), 한국어 우선(cc_lang_pref), 메뉴는 한국어(hl), 아래 스크립트로 조작 허용(enablejsapi)
const PLAYER_PARAMS = new URLSearchParams({
  cc_load_policy: "1",
  cc_lang_pref: "ko",
  hl: "ko",
  enablejsapi: "1",
}).toString();

/** 한국어 → 사람이 만든 영어 자막 → 영어 자동 자막 → 아무 자막 순서로 고른다 */
export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const isLang = (track: CaptionTrack, code: string) =>
    track.languageCode === code || track.languageCode.startsWith(`${code}-`);
  return (
    tracks.find((track) => isLang(track, "ko")) ??
    tracks.find((track) => isLang(track, "en") && track.kind !== "asr") ??
    tracks.find((track) => isLang(track, "en")) ??
    tracks[0]
  );
}

export function VideoPlayer({ id, title }: { id: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function attachPlayer() {
    const iframe = iframeRef.current;
    if (!iframe || !window.YT?.Player || iframe.dataset.captionReady) {
      return;
    }
    iframe.dataset.captionReady = "1";
    let applied = false;
    const player = new window.YT.Player(iframe, {
      events: {
        // 영상이 재생되어 자막 목록이 준비되면 한 번만 자막을 고른다 (그 뒤에 사용자가 끄면 그대로 둔다)
        onApiChange: () => {
          if (applied) {
            return;
          }
          const track = pickCaptionTrack(player.getOption("captions", "tracklist") ?? []);
          if (track) {
            applied = true;
            player.setOption("captions", "track", track);
          }
        },
      },
    });
  }

  return (
    <>
      <iframe
        ref={iframeRef}
        src={`https://www.youtube-nocookie.com/embed/${id}?${PLAYER_PARAMS}`}
        title={title}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="size-full"
      />
      <Script
        src="https://www.youtube.com/iframe_api"
        strategy="lazyOnload"
        onReady={() => {
          if (window.YT?.Player) {
            attachPlayer();
            return;
          }
          // 스크립트가 아직 준비 중이면, 준비됐다는 신호를 받은 뒤 연결한다
          const previous = window.onYouTubeIframeAPIReady;
          window.onYouTubeIframeAPIReady = () => {
            previous?.();
            attachPlayer();
          };
        }}
      />
    </>
  );
}
