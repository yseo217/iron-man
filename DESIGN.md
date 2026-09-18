# IRON MAN 설계서 (DESIGN)

> **요약**: 구글 뉴스 RSS의 AI·반도체 주요 기사 5건을 보여주고, 하루 2번 웹 푸시로 알려주는 Next.js 웹앱의 설계
>
> **프로젝트**: my-app (IRON MAN) · **버전**: 0.1.0 · **작성자**: Tony Stark · **작성일**: 2026-09-17 · **상태**: 초안
> **기준 문서**: [PRD.md](PRD.md) → [PLAN.md](PLAN.md)
> **선택한 설계안**: C — 실용 균형

---

## Context Anchor

> PLAN.md에서 그대로 가져온 내용이에요. 구현 중에도 이 방향을 지켜요.

| 항목 | 내용 |
|------|------|
| **WHY** | 비전문가가 중요한 AI·반도체 기사를 스스로 고르기 어렵다 |
| **WHO** | Tony Stark 1명 (로그인 없는 개인용) |
| **RISK** | GitHub Actions 예약 실행 지연, 아이폰은 홈 화면에 추가해야 알림 수신, 기기 정보가 저장소에 들어가므로 저장소 공개 금지 |
| **SUCCESS** | 화면에 기사 5건 표시, 하루 2회 알림 5건 도착, 중복 기사 제외 |
| **SCOPE** | 1단계 기반 준비 → 2단계 실시간 화면 → 3단계 앱 설정·알림 → 4단계 Nice 기능 → 5단계 최종 확인 |

---

## 1. 개요

### 1.1 설계 목표

- 앱 화면과 자동 알림이 **같은 기사 고르기 코드**를 함께 쓴다 (한 곳만 고치면 둘 다 바뀜)
- 데이터베이스 없이 **비공개 GitHub 저장소의 파일**만으로 저장한다
- Part 5에서 **Vercel에 그대로 배포**할 수 있게 Next.js 기본 기능만으로 화면과 서버 기능을 만든다

### 1.2 설계 원칙

- 새 도구는 꼭 필요한 것만 쓴다 (아래 3장 "기술 선택")
- 데이터 읽기·쓰기는 한 파일(`lib/store/github-store.ts`)에서만 한다
- 실패해도 화면이 멈추지 않게, 항상 "없음/실패" 안내를 보여준다

---

## 2. 전체 구조

### 2.1 구성도

```
┌──────────────── 휴대폰 / PC 브라우저 ────────────────┐
│  메인 화면 · 기사 화면 · 지난 기사 화면(Nice)            │
│  서비스 워커(sw.js): 알림 표시, 누르면 기사 화면 열기     │
└───────────▲───────────────────────────┬──────────────┘
            │ 화면 요청                  │ 알림 켜기(기기 정보 + PIN)
┌───────────┴───────────────────────────▼──────────────┐
│  Next.js 앱 (지금은 내 PC, Part 5부터 Vercel)          │
│  app/  화면 · Server Actions                          │
│  lib/  기사 가져오기 · 5건 고르기 · 저장 · 알림 · 요약     │
└───────┬──────────────────┬──────────────────┬────────┘
        │                  │                  │
   구글 뉴스 RSS      GitHub 저장소 파일     OpenAI (Nice)
        ▲                  ▲                  ▲
        │                  │                  │
┌───────┴──────────────────┴──────────────────┴────────┐
│  GitHub Actions (매일 08:00 · 20:00 한국시간)           │
│  scripts/send-notifications.ts — lib/ 코드를 그대로 사용 │
└──────────────────────────┬───────────────────────────┘
                           │ 웹 푸시 알림 5건
                           ▼
                    휴대폰 / PC 알림
```

### 2.2 데이터 흐름 (입력 → 처리 → 출력)

**흐름 1. 실시간 인기 기사 보기 (Must)**

| 단계 | 내용 |
|------|------|
| 입력 | 앱을 열거나 "새로고침" 버튼을 누름 |
| 처리 | ① 구글 뉴스 RSS에 AI 검색(기간 제한 없음)과 반도체 검색(최근 1일)을 동시에 요청 → ② 받은 글(XML)을 기사 목록으로 변환 → ③ AI 상위 3건 + 반도체 상위 2건 선택 (모자라면 다른 쪽으로 채움, 같은 기사는 한 번만). 구글 뉴스 응답은 10분 동안 재사용 → ④ (Nice) 한국어 요약은 화면을 열 때마다 `data/summaries.json`을 새로 읽어 붙인다. 없는 기사만 요약하는데, 저장소에 "요약 중" 표시(`pending`)를 먼저 남긴 쪽만 요약하고(서버가 여러 대여도 한 번만), 끝나면 저장 직전의 최신 파일에 합쳐 저장한다. 다른 쪽이 요약 중이면 최대 30초 기다렸다 읽는다 (5분 넘은 표시는 멈춘 것으로 보고 무시) |
| 출력 | 메인 화면에 기사 카드 5장. 기사가 없거나 읽기에 실패하면 "지금 새 기사가 없어요" |

**흐름 2. 알림 켜기 (Must)**

| 단계 | 내용 |
|------|------|
| 입력 | 메인 화면 "알림 켜기" 버튼 + 내 PIN 입력 → 브라우저 알림 허용 |
| 처리 | ① 서비스 워커 등록 → ② 브라우저가 기기 정보(구독 정보) 발급 → ③ Server Action이 PIN 확인 → ④ `data/subscription.json`에 GitHub API로 저장 |
| 출력 | "알림이 켜졌어요" 표시. PIN이 틀리면 "PIN이 맞지 않아요". 화면을 열 때 이 기기의 구독이 서버에 저장된 기기와 같은지 확인(`checkPushStatus`)해서, 만료로 지워졌거나 다른 기기로 바뀌었으면 "알림이 꺼져 있어요" + 다시 켜기 안내. 다시 켤 때는 예전 구독을 버리고 새로 받는다 |

