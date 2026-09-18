# Next.js 16 확인 메모 (PLAN 2번 작업)

> 설치된 Next.js **16.3.5**의 문서(`node_modules/next/dist/docs/01-app/`)만 보고 정리했다.
> 아래 경로는 모두 이 폴더 기준이다. 확인일: 2026-09-17 · 환경: Node.js 24.19.0

## 한 줄 요약

- 화면 주소의 번호(`params`)는 **`await`로 꺼내야** 한다 (예전 방식은 오류).
- 캐시는 **기본 방식**(설정 변경 없음)으로 `fetch`에 `revalidate: 600`과 태그를 붙이고, 새로고침 버튼은 Server Action에서 `updateTag`를 부른다.
- 알림용 서비스 워커는 `public/sw.js`, 앱 정보는 `app/manifest.ts`, 테마 색은 `viewport`에 둔다.
- GitHub Actions 스크립트는 `.env`를 자동으로 못 읽으므로 `@next/env`의 `loadEnvConfig`를 쓴다.

---

## 1. 화면과 주소

| 항목 | 16에서의 방식 | 근거 |
|------|--------------|------|
| 주소의 번호 읽기 | `params`는 Promise. `PageProps<'/articles/[id]'>`로 타입을 주고 `const { id } = await props.params` | `03-api-reference/03-file-conventions/page.md:13-14, 125-141`, `02-guides/upgrading/version-16.md:283-308` |
| 실행 중에만 아는 번호 | `generateStaticParams` 없이 두면 요청 때 화면을 만든다 (`dynamicParams` 기본값 `true`) | `03-file-conventions/02-route-segment-config/dynamicParams.md:16-22` |
| 없는 기사 | `next/navigation`의 `notFound()` 호출. **`try/catch` 안에서 부르면 동작하지 않음** | `04-functions/not-found.md:13, 17-40, 79` |
| 없음 화면 꾸미기 | 해당 폴더에 `not-found.tsx` (props 없음) | `03-file-conventions/not-found.md:15-41, 131` |
| 서버/화면 구분 | 기본은 서버에서 그림. 버튼 등 브라우저 동작이 필요한 파일만 맨 위에 `'use client'` | `01-getting-started/05-server-and-client-components.md` |
| `middleware` | 16에서 이름이 `proxy`로 바뀜 (이 앱은 사용 안 함) | `version-16.md:612-635` |

## 2. 캐시 (결과를 잠깐 저장해 다시 쓰기)

16에는 두 가지 방식이 있다.

| 방식 | 켜는 법 | 특징 |
|------|--------|------|
| **기본 방식** (지금 프로젝트) | 설정 없음 | `fetch`는 기본적으로 저장하지 않음. 필요한 곳에 `next: { revalidate, tags }`를 붙인다 |
| Cache Components | `next.config.ts`에 `cacheComponents: true` | `'use cache'` + `cacheLife`로 저장. 저장 안 한 데이터는 `<Suspense>`로 감싸야 하고, 어기면 빌드 오류 |

근거: `02-guides/caching-without-cache-components.md:7, 11`, `05-config/01-next-config-js/cacheComponents.md:12-26`, `version-16.md:1236`

**이 앱의 선택: 기본 방식** (설정 파일을 바꾸지 않고, 규칙이 적어 초보자가 다루기 쉬움)

| 할 일 | 방법 | 근거 |
|------|------|------|
| 구글 뉴스 결과를 10분 저장 | `fetch(url, { next: { revalidate: 600, tags: ['news'] } })` | `caching-without-cache-components.md:153, 205` |
| 새로고침 버튼으로 즉시 새 결과 | 버튼 → Server Action 안에서 `updateTag('news')` (다음 요청이 새 데이터를 기다림) | `04-functions/updateTag.md:12-16, 28-31` |
| 기사 화면은 항상 최신 | GitHub API `fetch`에 `cache: 'no-store'` | `04-functions/fetch.md:53` |
| 쓰지 않을 것 | `unstable_cache`(16에서 `'use cache'`로 대체됨), `unstable_noStore`(`connection()`으로 대체됨) | `04-functions/unstable_cache.md:6-8`, `04-functions/unstable_noStore.md:4-7` |

