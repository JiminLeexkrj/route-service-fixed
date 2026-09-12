import { haversineDistanceMeters } from "./geometry";
import { isFreshFix, projectOnPaths } from "./navigation";
import type { JourneySegment, LocationFix, MapPath } from "./types";

/** 경로 재조회 사이에도 현재 보행 구간의 남은 거리·시간·세부 동작은 GPS마다 갱신합니다. */
export function updateWalkingProgress(segment: JourneySegment, paths: MapPath[], fix?: LocationFix | null, now = Date.now()): JourneySegment {
  if (!fix || !isFreshFix(fix, null, now) || fix.accuracy > 50 || (segment.mode !== "WALK" && segment.mode !== "RUN")) return segment;
  const exact = paths.filter((path) => !path.approximate);
  const nearest = projectOnPaths(exact, fix);
  if (!nearest || nearest.distance > Math.max(25, fix.accuracy * 1.5)) return segment;
  let total = 0; let remaining = 0;
  exact.forEach((path, pathIndex) => {
    path.points.slice(1).forEach((point, index) => {
      const length = haversineDistanceMeters(path.points[index], point); total += length;
      if (pathIndex > nearest.pathIndex || (pathIndex === nearest.pathIndex && index > nearest.pointIndex)) remaining += length;
      if (pathIndex === nearest.pathIndex && index === nearest.pointIndex) remaining += haversineDistanceMeters(nearest.point, point);
    });
  });
  if (total <= 0) return segment;
  const ratio = Math.min(1, remaining / total);
  const stepPaths = (segment.steps ?? []).map((step) => ({ mode: "WALK" as const, points: step.points }));
  const stepPosition = projectOnPaths(stepPaths, fix);
  return { ...segment, distanceMeters: Math.round((segment.distanceMeters ?? total) * ratio), durationMinutes: segment.durationMinutes * ratio,
    steps: stepPosition && stepPosition.distance < 50 ? segment.steps?.slice(stepPosition.pathIndex) : segment.steps,
  };
}