**흐름 3. 12시간마다 알림 (Must)**

| 단계 | 내용 |
|------|------|
| 입력 | GitHub Actions 예약 실행 (UTC 23:00 = 한국 08:00, UTC 11:00 = 한국 20:00) 또는 직접 실행 |
| 처리 | ① `data/sent-articles.json`에서 이미 보낸 기사 번호 읽기 → ② 구글 뉴스 RSS 검색 (AI·반도체 각각, 둘 다 읽기에 실패하면 실패로 끝냄) → ③ 최근 90일 안에 보낸 기사를 빼고 AI 3건 + 반도체 2건 선택 (5건 미만이면 있는 만큼) → ④ 새 기사가 0건이면 여기서 종료 → ⑤ (Nice) 한국어 요약 (저장된 요약 재사용) → ⑥ `data/subscription.json`의 기기로 기사마다 알림 1건씩 발송 (실패 시 5초 뒤 1번 다시 시도) → ⑦ 보낸 기사와 실패 기록을 `data/sent-articles.json`의 최신 내용에 더해 저장 |
| 출력 | 알림 최대 5건 도착. 알림을 누르면 `/articles/{기사번호}` 화면이 열림. GitHub Actions 실행 기록에 회차 결과 요약(발송 수 / 건너뜀과 이유 / 실패 수) — PRD 운영 지표 판단에 사용 |

**흐름 5. 주요 뉴스 영상 (Nice)**

| 단계 | 내용 |
|------|------|
| 입력 | 메인 화면을 열 때 (기사와 동시에) |
| 처리 | ① 뉴스 채널 6곳의 유튜브 RSS를 동시에 요청 (성공한 채널 응답만 12시간 저장, 실패는 저장하지 않아 다음 화면 갱신 때 다시 시도) → ② 최근 2일 안에 올라온 영상 중 제목에 AI·반도체 단어가 있는 것만 남김 (설명글까지 보면 관련 없는 영상이 섞임) → ③ 조회수가 가장 많은 1개 선택 (일반 영상 우선, 없으면 세로형 짧은 영상) |
| 출력 | 기사 목록 위에 영상 재생 칸(youtube-nocookie 주소) + 영상 제목·채널·조회수. 재생하면 유튜브 공식 플레이어 스크립트로 자막을 자동으로 켠다 (한국어 → 영어 → 영어 자동 자막 → 아무 자막 순). 고를 영상이 없으면 칸을 숨김 |

**흐름 4. 기사 화면 / 지난 기사 보기**

| 단계 | 내용 |
|------|------|
| 입력 | 알림을 누르거나, 지난 기사 목록(Nice)에서 기사를 누름 |
| 처리 | `data/sent-articles.json`을 GitHub API로 읽어 해당 기사 찾기 (서버마다 60초 동안 읽은 내용을 다시 씀) |
| 출력 | 기사 화면 또는 목록 화면. 기사가 없으면 "기사를 찾을 수 없어요" + 메인으로 가기 |

---

## 3. 기술 선택

### 3.1 기본 (고정)

| 기술 | 쉬운 설명 |
|------|----------|
| **Next.js 16** (TypeScript, Tailwind CSS, App Router) | 화면과 서버 기능을 한 프로젝트로 만드는 기본 틀. Vercel에 그대로 올릴 수 있음 |
| Next.js 앱 정보 파일 (`app/manifest.ts`) | 휴대폰 홈 화면에 앱처럼 추가되게 해주는 Next.js 기본 기능 |
| Server Actions | 버튼을 눌렀을 때 서버에서 일을 처리해주는 Next.js 기본 기능 (별도 서버 불필요) |
| Next.js 캐시 기능 | 같은 결과를 잠깐 저장해뒀다가 다시 써서, 구글 뉴스·OpenAI를 너무 자주 부르지 않게 함 (정확한 사용법은 구현 때 설치된 16 문서로 확인) |

### 3.2 추가로 제안하는 기술

| 기술 | 쉬운 설명 | 필요한 이유 | 구분 |
|------|----------|------------|------|
| **web-push** | 휴대폰·브라우저로 알림을 보내주는 도구 | Next.js 공식 안내가 쓰는 알림 발송 도구 | Must |
| **fast-xml-parser** | 구글 뉴스가 주는 RSS 글(XML)을 기사 목록으로 바꿔주는 도구 | RSS는 사람이 읽기 어려운 형식이라 변환이 필요 | Must |
| **tsx** | 알림 스크립트를 GitHub Actions에서 바로 실행해주는 도구 | 앱 코드와 같은 형식(TypeScript)의 스크립트를 그대로 돌리기 위해 | Must |
| **GitHub Actions** | 정해진 시간에 GitHub가 대신 프로그램을 실행해주는 기능 | 내 PC가 꺼져 있어도 하루 2번 알림을 보내기 위해 (설치 불필요) | Must |
| **GitHub API** | 프로그램이 저장소 파일을 읽고 쓰게 해주는 GitHub 기능 | Vercel 서버는 파일을 직접 저장할 수 없어서 (설치 불필요, `.env`의 `GITHUB_TOKEN` 사용) | Must |
| **openai** | OpenAI에 한국어 요약을 부탁할 때 쓰는 공식 연결 도구 | 한국어 요약·쉬운 설명 | Nice |

> CLAUDE.md 규칙에 따라 위 도구들은 **설치 전에 한 번 더 확인**받는다.
> 데이터베이스, 로그인 도구, 화면 꾸미기 라이브러리는 쓰지 않는다.

---

## 4. 데이터 모양

### 4.1 기사

```typescript
interface Article {
  id: string;          // 원문 링크로 만든 고유 번호 (12자리)
  rank: number;        // 1~5 순위
  title: string;       // 원문 제목 (영어)
  link: string;        // 원문 주소
  source: string;      // 매체 이름 (예: Reuters)
  publishedAt: string; // 발행 시각
  ko?: KoreanSummary;  // (Nice) 한국어 요약
}

interface KoreanSummary {
  title: string;       // 한국어 제목
  summary: string;     // 3줄 요약 (줄바꿈으로 구분, 예전 요약은 1~2문장 한 덩어리)
  techNote?: string;   // 새 기술이 나오면 쉬운 설명 한 줄
}
```

