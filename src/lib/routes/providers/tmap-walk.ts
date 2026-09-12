import { numberValue, requestTmap, routeId, tmapPoint } from "./tmap";
import { RouteSearchError } from "../errors";
import { addMinutesToArrivalTime } from "../time";
import type { Coordinate, MapPath, RawRoute, WalkingStep } from "../types";

type Feature = { geometry?: { type?: string; coordinates?: unknown }; properties?: { totalTime?: number; totalDistance?: number; time?: number; distance?: number; description?: string; name?: string } };
export function parseTmapWalk(data: { features?: Feature[] }, origin: Coordinate, destination: Coordinate): RawRoute[] {
  const features = Array.isArray(data.features) ? data.features : [];
  const total = features.find((feature) => numberValue(feature.properties?.totalTime) !== undefined)?.properties;
  const seconds = numberValue(total?.totalTime); const distance = numberValue(total?.totalDistance);
  const paths: MapPath[] = [];
  const steps: WalkingStep[] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (geometry?.type === "Point" && feature.properties?.description) steps.push({ description: feature.properties.description, distanceMeters: numberValue(feature.properties.distance), points: [] });
    if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) continue;
    const points = geometry.coordinates.map((pair) => Array.isArray(pair) ? tmapPoint({ lon: pair[0], lat: pair[1] }) : undefined);
    if (points.length < 2 || !points.every((point): point is Coordinate => Boolean(point))) continue;
    paths.push({ mode: "WALK", segmentIndex: 0, points, label: "도보" });
  }
  if (!seconds || distance === undefined || !paths.length) throw new RouteSearchError("TMAP 보행 경로를 읽지 못했습니다.", "TMAP_WALK_INVALID_RESPONSE");
  return [{ id: routeId("tmap-walk", [destination]), mode: "WALK", durationMinutes: seconds / 60, distanceMeters: distance,
    estimatedArrivalTime: addMinutesToArrivalTime(seconds / 60), provider: "TMAP_WALK", isRealtime: false, fetchedAt: new Date().toISOString(),
    segments: [{ mode: "WALK", from: "현재 위치", to: "목적지", fromCoordinate: origin, toCoordinate: destination, durationMinutes: seconds / 60, distanceMeters: distance, walkingEnvironment: "OUTDOOR", steps }],
    mapPaths: paths, polyline: paths.flatMap((path) => path.points),
  }];
}
export async function getTmapWalkRoutes(origin: Coordinate, destination: Coordinate): Promise<RawRoute[]> {
  const key = (process.env.TMAP_WALK_APP_KEY || process.env.TMAP_APP_KEY)?.trim();
  if (!key) return [];
  const data = await requestTmap("https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1", {
    startX: origin.lng, startY: origin.lat, endX: destination.lng, endY: destination.lat,
    startName: encodeURIComponent("현재 위치"), endName: encodeURIComponent("목적지"), reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO", searchOption: "0",
  }, key);
  return parseTmapWalk(data, origin, destination);
}
