import { haversineDistanceMeters, isCoordinate } from "./geometry";
import type { Coordinate, LocationFix, MapPath } from "./types";

export type DrawPath = MapPath & { traveled?: boolean };

export function isFreshFix(fix: LocationFix, previous?: LocationFix | null, now = Date.now()): boolean {
  return isCoordinate(fix) && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 &&
    Number.isFinite(fix.timestamp) && now - fix.timestamp <= 30_000 && fix.timestamp <= now + 5_000 &&
    (!previous || fix.timestamp > previous.timestamp);
}

// 꼭짓점 대신 선분에 투영하여 이동 중 진행 상태와 경로까지의 거리를 계산합니다.
export function projectOnPaths(paths: MapPath[], position: Coordinate) {
  let best: { pathIndex: number; pointIndex: number; point: Coordinate; distance: number } | null = null;
  const scale = Math.cos(position.lat * Math.PI / 180);
  paths.forEach((path, pathIndex) => {
    for (let i = 0; i + 1 < path.points.length; i++) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const dx = (b.lng - a.lng) * scale;
      const dy = b.lat - a.lat;
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1,
        (((position.lng - a.lng) * scale) * dx + (position.lat - a.lat) * dy) / length,
      )) : 0;
      const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      const distance = haversineDistanceMeters(position, point);
      if (!best || distance < best.distance) best = { pathIndex, pointIndex: i, point, distance };
    }
  });
  return best as { pathIndex: number; pointIndex: number; point: Coordinate; distance: number } | null;
}

export function splitProgress(paths: MapPath[], fix?: LocationFix | null): DrawPath[] {
  if (!fix || fix.accuracy > 100) return paths;
  const projection = projectOnPaths(paths, fix);
  if (!projection || projection.distance > Math.max(50, fix.accuracy * 2)) return paths;
  return paths.flatMap((path, index): DrawPath[] => {
    if (index < projection.pathIndex) return [{ ...path, traveled: true }];
    if (index > projection.pathIndex) return [path];
    return [
      { ...path, traveled: true, points: [...path.points.slice(0, projection.pointIndex + 1), projection.point] },
      { ...path, points: [projection.point, ...path.points.slice(projection.pointIndex + 1)] },
    ];
  });
}

export function shouldReplan(input: {
  now: number; lastAttempt: number; intervalSeconds: number;
  evaluatedOrigin?: Coordinate; fix?: LocationFix | null; paths?: MapPath[];
}): boolean {
  const elapsed = input.now - input.lastAttempt;
  // GPS 신호마다 API를 호출하지 않습니다. 자동 요청은 최소 10초 간격입니다.
  if (elapsed < 10_000) return false;
  if (elapsed >= Math.max(10, input.intervalSeconds) * 1000) return true;
  const fix = input.fix;
  if (!fix || fix.accuracy > 100 || !isFreshFix(fix, null, input.now)) return false;
  const moved = input.evaluatedOrigin ? haversineDistanceMeters(input.evaluatedOrigin, fix) : 0;
  if (moved >= Math.max(10, fix.accuracy * 1.5)) return true;
  const exactPaths = (input.paths ?? []).filter((path) => !path.approximate);
  const projection = projectOnPaths(exactPaths, fix);
  // 도보 등 근사 구간 위에서는 정확한 차도 선까지의 거리를 이탈로 해석하지 않습니다.
  const all = projectOnPaths(input.paths ?? [], fix);
  return Boolean(projection && all && projection.distance > Math.max(60, fix.accuracy * 2) && all.distance > Math.max(60, fix.accuracy * 2));
}