**뉴스 영상 (Nice)** — 저장 파일 없이 화면에서만 쓴다

```typescript
interface NewsVideo {
  id: string;          // 유튜브 영상 번호 (11자리)
  title: string;       // 영상 제목 (영어)
  channel: string;     // 채널 이름 (예: CNBC)
  publishedAt: string; // 올린 시각
  views: number;       // 조회수 (RSS 기준)
}
```

### 4.2 저장 파일 (비공개 GitHub 저장소 `data/` 폴더)

**`data/sent-articles.json`** — 보낸 기사 기록 (중복 확인 + 기사 화면 + 지난 기사 목록)

```typescript
interface SentArticlesFile {
  updatedAt: string;
  batches: {
    sentAt: string;            // 발송 시각
    slot: "morning" | "evening";
    articles: Article[];       // 보낸 기사 (최대 5건)
    failures: { articleId: string; reason: string }[]; // 실패 기록
  }[];                         // 최근 90일치만 보관
}
```

**`data/summaries.json`** — (Nice) 한국어 요약 저장소 (같은 기사를 다시 요약하지 않기 위해)

```typescript
interface SummariesFile {
  updatedAt: string;
  items: Record<string, KoreanSummary & { createdAt: string }>; // 기사 번호 → 요약, 최근 90일치만 보관
  pending?: Record<string, string>; // 지금 요약 중인 기사 번호 → 시작 시각 (5분 넘으면 무시·정리)
}
```

**`data/settings.json`** — (Nice) 화면에서 고른 설정

```typescript
interface SettingsFile {
  updatedAt: string | null;
  summaryModel: "gpt-5.5" | "gpt-5.4-mini"; // 새 요약에 쓸 모델 (파일이 없으면 OPENAI_MODEL → gpt-5.5)
}
```

**`data/subscription.json`** — 알림 받을 기기 정보

```typescript
interface SubscriptionFile {
  updatedAt: string;
  subscription: PushSubscriptionJSON | null; // 브라우저가 발급한 구독 정보
}
```

### 4.3 환경 변수 (`.env`, 값은 채팅에 출력하지 않음)

| 이름 | 용도 | 상태 |
|------|------|:----:|
| `GITHUB_TOKEN` | 저장소 파일 읽기·쓰기 | 있음 (새 저장소 권한 확인 필요) |
| `GITHUB_REPO` | 저장소 이름 (예: `아이디/my-app`) | 새로 추가 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 알림용 공개 키 (브라우저에서 사용) | 새로 추가 |
| `VAPID_PRIVATE_KEY` | 알림용 비밀 키 (서버에서만 사용) | 새로 추가 |
| `VAPID_SUBJECT` | 알림 발신자 연락처 (개인정보를 보내지 않도록 저장소 주소 `https://github.com/yseo217/my-app` 사용) | 있음 |
| `SUBSCRIBE_PIN` | 알림 켜기 때 확인할 내 PIN | 새로 추가 |
| `OPENAI_API_KEY` | 한국어 요약 (Nice) | 있음 (Actions Secrets 등록 완료) |
| `OPENAI_MODEL` | 화면에서 모델을 고르기 전의 기본 요약 모델 (선택, 없으면 `gpt-5.5`) | 선택 |

