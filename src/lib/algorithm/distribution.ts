import type { AlgoSegmentMode, TimeDistribution } from "./types";

// coefficient of variation = stddev / mean, by mode (문서 §5-B, §11 "경험적 시간 분포")
const MODE_VARIANCE_COEFFICIENT: Record<AlgoSegmentMode, number> = {
  WALK: 0.08,
  RUN: 0.1,
  BUS: 0.22,
  SUBWAY: 0.06,
  EXPRESSBUS: 0.22, TRAIN: 0.06, AIRPLANE: 0.2, FERRY: 0.2,
  CAR: 0.18,
  TAXI: 0.18,
};

const MODE_BASE_RELIABILITY: Record<AlgoSegmentMode, number> = {
  WALK: 0.95,
  RUN: 0.9,
  BUS: 0.6,
  SUBWAY: 0.75,
  EXPRESSBUS: 0.6, TRAIN: 0.75, AIRPLANE: 0.6, FERRY: 0.6,
  CAR: 0.65,
  TAXI: 0.65,
};

// 실시간 데이터 출처별 half-life (문서 §5-A 권장값)
const MODE_HALF_LIFE_SECONDS: Record<AlgoSegmentMode, number> = {
  WALK: 600,
  RUN: 600,
  BUS: 45,
  SUBWAY: 90,
  EXPRESSBUS: 45, TRAIN: 90, AIRPLANE: 90, FERRY: 90,
  CAR: 120,
  TAXI: 120,
};

const Z_P10 = -1.2816;
const Z_P90 = 1.2816;

export function computeFreshness(ageSeconds: number, mode: AlgoSegmentMode): number {
  const halfLife = MODE_HALF_LIFE_SECONDS[mode];
  return Math.exp(-Math.max(0, ageSeconds) / halfLife);
}

export function computeEffectiveConfidence(
  mode: AlgoSegmentMode,
  isRealtime: boolean,
  ageSeconds: number,
): number {
  const baseReliability = isRealtime ? 0.9 : MODE_BASE_RELIABILITY[mode];
  return baseReliability * computeFreshness(ageSeconds, mode);
}

export function buildTimeDistribution(
  durationMinutes: number,
  mode: AlgoSegmentMode,
  effectiveConfidence: number,
): TimeDistribution {
  const mean = Math.max(0.1, durationMinutes);
  const baseVariance = (mean * MODE_VARIANCE_COEFFICIENT[mode]) ** 2;
  // 데이터 신뢰도가 낮을수록 분산을 확대한다 (문서 §5-A)
  const variance = baseVariance / Math.max(effectiveConfidence, 0.1);
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    variance,
    confidence: effectiveConfidence,
    p10: Math.max(0, mean + Z_P10 * stdDev),
    p50: mean,
    p90: mean + Z_P90 * stdDev,
  };
}

// Box-Muller 표준정규분포 샘플러
export function sampleStandardNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function sampleFromDistribution(distribution: TimeDistribution): number {
  const stdDev = Math.sqrt(distribution.variance);
  const sample = distribution.mean + sampleStandardNormal() * stdDev;
  return Math.max(0, sample);
}
