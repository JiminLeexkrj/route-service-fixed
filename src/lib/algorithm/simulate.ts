import { sampleFromDistribution, sampleStandardNormal } from "./distribution";
import type { PolicyForecast, RoutePolicy } from "./types";

const SIMULATION_RUNS = 500;
const SEVERE_LATE_MINUTES = 10;
const SHARED_TRAFFIC_SIGMA = 0.15;
const STRANDING_PENALTY_MINUTES = 25;

function percentile(sortedValues: number[], p: number): number {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round(p * (sortedValues.length - 1))),
  );
  return sortedValues[index];
}

/**
 * 정책 하나를 500회 몬테카를로 시뮬레이션한다 (문서 §5-E).
 * 도로에 의존하는 구간(BUS/CAR/TAXI)은 공통 정체 변수를 공유해서 샘플링한다.
 * 그렇지 않으면 여러 구간이 같은 정체의 영향을 받는 상황의 위험을 과소평가한다.
 */
export function simulatePolicy(
  policy: RoutePolicy,
  now: number,
  deadline: number,
): PolicyForecast {
  const arrivalOffsets: number[] = [];
  const confidences: number[] = [];
  let strandedCount = 0;

  for (let run = 0; run < SIMULATION_RUNS; run += 1) {
    const sharedTrafficFactor = 1 + sampleStandardNormal() * SHARED_TRAFFIC_SIGMA;
    let totalMinutes = 0;
    let stranded = false;

    for (const segment of policy.segments) {
      let minutes = sampleFromDistribution(segment.travelTime);
      if (segment.isRoadDependent) {
        minutes *= Math.max(0.4, sharedTrafficFactor);
      }

      const boarded = Math.random() <= segment.boardProbability;
      const transferred = Math.random() <= segment.transferSuccessProbability;
      if (!boarded || !transferred) {
        stranded = true;
        minutes += STRANDING_PENALTY_MINUTES;
      }

      totalMinutes += minutes;
      confidences.push(segment.realtimeConfidence);
    }

    if (stranded) strandedCount += 1;
    arrivalOffsets.push(totalMinutes * 60_000);
  }

  arrivalOffsets.sort((a, b) => a - b);
  const arrivalP10 = now + percentile(arrivalOffsets, 0.1);
  const arrivalP50 = now + percentile(arrivalOffsets, 0.5);
  const arrivalP90 = now + percentile(arrivalOffsets, 0.9);

  const onTimeCount = arrivalOffsets.filter(
    (offset) => now + offset <= deadline,
  ).length;
  const severeLateCount = arrivalOffsets.filter(
    (offset) => now + offset - deadline > SEVERE_LATE_MINUTES * 60_000,
  ).length;
  const lateMinutesSum = arrivalOffsets.reduce((sum, offset) => {
    const lateMinutes = (now + offset - deadline) / 60_000;
    return sum + Math.max(0, lateMinutes);
  }, 0);

  return {
    arrivalP10,
    arrivalP50,
    arrivalP90,
    onTimeProbability: onTimeCount / SIMULATION_RUNS,
    expectedLateMinutes: lateMinutesSum / SIMULATION_RUNS,
    severeLateProbability: severeLateCount / SIMULATION_RUNS,
    strandingProbability: strandedCount / SIMULATION_RUNS,
    forecastConfidence:
      confidences.reduce((sum, value) => sum + value, 0) /
      Math.max(1, confidences.length),
  };
}
