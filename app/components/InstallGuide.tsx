"use client";
// Design Ref: §6.6 — 아이폰이고 아직 홈 화면에 추가하지 않았을 때만 설치 방법 안내

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

function needsInstallGuide(): boolean {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const isInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIOS && !isInstalled;
}

export function InstallGuide() {
  const show = useSyncExternalStore(noopSubscribe, needsInstallGuide, () => false);
  if (!show) {
    return null;
  }
  return (
    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      아이폰은 홈 화면에 추가해야 알림을 받을 수 있어요. Safari 아래쪽{" "}
      <strong>공유 버튼</strong> → <strong>홈 화면에 추가</strong>를 누른 뒤, 추가된 앱에서
      알림을 켜 주세요.
    </p>
  );
}
