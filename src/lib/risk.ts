import type { RiskLevel } from "@/types/trip";

export const RISK_META: Record<
  RiskLevel,
  {
    label: string;
    message: string;
    color: string;
    textClass: string;
    bgClass: string;
    borderClass: string;
    dotClass: string;
  }
> = {
  SAFE: {
    label: "안전",
    message: "현재 경로라면 여유 있게 도착해요",
    color: "#10b981",
    textClass: "text-emerald-700",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  CAUTION: {
    label: "주의",
    message: "추천 경로를 따르면 정시 도착 가능해요",
    color: "#eab308",
    textClass: "text-yellow-700",
    bgClass: "bg-yellow-50",
    borderClass: "border-yellow-200",
    dotClass: "bg-yellow-500",
  },
  DANGER: {
    label: "위험",
    message: "지금 경로를 바꿔야 정시 도착할 수 있어요",
    color: "#f97316",
    textClass: "text-orange-700",
    bgClass: "bg-orange-50",
    borderClass: "border-orange-200",
    dotClass: "bg-orange-500",
  },
  LATE: {
    label: "지각 예상",
    message: "가장 빠른 대체 경로를 확인하세요",
    color: "#ef4444",
    textClass: "text-red-700",
    bgClass: "bg-red-50",
    borderClass: "border-red-200",
    dotClass: "bg-red-500",
  },
};

