import { describeNextAction } from "@/lib/routes/instructions";
import { recommendedReevaluateSeconds } from "./replanScheduler";
import type { Action, PolicyEvaluation, Recommendation } from "./types";

function toPercent(probability: number): number {
  return Math.round(probability * 100);
}

function buildReason(
  target: PolicyEvaluation,
  current: PolicyEvaluation | undefined,
  shouldSwitch: boolean,
): string {
  if (shouldSwitch && current) {
    return `${current.policy.label} 경로는 정시 도착 확률이 ${toPercent(
      current.forecast.onTimeProbability,
    )}%로 낮아졌습니다. ${target.policy.label} 경로로 바꾸면 ${toPercent(
      target.forecast.onTimeProbability,
    )}%로 높아집니다.`;
  }

  if (target.riskLevel === "SAFE" || target.riskLevel === "CAUTION") {
    return `${target.policy.label} 경로를 유지하면 정시 도착 확률 ${toPercent(
      target.forecast.onTimeProbability,
    )}%로 예상됩니다.`;
  }

  return `${target.policy.label} 경로를 포함한 모든 후보의 정시 도착 확률이 낮습니다(${toPercent(
    target.forecast.onTimeProbability,
  )}%). 가능한 가장 빠른 대안입니다.`;
}

function buildFallbackAction(
  target: PolicyEvaluation,
  evaluations: PolicyEvaluation[],
): Action | undefined {
  const fallback = evaluations.find(
    (e) => e.policy.id === target.policy.fallbackPolicyId,
  );
  if (!fallback) return undefined;

  return {
    type: "SWITCH",
    description: `${target.policy.label} 이용이 어려워지면 ${fallback.policy.label} 경로로 전환하세요.`,
  };
}

/**
 * executeBy는 원래 이동편의 P10 출발 시각을 기준으로 계산해야 하지만(§5-I),
 * 데이터 레이어가 출발시각을 제공하지 않는 MVP에서는 "행동이 필요한 긴급도"로 단순화한다:
 * 전환이 필요하면 곧, 유지하면 다음 재평가 시점을 실행 기준 시각으로 사용한다.
 */
export function composeRecommendation(
  target: PolicyEvaluation,
  current: PolicyEvaluation | undefined,
  shouldSwitch: boolean,
  evaluations: PolicyEvaluation[],
  now: number,
): Recommendation {
  const reevaluateInSeconds = recommendedReevaluateSeconds(target.riskLevel);
  const executeBy = shouldSwitch
    ? now + 2 * 60_000
    : now + reevaluateInSeconds * 1_000;

  const instruction = describeNextAction(target.policy.segments.map((segment) => ({ ...segment, durationMinutes: segment.travelTime.p50 })), 0, false, null, now);
  const action: Action = {
    type: shouldSwitch ? "SWITCH" : target.policy.segments[0]?.mode === "RUN" ? "WALK_FASTER" : target.policy.usesTaxi ? "PREPARE_TAXI" : "KEEP",
    description: `${instruction.title}. ${instruction.details[0] ?? ""}`,
  };

  return {
    policyId: target.policy.id,
    action,
    reason: buildReason(target, current, shouldSwitch),
    executeBy,
    expectedArrivalP50: target.forecast.arrivalP50,
    expectedArrivalP90: target.forecast.arrivalP90,
    onTimeProbability: target.forecast.onTimeProbability,
    confidence: target.forecast.forecastConfidence,
    fallbackAction: buildFallbackAction(target, evaluations),
    reevaluateInSeconds,
  };
}