**어디에 등록하나**
- **GitHub Actions**: `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `OPENAI_API_KEY`를 저장소 **Secrets**에 등록한다. `GITHUB_TOKEN`은 Actions가 자동으로 주고, 저장소 이름은 워크플로에서 `GITHUB_REPO: ${{ github.repository }}`로 넘겨준다. (Secrets 이름은 `GITHUB_`로 시작할 수 없어서 이 둘은 등록하지 않는다.)
- **Vercel (Part 5)**: 위 표의 값을 모두 **Vercel 환경변수**에 등록한다 (`OPENAI_API_KEY`는 Nice 기능을 쓸 때만). 배포된 앱이 알림 켜기(PIN 확인, 저장소 기록)와 기사 화면을 처리하려면 필요하다.
- **Vercel 재배포 방지 (Part 5)**: `data/` 파일만 바뀐 커밋은 Vercel이 다시 배포하지 않도록 "배포 건너뛰기" 설정을 한다.

---

## 5. 서버 기능 (API 명세)

화면은 서버에서 바로 기사를 가져오는 방식(Server Component)이라 별도 조회 API 주소는 만들지 않는다 (PLAN 7번).

| 종류 | 이름 | 하는 일 | 입력 | 결과 |
|------|------|--------|------|------|
| Server Action | `subscribe` | 알림 켜기 | 구독 정보, PIN | `{ ok: true }` / `{ ok: false, error: "PIN_NOT_SET" \| "PIN_MISMATCH" \| "LOCKED" \| "INVALID_SUBSCRIPTION" \| "SAVE_FAILED" }` |
| Server Action | `unsubscribe` | 알림 끄기 | PIN | 위와 같음 (`INVALID_SUBSCRIPTION` 제외) |
| Server Action | `checkPushStatus` | 이 기기가 서버에 저장된 알림 기기와 같은지 확인 | 이 기기의 구독 주소 | `"MATCH"` / `"MISMATCH"` / `"UNKNOWN"`(서버를 못 읽음). 저장된 정보는 돌려주지 않음 |
| Server Action | `refreshNews` | 새로고침 (10분 저장된 뉴스를 지우고 화면 다시 그리기) | 없음 | 없음 |
| Server Action | `setSummaryModel` | (Nice) 요약 모델 바꾸기 (PIN 확인, 목록에 있는 모델만, 같은 모델이면 저장 생략) | 모델 이름, PIN | `{ ok: true }` / `{ ok: false, error: "PIN_NOT_SET" \| "PIN_MISMATCH" \| "LOCKED" \| "INVALID_MODEL" \| "SAVE_FAILED" }` |
| 스크립트 | `npm run notify` | 알림 발송 (흐름 3) | 없음 | 실행 기록에 요약 출력. 뉴스 검색이 모두 실패하거나, 한 건도 못 보냈거나, 기록 저장에 실패하면 실패(종료 코드 1) |
| 스크립트 | `npm run notify -- --dry-run` | 보내지 않고 고를 기사만 출력 | 없음 | 기사 5건 목록 |

**공통 기능 (`lib/`)**

| 함수 | 파일 | 하는 일 |
|------|------|--------|
| `fetchGoogleNews(topic)` | `lib/news/google-news.ts` | 한 주제(AI 또는 반도체)의 RSS 검색 후 기사 목록으로 변환 |
| `fetchGoogleNewsFeeds()` | `lib/news/google-news.ts` | 두 주제를 동시에 검색 |
| `fetchGoogleNewsTopic(topic)` | `lib/news/google-news.ts` | 한 주제 검색 + 응답 시각 + 실패 여부(`failed`). 발송 스크립트가 "기사 없음"과 "읽기 실패"를 구분하는 데 씀 |
| `pickTopArticles(list, excludeIds, count)` | `lib/news/pick-top.ts` | 한 목록에서 이미 보낸 기사 제외 후 상위 N건 |
| `pickMixedTop(feeds, excludeIds)` | `lib/news/pick-top.ts` | AI 3건 + 반도체 2건 섞기 (모자라면 다른 쪽으로 채움) |
| `recentSentIds(file)` | `lib/news/pick-top.ts` | 최근 90일 안에 보낸 기사 번호 모음 |
| `getTopArticles()` | `lib/news/top-articles.ts` | 위 둘을 합치고 10분 캐시 (화면용) |
| `readJson()` / `writeJson()` | `lib/store/github-store.ts` | GitHub API로 `data/` 파일 읽기 / 통째로 쓰기 (기기 정보·설정처럼 마지막 값이 맞는 파일). 읽은 내용은 서버마다 60초 동안 다시 쓰고(GitHub 사용 한도 보호), 저장하면 바로 바뀜. `fresh: true`면 새로 읽음 |
| `updateJson()` | `lib/store/github-store.ts` | 최신 내용 읽기 → 바꾸기 → 저장. 충돌하면 최신 내용을 다시 읽어 다시 적용 (최대 3번), 다른 쪽이 저장한 내용을 덮어쓰지 않음 |
| `updateSentArticles()` / `updateSummaries()` | `lib/store/github-store.ts` | 보낸 기사 기록·요약 저장소를 `updateJson()`으로 저장 |
| `sendArticlePush()` | `lib/push/send.ts` | 알림 1건 발송 + 1번 재시도 |
| `summarizeKorean()` | `lib/summary/summarize.ts` | (Nice) OpenAI 웹 검색으로 기사 내용을 확인해 한국어 제목·3줄 요약·쉬운 설명 작성 (모델은 화면에서 고른 것 → `.env`의 `OPENAI_MODEL` → `gpt-5.5` 순서). RSS에는 제목만 있어서 웹 검색을 쓴다 |
| `attachSummaries(articles)` | `lib/summary/summarize.ts` | (Nice) 저장된 요약은 재사용, 없는 기사만 "요약 중" 표시 후 요약해 최신 저장소에 합쳐 저장 (90일·오래된 표시 정리). 저장소를 못 읽거나 표시를 못 남기면 요약 없이 진행 |
| `readSummaryModel()` / `saveSummaryModel()` | `lib/store/github-store.ts` | (Nice) `data/settings.json`의 요약 모델 읽기·저장 |
| `fetchChannelVideos(channelId)` | `lib/news/youtube.ts` | (Nice) 유튜브 채널 RSS를 영상 목록으로 변환 |
| `pickTopVideo(videos)` | `lib/news/youtube.ts` | (Nice) 최근 2일·AI/반도체 영상 중 조회수 1위 |
| `getTopVideo()` | `lib/news/youtube.ts` | (Nice) 6개 채널 동시 조회 + 12시간 저장 (화면용) |

**유튜브 채널 RSS** (`https://www.youtube.com/feeds/videos.xml?channel_id={채널 번호}`, 키 없음)
- 채널: CNBC, CNBC Television, Bloomberg Television, Reuters, WSJ, Yahoo Finance
- 2026-09-17 시험에서 요청마다 404·500이 자주 나와, 여러 채널을 함께 보고 실패는 건너뛴다

**구글 뉴스 RSS 검색 주소** (`https://news.google.com/rss/search?q={검색어}&hl=en-US&gl=US&ceid=US:en`)
- AI: `(AI OR "artificial intelligence" OR semiconductor OR chipmaker)`
- 반도체: `(semiconductor OR semiconductors OR chipmaker OR chipmakers OR TSMC OR Nvidia OR "SK Hynix" OR "Samsung Electronics" OR HBM OR foundry) when:1d`
- 한 번에 검색하면 "AI" 기사에 밀려 반도체 기사가 0건이 되어 (2026-09-17 시험 결과) 따로 검색한다

---

## 6. 화면 구성

### 6.1 메인 화면 (`/`)

남색·빨강 스포츠 뉴스 스타일. 넓은 화면은 두 칸, 휴대폰은 오른쪽 칸이 아래로 내려간다.

