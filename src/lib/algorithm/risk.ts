import type { RiskLevel } from "@/types/trip";
import type { PolicyForecast } from "./types";

// 문서 §6 calculateRiskLevel을 그대로 구현한다.
export function calculateRiskLevel(
  forecast: PolicyForecast,
  deadline: number,
): RiskLevel {
  const p90SlackMinutes = (deadline - forecast.arrivalP90) / 60_000;

  if (
    forecast.onTimeProbability >= 0.9 &&
    p90SlackMinutes >= 5 &&
    forecast.forecastConfidence >= 0.7
  ) {
    return "SAFE";
  }
  if (forecast.onTimeProbability >= 0.75 && p90SlackMinutes >= 0) {
    return "CAUTION";
  }
  if (forecast.onTimeProbability >= 0.4) {
    return "DANGER";
  }
  return "LATE";
}
