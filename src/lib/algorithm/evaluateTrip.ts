import { composeRecommendation } from "./actionComposer";
import { buildPolicies } from "./policyBuilder";
import { evaluateAndSelectPolicy } from "./selectPolicy";
import { simulatePolicy } from "./simulate";
import type { EvaluationInput, PolicyForecast, TripEvaluation } from "./types";

/**
 * DARTS 알고리즘의 단일 호출 진입점 (문서 §8 runDarts의 서버 API 버전).
 * 상태 추정(§1)과 GPS 융합은 클라이언트/세션 계층에서 처리한다고 가정하고,
 * 이 함수는 "현재 후보 경로 + 남은 시간 + 선호도"로부터 정책 평가와 다음 행동을 계산한다.
 */
export function evaluateTrip(input: EvaluationInput): TripEvaluation {
  const policies = buildPolicies(
    input.rawRoutes,
    input.now,
    input.preferences,
  );
  if (!policies.length) throw new Error("선택한 이동 수단으로 경로를 찾지 못했습니다. 택시 허용 여부나 목적지를 확인해 주세요.");

  const forecasts = new Map<string, PolicyForecast>();
  for (const policy of policies) {
    forecasts.set(policy.id, simulatePolicy(policy, input.now, input.deadline));
  }

  const selection = evaluateAndSelectPolicy(
    policies,
    forecasts,
    input.deadline,
    input.now,
    input.preferences,
    input.history,
  );

  const target = selection.evaluations.find(
    (e) => e.policy.id === selection.recommendedPolicyId,
  )!;
  const current = input.history.currentPolicyId
    ? selection.evaluations.find(
        (e) => e.policy.id === input.history.currentPolicyId,
      )
    : undefined;

  const recommendation = composeRecommendation(
    target,
    current,
    selection.shouldSwitch,
    selection.evaluations,
    input.now,
  );

  return {
    history: selection.updatedHistory,
    evaluatedAt: input.now,
    deadline: input.deadline,
    dataMode: input.dataMode,
    currentPolicyId: input.history.currentPolicyId,
    recommendedPolicyId: selection.recommendedPolicyId,
    shouldSwitch: selection.shouldSwitch,
    switchReason: selection.switchReason,
    recommendation,
    policies: selection.evaluations,
  };
}

export type { SwitchHistory } from "./types";