```
┌──────────────────────────────────────────────────────────┐
│ [칩 아이콘] IRON MAN            AI · SEMICONDUCTOR DAILY   │ ← 남색 머리글 (모든 화면, 위에 고정)
│ 주요 기사  영상  지난 기사                                  │ ← 빨간 메뉴 줄
├──────────────────────────────────────────────────────────┤
│ LIVE 업데이트 16:21 │ 08:00 아침 알림  20:00 저녁 알림 [새로고침]│ ← 상태 줄 (휴대폰은 알림 시간 숨김)
├───────────────────────────────────┬──────────────────────┤
│ TODAY'S TOP STORIES               │ Headlines  전체 보기   │
│ AI와 반도체 주요 기사              │ 1 한국어 제목 (→ 카드)  │
│ ┌───────────────────────────────┐ │ 2 ...                 │
│ │ ▶ 영상 재생 칸 16:9 (자막 자동) │ │ ┌ 알림 받기 ─────────┐ │
│ │ 오늘의 주요 영상 · 제목 · 조회수 │ │ │ ● 알림이 꺼져 있어요 │ │
│ └───────────────────────────────┘ │ │ [PIN___] [알림 켜기] │ │
│ 주요 기사  지난 기사               │ │ (아이폰 설치 안내)    │ │
│ ┌───────────────────────────────┐ │ └────────────────────┘ │
│ │ 1  REUTERS · 2시간 전           │ │ ┌ 요약 AI 모델 ──────┐ │
│ │    한국어 제목 (Nice)           │ │ │ [GPT-5.5][5.4 mini]│ │
│ │    원문 제목                    │ │ └────────────────────┘ │
│ │    요약 · 💡 쉬운 설명 (Nice)    │ │ [지난 기사 보기 →]     │
│ │    [원문 보기 →]                │ │                       │
│ └───────────────────────────────┘ │                       │
│  x 5 (없으면 "지금 새 기사가 없어요") │                       │
├───────────────────────────────────┴──────────────────────┤
│ IRON MAN · 구글 뉴스에서 고른 AI·반도체 주요 기사            │ ← 남색 바닥글
└──────────────────────────────────────────────────────────┘
```

### 6.2 기사 화면 (`/articles/[id]`) — 알림을 누르면 열림

```
┌────────────────────────────────────┐
│ ← 메인으로                           │
│ 9월 17일 오전 알림 · 인기 1위          │
├────────────────────────────────────┤
│ (Nice) 한국어 제목 (크게)             │
│ 원문 제목                            │
│ Reuters · 9월 17일 07:40             │
│ (Nice) 요약 / 💡 쉬운 설명            │
│                                    │
│ [원문 기사 열기 →]                    │
└────────────────────────────────────┘
```

### 6.3 지난 기사 화면 (`/history`) — Nice

```
┌────────────────────────────────────┐
│ ← 메인으로      지난 기사              │
├────────────────────────────────────┤
│ 9월 17일 저녁 (20:00)                │  ← 회차별 묶음, 최신순
│  1 한국어 제목 / 원문 제목 · 매체  >    │  ← 누르면 기사 화면
│  2 ...                              │
│ 9월 17일 아침 (08:00)                │
│  ...                                │
└────────────────────────────────────┘
```

### 6.4 사용자 흐름

```
[직접 볼 때]   앱 열기 → 기사 5건 → 원문 보기
[알림 받을 때] 알림 도착 → 알림 누르기 → 기사 화면 → 원문 열기
[다시 볼 때]   앱 열기 → 지난 기사 보기 → 기사 화면 (Nice)
```

### 6.5 화면 요소 목록

| 요소 | 위치 | 역할 |
|------|------|------|
| `ArticleCard` | `app/components/ArticleCard.tsx` | 기사 카드 한 장 (순위, 제목, 매체, 시간, 요약, 원문 버튼) |
| `PushSubscribe` | `app/components/PushSubscribe.tsx` | PIN 입력, 알림 켜기/끄기, 상태 표시 |
| `InstallGuide` | `app/components/InstallGuide.tsx` | 아이폰 홈 화면 추가 안내 (이미 설치했으면 숨김) |
| `RefreshButton` | `app/components/RefreshButton.tsx` | 화면 다시 불러오기 |
| `SiteHeader` / `SiteFooter` | `app/components/SiteHeader.tsx` | 모든 화면의 머리글(아이콘·이름·메뉴)과 바닥글 |
| `SectionTitle` | `app/components/SectionTitle.tsx` | 굵은 칸 제목 + "전체 보기" 링크 |
| `HeadlineList` | `app/components/HeadlineList.tsx` | 오른쪽 칸의 짧은 제목 목록 (누르면 해당 카드로 이동) |
| `SummaryDetails` | `app/components/SummaryDetails.tsx` | (Nice) 3줄 요약(번호 표시, 예전 요약은 한 문단)과 쉬운 설명 |
| `ModelSelector` | `app/components/ModelSelector.tsx` | (Nice) 요약 모델 고르기 버튼 |
| `VideoCard` / `VideoPlayer` | `app/components/VideoCard.tsx`, `VideoPlayer.tsx` | (Nice) 영상 칸 / 재생 칸 + 자막 자동 켜기 |
| `BackToHome` | `app/components/BackToHome.tsx` | 메인으로 가기 링크 |
| 오류 화면 | `app/error.tsx` | 예상 못 한 오류 때 "화면을 불러오지 못했어요" + 다시 시도 |

### 6.6 화면별 필수 요소 체크리스트

#### 메인 화면
- [ ] 제목: "IRON MAN"과 "AI와 반도체 주요 기사"
- [ ] 문구: 마지막 업데이트 시각
- [ ] 버튼: 새로고침
- [ ] 입력칸: PIN (일반 키보드, 가려서 표시)
- [ ] 버튼: 알림 켜기 / 알림 끄기 (상태에 따라 하나만)
- [ ] 문구: 알림 상태 ("알림이 켜졌어요" / "알림이 꺼져 있어요" / "이 브라우저는 알림을 지원하지 않아요"). 서버에 저장된 기기와 다르면 꺼짐 + 다시 켜기 안내
- [ ] 안내: 아이폰 홈 화면 추가 방법 (아이폰이고 미설치일 때만)
- [ ] 카드 5장: 순위 숫자, 원문 제목, 매체 이름, 발행 시간(몇 시간 전), 원문 보기 버튼(새 탭)
- [ ] 빈 상태: "지금 새 기사가 없어요"
- [ ] (Nice) 카드: 한국어 제목, 번호 붙은 3줄 요약, 쉬운 설명(있을 때만)
- [ ] (Nice) 요약 AI 모델 칸: GPT-5.5 / GPT-5.4 mini 버튼 (고른 것 강조), PIN 입력칸, 저장 결과 문구
- [ ] (Nice) 버튼: 지난 기사 보기
- [ ] (Nice) 영상 칸: 제목 "오늘의 주요 영상", 16:9 재생 칸, 영상 제목, 채널 이름, 조회수, 올린 시간 / 고를 영상이 없으면 "지금은 보여줄 영상이 없어요" 작은 칸 (메뉴 "영상" 링크가 갈 곳을 남김)

