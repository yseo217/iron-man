// (Nice) 한국어 요약에 쓸 수 있는 AI 모델 목록. 화면(버튼)과 서버가 함께 쓴다

export const SUMMARY_MODELS = [
  { id: "gpt-5.5", label: "GPT-5.5", note: "정확함 · 비용 높음" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", note: "빠름 · 비용 낮음" },
] as const;

export type SummaryModel = (typeof SUMMARY_MODELS)[number]["id"];

export const DEFAULT_SUMMARY_MODEL: SummaryModel = "gpt-5.5";

/** 목록에 있는 모델 이름인지 확인한다 (다른 값은 저장·사용하지 않음) */
export function isSummaryModel(value: unknown): value is SummaryModel {
  return SUMMARY_MODELS.some((model) => model.id === value);
}
