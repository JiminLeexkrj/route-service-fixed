import type { RawRoute, RouteSegment } from "@/lib/routes/types";
import type { UserPreferences } from "@/types/trip";
import { buildTimeDistribution, computeEffectiveConfidence } from "./distribution";
import type { AlgoSegmentMode, RealtimeRouteSegment, RoutePolicy } from "./types";

const BOARD_PROBABILITY: Record<AlgoSegmentMode, number> = {
  WALK: 1, RUN: 1, BUS: 0.93, SUBWAY: 0.97, EXPRESSBUS: 0.93, TRAIN: 0.97, AIRPLANE: 0.95, FERRY: 0.9, CAR: 1, TAXI: 1,
};

// 8 km/h의 가벼운 달리기 가정. 횡단·출입구 이동 시간을 전부 없애지 않도록
// 원래 보행 시간의 60%를 하한으로 남깁니다. 차량 이동 시간은 바꾸지 않습니다.
export function runningMinutes(segment: RouteSegment): number {
  return Math.round(Math.max((segment.distanceMeters ?? 0) / (8000 / 60), segment.durationMinutes * 0.6) * 10) / 10;
}
export function canRunSegment(segment: RouteSegment): boolean {
  return segment.mode === "WALK" && segment.walkingEnvironment !== "INDOOR" &&
    (segment.distanceMeters ?? 0) >= 60 && (segment.distanceMeters ?? 0) <= 5000 &&
    segment.durationMinutes - runningMinutes(segment) >= 0.3;
}

function buildSegment(segment: RouteSegment, index: number, route: RawRoute, now: number, run: boolean): RealtimeRouteSegment {
  const running = run && canRunSegment(segment);
  const mode: AlgoSegmentMode = running ? "RUN" : segment.mode === "CAR" ? "TAXI" : segment.mode;
  const duration = running ? runningMinutes(segment) : segment.durationMinutes;
  const ageSeconds = route.fetchedAt ? Math.max(0, (now - new Date(route.fetchedAt).getTime()) / 1000) : 0;
  const confidence = computeEffectiveConfidence(mode, Boolean(route.isRealtime), ageSeconds);
  const { durationMinutes: _, ...details } = segment;
  return {
    ...details, id: `${route.id}${run ? "-run" : ""}-seg-${index}`, mode,
    travelTime: buildTimeDistribution(duration, mode, confidence),
    boardProbability: BOARD_PROBABILITY[mode],
    transferSuccessProbability: mode === "WALK" || mode === "RUN" ? 1 : 0.95,
    realtimeConfidence: confidence,
    isRoadDependent: mode === "BUS" || mode === "TAXI",
    ...(running ? { walkingDurationMinutes: segment.durationMinutes, savedMinutes: segment.durationMinutes - duration } : {}),
  };
}

function routeSignature(route: RawRoute): string {
  return route.segments.filter((s) => s.mode !== "WALK").map((s) =>
    `${s.mode}:${s.routeName ?? ""}:${s.transit?.stationId ?? s.from}:${s.transit?.endStationId ?? s.to}`,
  ).join("|");
}
function policyLabel(route: RawRoute): string {
  const transit = route.segments.filter((s) => s.mode !== "WALK");
  return transit.length ? transit.map((s) => s.mode === "CAR" ? "택시" : s.routeName ?? s.mode).join(" → ") : "도보 이동";
}

export function buildPolicies(routes: RawRoute[], now: number, preferences: Pick<UserPreferences, "allowTaxi" | "canRun">): RoutePolicy[] {
  const best = new Map<string, RawRoute>();
  for (const route of routes) {
    const signature = routeSignature(route);
    if (!best.has(signature) || route.durationMinutes < best.get(signature)!.durationMinutes) best.set(signature, route);
  }
  const policies = Array.from(best.values()).flatMap((route) => {
    if (!preferences.allowTaxi && route.segments.some((s) => s.mode === "CAR")) return [];
    const variants = preferences.canRun && route.segments.some(canRunSegment) ? [false, true] : [false];
    return variants.map((run): RoutePolicy => {
      const segments = route.segments.map((s, i) => buildSegment(s, i, route, now, run));
      const onFoot = segments.filter((s) => s.mode === "WALK" || s.mode === "RUN");
      return {
        id: `${route.id}${run ? "-run" : ""}`, label: `${run ? "달리기 포함 · " : ""}${policyLabel(route)}`,
        sourceRouteId: route.id, mode: route.mode, polyline: route.polyline,
        mapPaths: route.mapPaths?.map((path) => ({ ...path,
          mode: run && path.segmentIndex !== undefined && segments[path.segmentIndex]?.mode === "RUN" ? "RUN" : path.mode,
        })),
        segments, extraCost: route.fare ?? 0,
        walkingMinutes: onFoot.reduce((sum, s) => sum + s.travelTime.mean, 0),
        walkingMeters: onFoot.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0),
        transferCount: Math.max(0, segments.length - onFoot.length - 1),
        usesTaxi: segments.some((s) => s.mode === "TAXI"),
      };
    });
  });
  const sorted = [...policies].sort((a, b) => totalMinutes(a) - totalMinutes(b));
  return policies.map((policy) => ({ ...policy,
    fallbackPolicyId: sorted.find((candidate) => candidate.sourceRouteId !== policy.sourceRouteId)?.id,
  }));
}
function totalMinutes(policy: RoutePolicy): number {
  return policy.segments.reduce((sum, s) => sum + s.travelTime.mean, 0);
}