#### 기사 화면
- [ ] 버튼: 메인으로
- [ ] 문구: 알림 회차(날짜 + 아침/저녁)와 순위
- [ ] 원문 제목, 매체 이름, 발행 시각
- [ ] 버튼: 원문 기사 열기(새 탭)
- [ ] 없음 상태: "기사를 찾을 수 없어요" + 메인으로 버튼
- [ ] (Nice) 한국어 제목, 요약, 쉬운 설명

#### 지난 기사 화면 (Nice)
- [ ] 버튼: 메인으로
- [ ] 회차 묶음 제목: 날짜 + 아침(08:00)/저녁(20:00), 최신순, 최근 90일치
- [ ] 목록 줄: 순위, 한국어 제목(없으면 원문 제목), 매체 → 누르면 기사 화면
- [ ] 빈 상태: "아직 보낸 알림이 없어요"

### 6.7 알림 내용

| 항목 | 내용 |
|------|------|
| 제목 | `AI·반도체 주요 기사 {순위}/{보낸 건수}` |
| 본문 | 한국어 제목(Nice) 또는 원문 제목 |
| 누르면 | `/articles/{기사번호}` 열기 |
| 같은 기사 | 알림 태그를 기사 번호로 지정해 겹쳐 쌓이지 않게 함 |

---

## 7. 오류 처리

| 상황 | 처리 | 사용자에게 보이는 것 |
|------|------|------------------|
| 구글 뉴스 RSS 읽기 실패 | 화면: 빈 목록으로 처리, 서버 기록 / 발송 스크립트: 두 검색이 모두 실패하면 실패(종료 코드 1)로 끝내 Actions 기록에 빨간색, 한쪽만 실패하면 경고 후 다른 쪽 기사로 진행 | "지금 새 기사가 없어요" |
| 새 기사 0건 (알림) | 발송 생략, 실행 기록에 "새 기사 없음" | 알림 없음 |
| 알림 발송 실패 (일시적) | 5초 뒤 1번 재시도, 그래도 실패하면 `failures`에 기록 | 해당 알림 없음 |
| 알림 발송 실패 (기기 정보 만료, 404/410) | 재시도하지 않고 기록, 저장소의 기기가 방금 보낸 기기와 같을 때만 비우기 (못 비워도 보낸 기사 기록은 저장하고 실패로 끝냄) | 메인 화면이 서버 기록과 비교해 "알림이 꺼져 있어요" + "기기 정보가 만료됐거나 다른 기기에서 켰어요. 다시 켜 주세요" |
| 기기 정보 없음 | 발송 생략, 기록 | 알림 없음 |
| GitHub API 실패 | 알림 켜기: `SAVE_FAILED` 반환 / 스크립트: 실행 실패로 표시 | "저장에 실패했어요. 잠시 후 다시 시도해 주세요" |
| PIN 틀림 | 저장하지 않음 | "PIN이 맞지 않아요" |
| 서버 동작 호출 실패 (인터넷 끊김 등) | 알림 켜기: 이 기기의 구독을 되돌림 / 끄기·모델 바꾸기: 저장 안 됨 (선택 표시는 원래대로) | "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요" |
| 저장 충돌 (화면·Actions가 같은 파일을 동시에 저장) | 최신 내용을 다시 읽어 바꿀 내용을 다시 적용 (최대 3번), 다른 쪽 내용을 지우지 않음 | 없음 |
| 같은 기사를 여러 곳에서 동시에 요약 (Nice) | 저장소에 "요약 중" 표시를 먼저 남긴 쪽만 OpenAI 호출, 나머지는 최대 30초 기다렸다 결과를 읽음 | 요약이 조금 늦게 보일 수 있음 |
| 화면을 그리다 예상 못 한 오류 | `app/error.tsx` 오류 화면 | "화면을 불러오지 못했어요" + [다시 시도] |
| OpenAI 실패 (Nice) | 요약 없이 원문 제목으로 진행 | 한국어 요약 부분만 빠짐 |
| 보낸 기사 파일(`sent-articles.json`) 모양이 깨짐 | 빈 기록으로 덮어쓰지 않고 발송을 멈춤 (실패로 끝냄) | 지난 기사 화면에 "불러오지 못했어요", Actions 기록 빨간색 |
| 없는 기사 번호 | 없음 화면 | "기사를 찾을 수 없어요" |

---

## 8. 보안

