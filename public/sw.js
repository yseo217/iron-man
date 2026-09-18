// Design Ref: §6.7 — 알림을 받아 띄우고, 누르면 앱의 기사 화면을 연다 (docs/nextjs16-notes.md §5)
// 받는 알림 내용 모양: { title, body, url: "/articles/기사번호", tag: "기사번호" }

const DEFAULT_TITLE = "IRON MAN";
const DEFAULT_BODY = "새 AI·반도체 주요 기사가 도착했어요";
const ICON = "/icons/icon-192.png";

self.addEventListener("install", () => {
  // 새 버전이 바로 적용되게 한다
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const title = typeof data.title === "string" && data.title ? data.title : DEFAULT_TITLE;
  const options = {
    body: typeof data.body === "string" && data.body ? data.body : DEFAULT_BODY,
    icon: ICON,
    // 같은 기사 알림은 겹쳐 쌓이지 않고 바뀐다
    tag: typeof data.tag === "string" && data.tag ? data.tag : undefined,
    data: { url: safeAppPath(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safeAppPath(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(openOrFocus(url));
});

function readPayload(event) {
  if (!event.data) {
    return {};
  }
  try {
    const data = event.data.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return { body: event.data.text() };
  }
}

/** 우리 앱 안의 주소만 연다. 다른 사이트 주소면 메인 화면으로 */
function safeAppPath(value) {
  if (typeof value !== "string") {
    return "/";
  }
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

/**
 * 앱이 이미 열려 있으면 그 창에서 기사 화면으로 이동하고, 없으면 새 창을 연다.
 * 이 서비스 워커가 아직 맡지 않은 창은 이동(navigate)이 거절되므로, 그때는 새 창으로 연다.
 */
async function openOrFocus(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (existing) {
    try {
      const moved = await existing.navigate(url);
      if (moved) {
        return moved.focus();
      }
    } catch {
      // 아래에서 새 창으로 연다
    }
  }
  return self.clients.openWindow(url);
}
