// Design Ref: §2.2 흐름 3 — 하루 2번(GitHub Actions) 주요 기사 알림을 보내는 스크립트
// 실행: npm run notify  (보내지 않고 고를 기사만 보기: npm run notify -- --dry-run)
import { existsSync } from "node:fs";
import { fetchGoogleNewsTopic } from "@/lib/news/google-news";
import {
  addBatch,
  pickMixedTop,
  recentSentIds,
  slotFor,
} from "@/lib/news/pick-top";
import { sendArticlePush } from "@/lib/push/send";
import {
  clearSubscriptionIfSame,
  readSentArticles,
  readSubscription,
  updateSentArticles,
} from "@/lib/store/github-store";
import { attachSummaries } from "@/lib/summary/summarize";
import type { Article, SendFailure } from "@/lib/types";

// 내 PC에서는 .env를 읽고, GitHub Actions에서는 Secrets가 환경 변수로 들어온다
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<number> {
  const sentFile = await readSentArticles();
  const [ai, semiconductor] = await Promise.all([
    fetchGoogleNewsTopic("ai"),
    fetchGoogleNewsTopic("semiconductor"),
  ]);
  // 두 검색이 모두 실패하면 "새 기사 없음"이 아니라 실패로 끝내서 Actions 기록에 빨간색으로 남긴다
  if (ai.failed && semiconductor.failed) {
    console.error("[notify] 실패: 구글 뉴스 AI·반도체 검색을 모두 읽지 못했어요");
    return 1;
  }
  if (ai.failed || semiconductor.failed) {
    console.warn(
      `[notify] 주의: ${ai.failed ? "AI" : "반도체"} 검색을 읽지 못해 다른 쪽 기사로만 골라요`,
    );
  }
  const feeds = { ai: ai.articles, semiconductor: semiconductor.articles };
  const articles = pickMixedTop(feeds, recentSentIds(sentFile));

  console.log(
    `[notify] 검색 결과 AI ${feeds.ai.length}건 · 반도체 ${feeds.semiconductor.length}건 → 새 기사 ${articles.length}건 선택`,
  );
  for (const article of articles) {
    console.log(`  ${article.rank}. ${article.title} (${article.source})`);
  }

  if (articles.length === 0) {
    console.log("[notify] 건너뜀: 새 기사 없음");
    return 0;
  }
  if (dryRun) {
    console.log("[notify] --dry-run: 알림을 보내지 않고 끝냄");
    return 0;
  }

  const subscription = await readSubscription();
  if (!subscription) {
    console.log("[notify] 건너뜀: 알림 받을 기기 없음 (앱에서 알림을 켜 주세요)");
    return 0;
  }

  // (Nice) 알림 본문을 한국어 제목으로 보내고, 보낸 기록에도 요약을 함께 남긴다
  const summarized = await attachSummaries(articles);
  console.log(
    `[notify] 한국어 요약 ${summarized.filter((article) => article.ko).length}/${summarized.length}건`,
  );

  const sent: Article[] = [];
  const failures: SendFailure[] = [];
  let expired = false;

  for (const article of summarized) {
    if (expired) {
      failures.push({ articleId: article.id, reason: "기기 정보 만료로 보내지 않음" });
      continue;
    }
    const result = await sendArticlePush(subscription, article, summarized.length);
    if (result.ok) {
      sent.push(article);
    } else {
      failures.push({ articleId: article.id, reason: result.reason });
      expired = result.expired;
    }
  }

  let cleanupFailed = false;
  if (expired) {
    // 기기 정보를 못 지워도 보낸 기사 기록은 아래에서 꼭 저장한다 (같은 기사가 다시 나가지 않게)
    try {
      // 발송하는 사이 새로 켠 기기가 있으면 그 기기는 지우지 않는다
      const cleared = await clearSubscriptionIfSame(subscription.endpoint);
      console.warn(
        cleared
          ? "[notify] 기기 정보가 만료되어 지웠어요. 앱에서 알림을 다시 켜 주세요"
          : "[notify] 기기 정보가 만료됐지만, 그 사이 새 기기로 바뀌어 지우지 않았어요",
      );
    } catch (error) {
      cleanupFailed = true;
      console.error("[notify] 만료된 기기 정보 지우기 실패:", error);
    }
  }

  console.log(`[notify] 결과: 발송 ${sent.length}건 · 실패 ${failures.length}건`);
  for (const failure of failures) {
    console.log(`  실패 ${failure.articleId}: ${failure.reason}`);
  }

  // Design Ref: §4.2 — 보낸 기사만 "보냄"으로 기록한다 (실패한 기사는 다음 회차에 다시 후보가 됨)
  const now = new Date();
  const slot = slotFor(now);
  try {
    // 저장 직전의 최신 기록에 이번 회차를 더한다 (그 사이 바뀐 기록을 덮어쓰지 않음)
    const updated = await updateSentArticles(
      (current) =>
        addBatch(current, { sentAt: now.toISOString(), slot, articles: sent, failures }, now),
      slot,
    );
    console.log(
      `[notify] 기록 저장: ${slot === "morning" ? "아침" : "저녁"} 회차 (보관 중인 회차 ${updated.batches.length}개)`,
    );
  } catch (error) {
    console.error("[notify] 기록 저장 실패 — 다음 회차에 같은 기사가 다시 갈 수 있어요:", error);
    return 1;
  }
  // 한 건도 못 보냈거나 만료 정보를 못 지웠으면 실패로 끝내서 GitHub Actions 기록에 빨간색으로 보이게 한다
  return sent.length === 0 || cleanupFailed ? 1 : 0;
}

// process.exit()로 바로 끊으면 네트워크 연결이 닫히는 중에 Node가 비정상 종료될 수 있어서(Windows),
// 종료 코드만 정해 두고 남은 일이 끝나면 자연스럽게 끝나게 한다
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("[notify] 실행 실패:", error);
    process.exitCode = 1;
  });
