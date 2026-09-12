import type { RiskLevel } from "@/types/trip";

// 문서 §7 주기적 갱신 권장값 (초 단위, 중간값 사용)
export function recommendedReevaluateSeconds(riskLevel: RiskLevel): number {
  switch (riskLevel) {
    case "DANGER":
    case "LATE":
      return 10;
    case "CAUTION":
      return 30;
    case "SAFE":
    default:
      return 45;
  }
}
