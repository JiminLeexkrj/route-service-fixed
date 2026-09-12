import { createCurvedPolyline, haversineDistanceMeters } from "./geometry";
import { addMinutesToArrivalTime } from "./time";
import type {
  Coordinate,
  DemoScenario,
  RawRoute,
  RoutesResponse,
} from "./types";

function scaledDistance(
  directDistance: number,
  multiplier: number,
  minimum: number,
): number {
  return Math.max(minimum, Math.round(directDistance * multiplier));
}

export function buildMockRoutes(
  origin: Coordinate,
  destination: Coordinate,
  elapsedSeconds = 0,
  fallbackReason?: string,
): RoutesResponse {
  const configuredThreshold = Number(
    process.env.DEMO_CONGESTION_AFTER_SECONDS ?? "30",
  );
  const congestionAtSeconds = Number.isFinite(configuredThreshold)
    ? Math.max(1, configuredThreshold)
    : 30;
  const scenario: DemoScenario =
    elapsedSeconds >= congestionAtSeconds ? "CONGESTED" : "NORMAL";
  const now = new Date();
  const fetchedAt = now.toISOString();
  const directDistance = haversineDistanceMeters(origin, destination);

  const currentDuration = scenario === "CONGESTED" ? 46 : 38;
  const alternativeDuration = scenario === "CONGESTED" ? 34 : 43;
  const currentBusDuration = scenario === "CONGESTED" ? 18 : 10;
  const alternativeBusDuration = scenario === "CONGESTED" ? 12 : 21;

  const routes: RawRoute[] = [
    {
      id: "demo-current-route",
      mode: "MIXED",
      durationMinutes: currentDuration,
      distanceMeters: scaledDistance(directDistance, 1.24, 7_200),
      estimatedArrivalTime: addMinutesToArrivalTime(currentDuration, now),
      fare: 1_500,
      provider: "MOCK",
      isRealtime: false,
      fetchedAt,
      polyline: createCurvedPolyline(origin, destination, 0.004),
      segments: [
        {
          mode: "WALK",
          from: "현재 위치",
          to: "시청앞 정류장",
          durationMinutes: 5,
          distanceMeters: 420,
        },
        {
          mode: "BUS",
          from: "시청앞 정류장",
          to: "종로3가",
          durationMinutes: currentBusDuration,
          distanceMeters: 2_600,
          routeName: "간선 273",
        },
        {
          mode: "SUBWAY",
          from: "종로3가역",
          to: "목적지 인근역",
          durationMinutes: 19,
          distanceMeters: 3_700,
          routeName: "수도권 전철",
        },
        {
          mode: "WALK",
          from: "목적지 인근역",
          to: "목적지",
          durationMinutes: 4,
          distanceMeters: 480,
        },
      ],
    },
    {
      id: "demo-alternative-route",
      mode: "MIXED",
      durationMinutes: alternativeDuration,
      distanceMeters: scaledDistance(directDistance, 1.31, 7_600),
      estimatedArrivalTime: addMinutesToArrivalTime(alternativeDuration, now),
      fare: 1_500,
      provider: "MOCK",
      isRealtime: false,
      fetchedAt,
      polyline: createCurvedPolyline(origin, destination, -0.006),
      segments: [
        {
          mode: "WALK",
          from: "현재 위치",
          to: "을지로입구역",
          durationMinutes: 6,
          distanceMeters: 510,
        },
        {
          mode: "SUBWAY",
          from: "을지로입구역",
          to: "환승역",
          durationMinutes: alternativeBusDuration,
          distanceMeters: 4_600,
          routeName: "2호선",
        },
        {
          mode: "BUS",
          from: "환승역 정류장",
          to: "목적지 앞 정류장",
          durationMinutes: 10,
          distanceMeters: 1_900,
          routeName: "지선 1222",
        },
        {
          mode: "WALK",
          from: "목적지 앞 정류장",
          to: "목적지",
          durationMinutes: 6,
          distanceMeters: 590,
        },
      ],
    },
    {
      id: "demo-bus-route",
      mode: "BUS",
      durationMinutes: 47,
      distanceMeters: scaledDistance(directDistance, 1.18, 6_900),
      estimatedArrivalTime: addMinutesToArrivalTime(47, now),
      fare: 1_500,
      provider: "MOCK",
      isRealtime: false,
      fetchedAt,
      polyline: createCurvedPolyline(origin, destination, 0.009),
      segments: [
        {
          mode: "WALK",
          from: "현재 위치",
          to: "광화문 정류장",
          durationMinutes: 6,
          distanceMeters: 480,
        },
        {
          mode: "BUS",
          from: "광화문 정류장",
          to: "목적지 앞 정류장",
          durationMinutes: 35,
          distanceMeters: 6_100,
          routeName: "간선 101",
        },
        {
          mode: "WALK",
          from: "목적지 앞 정류장",
          to: "목적지",
          durationMinutes: 6,
          distanceMeters: 420,
        },
      ],
    },
    {
      id: "demo-car-route",
      mode: "CAR",
      durationMinutes: scenario === "CONGESTED" ? 33 : 29,
      distanceMeters: scaledDistance(directDistance, 1.14, 6_700),
      estimatedArrivalTime: addMinutesToArrivalTime(
        scenario === "CONGESTED" ? 33 : 29,
        now,
      ),
      fare: scenario === "CONGESTED" ? 17_500 : 15_800,
      provider: "MOCK",
      isRealtime: false,
      fetchedAt,
      polyline: createCurvedPolyline(origin, destination, -0.011),
      segments: [
        {
          mode: "CAR",
          from: "현재 위치",
          to: "목적지",
          durationMinutes: scenario === "CONGESTED" ? 33 : 29,
          distanceMeters: scaledDistance(directDistance, 1.14, 6_700),
          routeName: "택시 가정 경로",
        },
      ],
    },
  ];

  return {
    routes,
    generatedAt: fetchedAt,
    source: "mock",
    providers: ["MOCK"],
    fallbackReason,
    demo: {
      scenario,
      elapsedSeconds: Math.floor(elapsedSeconds),
      congestionAtSeconds,
      message:
        scenario === "CONGESTED"
          ? "교통체증 발생: 기존 경로가 38분에서 46분으로 증가했고 대체 경로가 34분으로 단축되었습니다."
          : `${congestionAtSeconds}초 후 교통체증 이벤트가 발생합니다. 현재 경로는 38분입니다.`,
    },
  };
}

