import {
  addMinutesToClock,
  clockFromDateTimeLocal,
  formatClock,
} from "@/lib/time";
import type {
  CurrentLocation,
  RouteOption,
  StartTripRequest,
  TripSnapshot,
} from "@/types/trip";

export const MOCK_CURRENT_LOCATION: CurrentLocation = {
  latitude: 37.5572,
  longitude: 126.9254,
  label: "홍대입구역 2번 출구 인근",
};

function initialRoutes(deadline: string): RouteOption[] {
  return [
    {
      id: "route-a",
      title: "버스 계속 이용",
      description: "7016번 버스 · 8정거장 · 도보 180m",
      arrivalTime: addMinutesToClock(deadline, -7),
      durationMinutes: 31,
      onTimeProbability: 87,
      extraCost: 0,
      recommended: true,
    },
    {
      id: "route-b",
      title: "다음 정류장 하차 → 지하철",
      description: "2호선 환승 · 6정거장 · 도보 420m",
      arrivalTime: addMinutesToClock(deadline, -10),
      durationMinutes: 28,
      onTimeProbability: 92,
      extraCost: 0,
      recommended: false,
    },
    {
      id: "route-c",
      title: "다음 정류장 하차 → 택시",
      description: "예상 택시 18분 · 도보 80m",
      arrivalTime: addMinutesToClock(deadline, -15),
      durationMinutes: 23,
      onTimeProbability: 98,
      extraCost: 8400,
      recommended: false,
    },
  ];
}

function trafficChangedRoutes(deadline: string): RouteOption[] {
  return [
    {
      id: "route-a",
      title: "버스 계속 이용",
      description: "앞 구간 정체 +12분 · 8정거장 · 도보 180m",
      arrivalTime: addMinutesToClock(deadline, 5),
      durationMinutes: 43,
      onTimeProbability: 24,
      extraCost: 0,
      recommended: false,
    },
    {
      id: "route-b",
      title: "다음 정류장 하차 → 지하철",
      description: "2호선 환승 · 6정거장 · 도보 420m",
      arrivalTime: addMinutesToClock(deadline, -4),
      durationMinutes: 34,
      onTimeProbability: 82,
      extraCost: 0,
      recommended: true,
    },
    {
      id: "route-c",
      title: "다음 정류장 하차 → 택시",
      description: "예상 택시 21분 · 도보 80m",
      arrivalTime: addMinutesToClock(deadline, -11),
      durationMinutes: 27,
      onTimeProbability: 97,
      extraCost: 8400,
      recommended: false,
    },
  ];
}

export function createInitialMockTrip(input: StartTripRequest): TripSnapshot {
  const deadline = clockFromDateTimeLocal(input.deadline);
  const now = formatClock(new Date());

  return {
    tripId: `demo-${Date.now()}`,
    originLabel: input.useCurrentLocation
      ? MOCK_CURRENT_LOCATION.label
      : "현재 위치",
    destination: input.destination,
    status: {
      currentTime: now,
      deadline,
      expectedArrival: addMinutesToClock(deadline, -7),
      onTimeProbability: 87,
      riskLevel: "SAFE",
      recommendedAction: "현재 버스를 계속 이용하세요.",
    },
    routes: initialRoutes(deadline),
    alert: null,
    updatedAt: new Date().toISOString(),
  };
}

export function createTrafficChangedMockTrip(
  current: TripSnapshot,
): TripSnapshot {
  const deadline = current.status.deadline;
  const previousArrival = addMinutesToClock(deadline, 5);
  const newArrival = addMinutesToClock(deadline, -4);

  return {
    ...current,
    status: {
      ...current.status,
      currentTime: formatClock(new Date()),
      expectedArrival: newArrival,
      onTimeProbability: 82,
      riskLevel: "CAUTION",
      recommendedAction: "다음 정류장에서 내리세요.",
    },
    routes: trafficChangedRoutes(deadline),
    alert: {
      id: `alert-${Date.now()}`,
      title: "앞 구간 교통체증 발생",
      detail: "기존 경로 이용 시 5분 지각이 예상돼요.",
      suggestion: "더 빠른 지하철 환승 경로를 찾았습니다.",
      previousArrival,
      newArrival,
      occurredAt: formatClock(new Date()),
      severity: "WARNING",
    },
    updatedAt: new Date().toISOString(),
  };
}