알아둘 점
- `revalidate` 없이 `fetch`하면 빌드할 때 한 번만 받아 **화면이 그대로 멈출 수 있다** → 반드시 `revalidate`를 붙인다 (`fetch.md:51`)
- `router.refresh()`만으로는 서버 저장 결과가 바뀌지 않는다 (`04-functions/use-router.md:46, 56`)
- `refresh()`(`next/cache`)와 `updateTag()`는 **Server Action 안에서만** 부를 수 있다 (`04-functions/refresh.md:13`, `updateTag.md:12`)
- `revalidateTag`는 16부터 두 번째 값이 필요하다: `revalidateTag('news', 'max')` (`version-16.md:444-451`)
- 나중에 Cache Components로 바꾸면 `'use cache'` + `cacheLife({ revalidate: 600, expire: 3600 })` + `cacheTag('news')`로 옮긴다 (`04-functions/cacheLife.md:120, 218-229`)

## 3. Server Actions (버튼을 누르면 서버에서 하는 일)

| 항목 | 방식 | 근거 |
|------|------|------|
| 파일 | `app/actions.ts` 맨 위에 `'use server'` → 내보낸 함수가 모두 서버 동작 | `01-getting-started/07-mutating-data.md:38` |
| 부르는 법 | 화면(`'use client'`)에서 직접 `await subscribe(...)` 하거나 `<form action>` / `useActionState` 사용 | `07-mutating-data.md:283-305, 344-352`, `02-guides/forms.md:190-240` |
| 구독 정보 넘기기 | `JSON.parse(JSON.stringify(sub))`로 바꿔서 전달 | `02-guides/progressive-web-apps.md:179-180` |
| 돌려주는 값 | 화면에 필요한 최소한만 (`{ ok, error }`) | `03-api-reference/01-directives/use-server.md:194` |
| 순서 | 같은 화면의 서버 동작은 하나씩 차례로 실행됨 | `02-guides/server-actions.md:28-30` |

**보안 (중요)**
- 서버 동작은 **누구나 직접 호출할 수 있는 공개 주소**로 봐야 한다. 안에서 PIN과 구독 정보 모양을 매번 검사한다 (`server-actions.md:78, 90`, `02-guides/data-security.md:281`)
- Next.js가 요청 출처(Origin)를 확인하지만, **출처 정보가 없는 요청은 경고만 하고 통과**시킨다 → 실제 보호는 PIN 검사 (`05-config/01-next-config-js/serverActions.md:14`)
- 요청 크기 기본 한도 1MB (`server-actions.md:76-95`)
- 비싼 동작에는 횟수 제한을 권장 → PIN을 여러 번 틀리면 잠시 거절하는 장치가 필요 (`data-security.md:476`)
- 비밀 값을 읽는 파일에는 `import 'server-only'`를 넣어 화면 코드로 새지 않게 한다 (`data-security.md:243-270, 436`)

## 4. 환경 변수 (`.env`)

| 항목 | 내용 | 근거 |
|------|------|------|
| 읽는 순서 | `process.env` → `.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env` | `02-guides/environment-variables.md:266-276` |
| 서버 전용 | `NEXT_PUBLIC_`이 없는 값은 브라우저로 가지 않음 (PIN, GitHub 토큰, VAPID 비밀 키) | `environment-variables.md:156` |
| 브라우저용 | `NEXT_PUBLIC_` 값은 **빌드할 때 코드에 박힌다** → VAPID 공개 키를 바꾸면 다시 빌드해야 함 | `environment-variables.md:158-170` |
| 스크립트에서 | Next.js 밖에서 실행하는 스크립트는 `.env`를 자동으로 못 읽음 → `import { loadEnvConfig } from '@next/env'; loadEnvConfig(process.cwd())` (GitHub Actions에서는 Secrets가 환경 변수로 들어오므로 없어도 됨) | `environment-variables.md:81-116` |

## 5. 앱 설정과 알림 (PWA)