- [ ] 저장소는 **비공개**로 유지 (기기 정보가 들어 있음)
- [ ] 비밀 키(`VAPID_PRIVATE_KEY`, `GITHUB_TOKEN`, `OPENAI_API_KEY`, `SUBSCRIBE_PIN`)는 서버에서만 사용, 이름에 `NEXT_PUBLIC_` 붙이지 않음
- [ ] 알림 켜기/끄기와 요약 모델 바꾸기는 `SUBSCRIBE_PIN`이 맞을 때만 저장 (로그인 없이 남이 내 알림을 바꾸거나 저장소 기록을 마구 만들지 못하게). PIN은 6자 이상 영문+숫자 섞기, 입력칸은 일반 키보드
- [ ] 알림 받을 기기 주소는 브라우저 회사 알림 서버(구글·애플·모질라·마이크로소프트)만 받음
- [ ] RSS에서 온 제목·링크는 글자로만 표시 (HTML로 해석하지 않음), 링크는 `http(s)`만 허용
- [ ] 원문 링크는 새 탭 + `rel="noopener noreferrer"`
- [ ] `next.config.ts`에 보안 헤더 추가 (Next.js 공식 안내 방식): 허락한 곳의 스크립트·영상만 쓰기(CSP, 유튜브만 허용), HTTPS만 쓰기(HSTS), 카메라·마이크·위치 막기, `X-Powered-By` 숨기기, `sw.js` 캐시 금지
- [ ] AI 요약에서 링크(http 있음·없음 모두)와 마크다운 기호를 지우고 글자 수 제한, 검색 결과 속 지시는 따르지 않게 안내 (프롬프트 인젝션 대비)
- [ ] 검색엔진에 올리지 않음 (`robots: noindex, nofollow`)
- [ ] 배포 때 할 일: Vercel 방화벽 접속 횟수 제한, `data/`만 바뀐 커밋은 배포 건너뛰기, OpenAI 월 사용 한도, GitHub 토큰은 이 저장소 전용·파일 권한만
- [ ] GitHub Actions 권한은 `contents: write`만 부여

---

## 9. 테스트 계획

> 구현 단계에서 기능과 확인을 한 묶음으로 진행한다. 화면 확인은 내장 브라우저로 하고, 별도 테스트 도구(Playwright)는 추가하지 않는다.

### 9.1 서버·스크립트 확인 (L1)

| # | 대상 | 확인 내용 | 기대 결과 |
|---|------|----------|----------|
| 1 | `npm run notify -- --dry-run` | 기사 고르기 | 5건 이하 목록 출력, 발송 없음 |
| 2 | 같은 명령 (보낸 기사 파일에 1위 기사 추가 후) | 중복 제외 | 해당 기사가 빠지고 다음 순위가 들어옴 |
| 3 | `subscribe` (틀린 PIN) | PIN 확인 | `PIN_MISMATCH`, 파일 변화 없음 |
| 4 | `subscribe` (맞는 PIN) | 저장 | `ok: true`, `data/subscription.json` 갱신 |
| 5 | `npm run notify` | 실제 발송 | 알림 5건, `sent-articles.json`에 회차 추가 |
| 6 | `/manifest.webmanifest` | 앱 정보 | 이름·아이콘·`display: standalone` 포함 |

### 9.2 화면 동작 확인 (L2)

| # | 화면 | 동작 | 기대 결과 |
|---|------|------|----------|
| 1 | 메인 | 열기 | 6.6 체크리스트 요소 표시, 카드 5장(또는 빈 상태) |
| 2 | 메인 | 새로고침 | 업데이트 시각 갱신 |
| 3 | 메인 | 틀린 PIN으로 알림 켜기 | "PIN이 맞지 않아요" |
| 4 | 메인 | 맞는 PIN으로 알림 켜기 | "알림이 켜졌어요" |
| 5 | 기사 | 없는 번호로 열기 | "기사를 찾을 수 없어요" |

### 9.3 전체 흐름 확인 (L3)

| # | 시나리오 | 순서 | 성공 기준 |
|---|---------|------|----------|
| 1 | 알림 받기 | 알림 켜기 → Actions 직접 실행 → 알림 누르기 | 기사 화면에 같은 기사 표시 |
| 2 | 중복 제외 | Actions 두 번 실행 | 두 번째 알림에 첫 번째 기사 없음 |
| 3 | 휴대폰 | (Part 5 배포 후) 홈 화면 추가 → 알림 켜기 → 알림 수신 | 휴대폰에 알림 도착 |

### 9.4 로컬 확인 방법

- 알림은 HTTPS에서만 동작하므로 PC 확인은 `npx next dev --experimental-https`로 띄운다
- 휴대폰 확인은 Part 5 Vercel 배포 뒤에 한다

---

## 10. 코드 정리 규칙

| 항목 | 규칙 |
|------|------|
| 화면 요소 이름 | 대문자로 시작 (`ArticleCard`) |
| 함수 이름 | 소문자로 시작 (`fetchGoogleNews`) |
| 고정 값 | 대문자와 밑줄 (`TOP_COUNT = 5`) |
| 폴더 이름 | 소문자와 하이픈 (`google-news.ts`) |
| 불러오기 | `@/lib/...` 경로 사용 (앱과 스크립트 공통) |
| 주석·설명 | 한국어 (CLAUDE.md 규칙) |
| 오류 처리 | 결과를 `{ ok, error }` 형태로 돌려주고, 화면에는 쉬운 문장으로 표시 |
| 설계 연결 주석 | 핵심 파일 맨 위에 `// Design Ref: §번호 — 이유` |

---

## 11. 구현 안내

### 11.1 파일 구조 (C안)

