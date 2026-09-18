// Design Ref: §4.1 — 앱 화면과 알림 스크립트가 함께 쓰는 기사 모양
import type { SummaryModel } from "@/lib/summary/models";

export interface Article {
  /** 원문 링크로 만든 12자리 고유 번호. 중복 확인과 기사 화면 주소에 쓴다 */
  id: string;
  /** 구글 뉴스 순서 기준 1~5위 */
  rank: number;
  /** 원문 제목 (영어) */
  title: string;
  /** 원문 주소 (http/https만 허용) */
  link: string;
  /** 매체 이름 (예: Reuters) */
  source: string;
  /** 발행 시각 (ISO 8601 문자열) */
  publishedAt: string;
  /** (Nice) 한국어 요약. 아직 없거나 요약에 실패하면 비어 있다 */
  ko?: KoreanSummary;
}

export interface KoreanSummary {
  /** 한국어 제목 */
  title: string;
  /** 3줄 요약 (줄바꿈으로 구분). 예전에 만든 요약은 1~2문장 한 덩어리 */
  summary: string;
  /** 새 기술이 나올 때만 붙는 쉬운 설명 한 줄 */
  techNote?: string;
}

/** (Nice) 메인 화면의 주요 뉴스 영상 — Design Ref: §4.1 */
export interface NewsVideo {
  /** 유튜브 영상 번호 (11자리) */
  id: string;
  title: string;
  /** 채널 이름 (예: CNBC) */
  channel: string;
  /** 올린 시각 (ISO 8601 문자열) */
  publishedAt: string;
  /** RSS에 적힌 조회수 */
  views: number;
  /** 세로형 짧은 영상(Shorts) 여부 */
  isShort: boolean;
}

// Design Ref: §4.2 — 비공개 GitHub 저장소 data/ 폴더에 두는 저장 파일 모양

/** data/sent-articles.json — 보낸 기사 기록 (중복 확인, 기사 화면, 지난 기사 목록) */
export interface SentArticlesFile {
  /** 마지막으로 기록한 시각. 한 번도 보내지 않았으면 null */
  updatedAt: string | null;
  /** 발송 회차 목록. 최근 90일치만 보관한다 */
  batches: SentBatch[];
}

export interface SentBatch {
  /** 발송 시각 (ISO 8601 문자열) */
  sentAt: string;
  /** 아침(08:00) 또는 저녁(20:00) 회차 */
  slot: "morning" | "evening";
  /** 보낸 기사 (최대 5건) */
  articles: Article[];
  /** 발송에 실패한 기사와 이유 */
  failures: SendFailure[];
}

export interface SendFailure {
  articleId: string;
  reason: string;
}

/** (Nice) data/summaries.json — 한 번 만든 한국어 요약을 다시 쓰기 위한 저장소 */
export interface SummariesFile {
  updatedAt: string | null;
  /** 기사 번호 → 요약. 최근 90일치만 보관 */
  items: Record<string, StoredSummary>;
  /**
   * 지금 어느 서버가 요약 중인 기사 번호 → 시작 시각.
   * 서버가 여러 대여도 같은 기사를 두 번 요약하지 않기 위한 표시 (오래된 표시는 무시)
   */
  pending?: Record<string, string>;
}

export interface StoredSummary extends KoreanSummary {
  /** 요약을 만든 시각 (ISO 8601 문자열) */
  createdAt: string;
}

/** (Nice) data/settings.json — 화면에서 고른 설정 */
export interface SettingsFile {
  updatedAt: string | null;
  /** 새 한국어 요약을 만들 때 쓸 AI 모델 */
  summaryModel: SummaryModel;
}

/** data/subscription.json — 알림 받을 기기 정보 */
export interface SubscriptionFile {
  /** 마지막으로 바꾼 시각. 한 번도 켜지 않았으면 null */
  updatedAt: string | null;
  /** 알림이 꺼져 있으면 null */
  subscription: StoredPushSubscription | null;
}

/** 브라우저가 발급한 구독 정보 중 알림 발송에 필요한 부분 */
export interface StoredPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}