| 항목 | 방식 | 근거 |
|------|------|------|
| 앱 정보 | `app/manifest.ts` → `MetadataRoute.Manifest` 반환 (`name`, `short_name`, `start_url`, `display: 'standalone'`, `theme_color`, `icons`) | `03-file-conventions/01-metadata/manifest.md:6, 22-44` |
| 홈 화면 아이콘 | 앱 정보용 PNG는 `public/`에 둔다 (192px, 512px) | `02-guides/progressive-web-apps.md:40-45, 82` |
| 아이폰 아이콘 | `app/apple-icon.png`를 두면 `apple-touch-icon`이 자동으로 붙는다 | `01-metadata/app-icons.md:22-26, 54-59` |
| 서비스 워커 | **`public/sw.js`** 로 두고 `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })` (문서의 `/sw.js` 헤더 예시와 맞는 방식) | `progressive-web-apps.md:159-165, 635-650` |
| 알림 발송 도구 | `web-push` 패키지, `webpush.setVapidDetails(연락처, 공개키, 비밀키)` | `progressive-web-apps.md:414-460` |
| 키 만들기 | `web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `progressive-web-apps.md:516-549` |
| 알림 누르면 | 서비스 워커 `notificationclick`에서 `clients.openWindow(주소)` | `progressive-web-apps.md:573-577` |
| 아이폰 조건 | iOS 16.4 이상 + **홈 화면에 추가한 앱**에서만 알림 가능 | `progressive-web-apps.md:88, 306-356` |
| 설치 조건 | 앱 정보 파일 + HTTPS. 직접 만든 "설치" 버튼(`beforeinstallprompt`)은 권장하지 않음 | `progressive-web-apps.md:592-597` |
| PC에서 시험 | `next dev --experimental-https` (https://localhost:3000, 개발용 인증서 자동 생성) | `03-api-reference/06-cli/next.md:72-75, 340-354` |
| 테마 색 | `metadata`가 아니라 **`export const viewport: Viewport = { themeColor }`** (metadata 쪽은 16에서 사용 중단) | `04-functions/generate-viewport.md:78-82`, `04-functions/generate-metadata.md:654` |
| 아이폰 앱 모양 | `metadata.appleWebApp` (`title`, `statusBarStyle`) | `generate-metadata.md:779-806` |
| 보안 헤더 | `next.config.ts`의 `headers()`: 전체에 `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` / `/sw.js`에 `Cache-Control: no-cache, no-store, must-revalidate`와 CSP | `progressive-web-apps.md:614-666`, `05-config/01-next-config-js/headers.md:34, 43` |
| `public/` 캐시 | 기본 `Cache-Control: public, max-age=0` | `03-file-conventions/public-folder.md:27-31` |
| 오프라인 기능 | 이 앱에는 필요 없음 (실험 기능) | `02-guides/offline-support.md:38-50, 139` |

## 6. 빌드·검사·배포

| 항목 | 내용 | 근거 |
|------|------|------|
| 최소 버전 | Node.js 20.9 이상 (현재 24.19.0 ✅), TypeScript 5.1 이상 | `version-16.md:118-124` |
| 기본 빌드 도구 | Turbopack (개발·빌드 모두) | `version-16.md:126-128` |
| 코드 검사 | `next build`가 더 이상 검사하지 않음 → 검증 루프대로 `npm run lint`를 따로 실행 | `version-16.md:1082-1114` |
| Vercel | 공식 검증된 배포 대상. 정적 내보내기(static export)는 Server Actions를 못 쓰므로 사용 안 함 | `01-getting-started/17-deploying.md:84`, `progressive-web-apps.md:673` |

---

## 구현 때 설계서(DESIGN.md)와 맞춰볼 점

설계 방향은 그대로 유효하다. 아래는 구현하면서 설계서에 반영하면 좋은 세부 사항이다.

1. **캐시 방식**: 설계서의 "Next.js 캐시 기능"을 "기본 방식: `fetch` + `revalidate: 600` + `tags: ['news']`, 새로고침은 `updateTag`"로 구체화
2. **새로고침 버튼**: 화면만 다시 그리는 방식(`router.refresh()`)이 아니라 Server Action(`refreshNews`)으로 동작해야 함 → 설계서 5장 서버 기능에 1개 추가
3. **아이콘 위치**: 앱 정보용 PNG는 `public/`, 아이폰용은 `app/apple-icon.png` 추가
4. **테마 색**: `app/layout.tsx`에서 `viewport` 로 따로 내보냄
5. **PIN 보호 강화**: PIN을 여러 번 틀리면 잠시 거절 (문서 권장 사항)
6. **스크립트 환경 변수**: PC에서 `npm run notify` 할 때는 `@next/env`의 `loadEnvConfig`로 `.env`를 읽음 (`@next/env`는 Next.js와 함께 이미 설치돼 있음 ✅ — 다만 `package.json`에 직접 적혀 있지 않아, 구현 때 정식으로 추가할지 사용자에게 물어봄)
7. **비밀 값 파일 보호**: `lib/store/github-store.ts`, `lib/push/send.ts`, `app/actions.ts`에 `import 'server-only'` (`server-only` 패키지는 설치돼 있지 않음 → 구현 때 설치할지 사용자에게 물어봄)