```
my-app/
├── app/                              화면과 서버 동작
│   ├── layout.tsx                    (수정) 한국어 설정, 앱 제목
│   ├── page.tsx                      (수정) 메인 화면
│   ├── manifest.ts                   (새로) 홈 화면용 앱 정보
│   ├── actions.ts                    (새로) 알림 켜기/끄기·상태 확인·새로고침·모델 바꾸기
│   ├── error.tsx                     (새로) 오류 화면
│   ├── articles/[id]/page.tsx        (새로) 기사 화면
│   ├── history/page.tsx              (새로, Nice) 지난 기사 화면
│   └── components/
│       ├── ArticleCard.tsx           (새로)
│       ├── PushSubscribe.tsx         (새로)
│       ├── InstallGuide.tsx          (새로)
│       ├── RefreshButton.tsx         (새로)
│       ├── SiteHeader.tsx            (새로) 머리글·바닥글
│       ├── SectionTitle.tsx          (새로) 칸 제목
│       ├── HeadlineList.tsx          (새로) 오른쪽 제목 목록
│       ├── BackToHome.tsx            (새로) 메인으로 링크
│       ├── SummaryDetails.tsx        (새로, Nice) 요약·쉬운 설명
│       ├── ModelSelector.tsx         (새로, Nice) 요약 모델 버튼
│       ├── VideoCard.tsx             (새로, Nice) 주요 뉴스 영상 칸
│       └── VideoPlayer.tsx           (새로, Nice) 재생 칸 + 자막 자동 켜기
├── lib/                              앱과 스크립트가 함께 쓰는 기능
│   ├── types.ts                      (새로) 데이터 모양
│   ├── app-config.ts                 (새로) 앱 테마 색
│   ├── news/google-news.ts           (새로) RSS 읽기
│   ├── news/pick-top.ts              (새로) 5건 고르기·중복 제외
│   ├── news/top-articles.ts          (새로) 화면용 묶음 + 캐시
│   ├── news/youtube.ts               (새로, Nice) 뉴스 채널 영상 고르기 + 12시간 캐시
│   ├── store/github-store.ts         (새로) 저장소 파일 읽기·쓰기
│   ├── push/send.ts                  (새로) 알림 발송 + 재시도
│   ├── push/subscribe-guard.ts       (새로) PIN 확인·잠금, 구독 정보 검사
│   ├── summary/summarize.ts          (새로, Nice) 한국어 요약
│   └── summary/models.ts             (새로, Nice) 고를 수 있는 요약 모델 목록
├── scripts/send-notifications.ts     (새로) GitHub Actions가 실행
├── data/
│   ├── sent-articles.json            (새로) 보낸 기사 기록
│   ├── subscription.json             (새로) 알림 받을 기기 정보
│   ├── summaries.json                (새로, Nice) 한국어 요약 저장
│   └── settings.json                 (새로, Nice) 요약 모델 설정
├── public/
│   ├── sw.js                         (새로) 서비스 워커
│   └── icons/icon-192.png, icon-512.png (새로) 앱 아이콘
├── .github/workflows/notify.yml      (새로) 하루 2번 실행 설정
├── next.config.ts                    (수정) 보안·sw 헤더
└── package.json                      (수정) notify 명령, 도구 추가
```

새 파일 약 35개, 수정 파일 4개.

### 11.2 구현 순서 (PLAN.md 작업 번호 기준)

1. [ ] 비공개 저장소 준비, `.env` 새 값 추가, 도구 설치 확인받기 (PLAN 1~2, 12)
2. [ ] `lib/types.ts`, `data/` 빈 파일, `lib/store/github-store.ts` (PLAN 3~4)
3. [ ] `lib/news/*` + `--dry-run` 스크립트로 기사 고르기 확인 (PLAN 5~6)
4. [ ] 메인 화면, 기사 카드, 새로고침, 빈 상태 (PLAN 7~8)
5. [ ] 기사 화면 (PLAN 9)
6. [ ] `manifest.ts`, 아이콘, `sw.js`, 보안 헤더 (PLAN 10~11)
7. [ ] 알림 켜기 화면 + `actions.ts` (PLAN 13)
8. [ ] `lib/push/send.ts` + 발송 스크립트 완성 + 기록 저장 (PLAN 14~15)
9. [ ] `notify.yml` + Secrets 등록 + 직접 실행 확인 (PLAN 16~17)
10. [ ] (Nice) 요약·쉬운 설명·요약 모델 버튼·지난 기사 화면 (PLAN 18~21)
11. [ ] 검증 루프와 성공 기준 확인 (PLAN 22~23)

### 11.3 작업 나누기 안내 (Session Guide)

#### 모듈 지도

| 모듈 | 범위 키 | 내용 | 예상 대화 수 |
|------|--------|------|:----------:|
| 기반 준비 | `module-1` | 저장소, `.env`, 도구 설치, 데이터 모양, 저장 기능 | 15-20 |
| 실시간 기사 | `module-2` | RSS 읽기, 5건 고르기, 메인 화면, 기사 화면 | 25-30 |
| 앱·알림 켜기 | `module-3` | 앱 정보, 아이콘, 서비스 워커, 알림 켜기 | 25-30 |
| 자동 발송 | `module-4` | 발송 스크립트, 재시도, 기록, GitHub Actions | 20-25 |
| Nice 기능 | `module-5` | 한국어 요약, 쉬운 설명, 요약 모델 버튼, 지난 기사 | 25-30 |

#### 추천 진행 순서

| 회차 | 단계 | 범위 | 대화 수 |
|------|------|------|:------:|
| 1 | 계획 + 설계 | 전체 | 완료 |
| 2 | 구현 | `--scope module-1,module-2` | 40-50 |
| 3 | 구현 | `--scope module-3,module-4` | 45-55 |
| 4 | 구현 | `--scope module-5` | 25-30 |
| 5 | 점검 + 보고 | 전체 | 30-40 |

---

## 버전 기록

| 버전 | 날짜 | 변경 | 작성자 |
|------|------|------|--------|
| 0.1 | 2026-09-17 | 첫 초안 (C안 선택) | Tony Stark |
| 0.2 | 2026-09-17 | 문서 교차 검토 반영: 요약 저장 파일, Actions·Vercel 환경변수 등록 방법, 5건 미만·90일 규칙, 운영 지표 기록, 용어 통일 | Tony Stark |
| 0.3 | 2026-09-18 | 점검(89%) 뒤 1~5번 수정 반영: 알림 상태 서버 확인, 서버 동작 실패 처리·오류 화면, 저장 충돌 시 최신 내용에 합치기, 요약 중 표시(서버 여러 대), 뉴스 검색 실패 시 발송 실패 처리. 새 디자인·자막·모델 버튼 반영. 한국어 요약을 3줄 요약으로 변경. 보안 점검 반영(모델 버튼 PIN, GitHub 읽기 60초 재사용·기다림 30초, 보안 헤더, 알림 서버 주소 제한, 주소 글자 지우기, 검색엔진 차단). 점검 2순위·3순위 반영(만료 기기 정리, 깨진 기록 보호, 알림 누르면 기사 화면, 영상 없음 칸, Actions 도구 버전 고정) | Tony Stark |
