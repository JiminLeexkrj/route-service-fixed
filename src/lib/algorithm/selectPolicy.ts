import type { UserPreferences } from "@/types/trip";
import { calculateRiskLevel } from "./risk";
import type {
  PolicyEvaluation,
  PolicyForecast,
  RoutePolicy,
  SwitchHistory,
} from "./types";

// 문서 §5-H 권장 초기값
const BASE_SWITCH_GAIN = 8;
const MIN_PROBABILITY_GAIN = 0.08;
const MIN_P90_TIME_GAIN_MINUTES = 4;
const SWITCH_CONFIRMATION_COUNT = 2;
const RECOMMENDATION_COOLDOWN_SECONDS = 45;
const DANGER_PROBABILITY_OVERRIDE = 0.5;

function satisfiesHardConstraints(
  policy: RoutePolicy,
  preferences: UserPreferences,
): { ok: boolean; reason?: string } {
  if (policy.walkingMeters > preferences.walkingDistanceMeters) {
    return { ok: false, reason: "허용한 도보 거리를 초과합니다." };
  }
  if (policy.usesTaxi && !preferences.allowTaxi) {
    return { ok: false, reason: "택시 이용이 허용되지 않았습니다." };
  }
  return { ok: true };
}

// 동률 비교와 경로 전환 판단에만 쓰는 보조 효용 (문서 §5-G)
function utility(
  forecast: PolicyForecast,
  policy: RoutePolicy,
  isCurrent: boolean,
): number {
  return (
    100 * forecast.onTimeProbability -
    1.5 * forecast.expectedLateMinutes -
    20 * forecast.severeLateProbability -
    30 * forecast.strandingProbability -
    (isCurrent ? 0 : 5) -
    policy.walkingMinutes * 0.3 -
    policy.transferCount * 2
  );
}

function resolveTargetProbability(evaluations: PolicyEvaluation[]): number {
  const best = Math.max(0, ...evaluations.map((e) => e.forecast.onTimeProbability));
  if (best >= 0.9) return 0.9;
  if (best >= 0.8) return 0.8;
  return best;
}

export type PolicySelection = {
  evaluations: PolicyEvaluation[];
  targetProbability: number;
  recommendedPolicyId: string;
  shouldSwitch: boolean;
  switchReason?: string;
  updatedHistory: SwitchHistory;
};

export function evaluateAndSelectPolicy(
  policies: RoutePolicy[],
  forecasts: Map<string, PolicyForecast>,
  deadline: number,
  now: number,
  preferences: UserPreferences,
  history: SwitchHistory,
): PolicySelection {
  const evaluations: PolicyEvaluation[] = policies.map((policy) => {
    const forecast = forecasts.get(policy.id)!;
    const constraint = satisfiesHardConstraints(policy, preferences);
    return {
      policy,
      forecast,
      riskLevel: calculateRiskLevel(forecast, deadline),
      rejectedReasons: constraint.ok ? [] : [constraint.reason!],
    };
  });

  const feasible = evaluations.filter((e) => e.rejectedReasons.length === 0);
  const pool = feasible.length > 0 ? feasible : evaluations;
  const targetProbability = resolveTargetProbability(pool);

  const meetsTarget = pool.filter(
    (e) => e.forecast.onTimeProbability >= targetProbability,
  );
  const candidates = meetsTarget.length > 0 ? meetsTarget : pool;

  const sorted = [...candidates].sort((a, b) => {
    if (a.forecast.arrivalP90 !== b.forecast.arrivalP90) {
      return a.forecast.arrivalP90 - b.forecast.arrivalP90;
    }
    if (a.policy.transferCount !== b.policy.transferCount) {
      return a.policy.transferCount - b.policy.transferCount;
    }
    return a.policy.walkingMinutes - b.policy.walkingMinutes;
  });

  const target = sorted[0] ?? pool[0];
  const current = history.currentPolicyId
    ? pool.find((e) => e.policy.id === history.currentPolicyId)
    : undefined;

  const decision = decideSwitch(target, current, now, history);

  return {
    evaluations,
    targetProbability,
    recommendedPolicyId: decision.recommendedPolicyId,
    shouldSwitch: decision.shouldSwitch,
    switchReason: decision.switchReason,
    updatedHistory: decision.updatedHistory,
  };
}

function decideSwitch(
  target: PolicyEvaluation,
  current: PolicyEvaluation | undefined,
  now: number,
  history: SwitchHistory,
): {
  recommendedPolicyId: string;
  shouldSwitch: boolean;
  switchReason?: string;
  updatedHistory: SwitchHistory;
} {
  if (!current || current.policy.id === target.policy.id) {
    return {
      recommendedPolicyId: target.policy.id,
      shouldSwitch: false,
      updatedHistory: {
        currentPolicyId: target.policy.id,
        candidatePolicyId: undefined,
        candidateStreak: 0,
        lastSwitchAt: history.lastSwitchAt,
      },
    };
  }

  const streak =
    history.candidatePolicyId === target.policy.id
      ? history.candidateStreak + 1
      : 1;
  const nextHistory: SwitchHistory = {
    currentPolicyId: current.policy.id,
    candidatePolicyId: target.policy.id,
    candidateStreak: streak,
    lastSwitchAt: history.lastSwitchAt,
  };

  const currentIsFailing = current.forecast.onTimeProbability < DANGER_PROBABILITY_OVERRIDE;
  const cooldownElapsed =
    !history.lastSwitchAt ||
    now - history.lastSwitchAt >= RECOMMENDATION_COOLDOWN_SECONDS * 1_000;

  const switchGain =
    utility(target.forecast, target.policy, false) -
    utility(current.forecast, current.policy, true);
  const probabilityGain =
    target.forecast.onTimeProbability - current.forecast.onTimeProbability;
  const p90GainMinutes =
    (current.forecast.arrivalP90 - target.forecast.arrivalP90) / 60_000;

  const meetsNormalThreshold =
    switchGain >= BASE_SWITCH_GAIN &&
    probabilityGain >= MIN_PROBABILITY_GAIN &&
    p90GainMinutes >= MIN_P90_TIME_GAIN_MINUTES;

  const confirmed = streak >= SWITCH_CONFIRMATION_COUNT || currentIsFailing;

  const shouldSwitch =
    currentIsFailing || (meetsNormalThreshold && confirmed && cooldownElapsed);

  if (!shouldSwitch) {
    return {
      recommendedPolicyId: current.policy.id,
      shouldSwitch: false,
      updatedHistory: nextHistory,
    };
  }

  return {
    recommendedPolicyId: target.policy.id,
    shouldSwitch: true,
    switchReason: currentIsFailing
      ? "현재 정책의 정시 도착 확률이 위험 수준으로 낮아졌습니다."
      : "대체 정책이 충분히 유리해 경로를 변경합니다.",
    updatedHistory: {
      ...nextHistory,
      currentPolicyId: target.policy.id,
      candidatePolicyId: undefined,
      candidateStreak: 0,
      lastSwitchAt: now,
    },
  };
}
