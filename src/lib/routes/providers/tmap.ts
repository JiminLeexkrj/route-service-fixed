import { createHash } from "node:crypto";
import { isCoordinate } from "../geometry";
import { RouteSearchError, tmapRouteError } from "../errors";
import { addMinutesToArrivalTime } from "../time";
import type { Coordinate, MapPath, RawRoute, RouteSegment, SegmentMode, TravelMode } from "../types";

type Point = { lon?: number | string; lat?: number | string; name?: string };
type Stop = Point & { stationID?: string; stationName?: string; index?: number };
type Lane = { route?: string; routeId?: string; routeColor?: string; type?: number; service?: number };
type Leg = Lane & {
  mode?: string; sectionTime?: number; distance?: number; start?: Point; end?: Point;
  passShape?: { linestring?: string }; passStopList?: { stations?: Stop[] };
  steps?: { distance?: number; description?: string; streetName?: string; linestring?: string }[];
  lane?: Lane[];
};
export type TmapItinerary = { totalTime?: number; totalDistance?: number; pathType?: number; legs?: Leg[]; fare?: { regular?: { totalFare?: number } } };
export type TmapResponse = { metaData?: { plan?: { itineraries?: TmapItinerary[] } }; result?: { status?: number; message?: string }; error?: { code?: string; message?: string }; message?: string; code?: string };
const transitModes = new Set(["BUS", "SUBWAY", "EXPRESSBUS", "TRAIN", "AIRPLANE", "FERRY"]);
export const numberValue = (value: unknown): number | undefined => {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
  const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : undefined;
};
export function tmapPoint(value?: Point): Coordinate | undefined {
  if (value?.lon === undefined || value?.lat === undefined || value.lon === "" || value.lat === "") return undefined;
  const point = { lat: Number(value.lat), lng: Number(value.lon) };
  return isCoordinate(point) ? point : undefined;
}
export function parseLineString(value?: string): Coordinate[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const parts = value.trim().split(/\s+/);
  const points = parts.map((part) => {
    const pair = part.split(",");
    return pair.length === 2 ? tmapPoint({ lon: pair[0], lat: pair[1] }) : undefined;
  });
  return points.every((point): point is Coordinate => point !== undefined) ? points : [];
}
export function routeId(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 14)}`;
}

// 키는 요청 헤더로만 전송합니다. 제공자 오류를 브라우저에 전달할 때 인증값은 제거합니다.
export async function requestTmap(url: string, body: Record<string, unknown>, appKey: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { appKey, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new RouteSearchError("TMAP 서버에 연결하지 못했습니다.", timeout ? "TMAP_TIMEOUT" : "TMAP_NETWORK", [timeout ? "TMAP이 10초 안에 응답하지 않았습니다. 잠시 후 다시 시도해 주세요." : "인터넷 연결과 apis.openapi.sk.com 접속을 확인해 주세요."]);
  }
  const data = await response.json().catch(() => null) as TmapResponse | null;
  if (data?.error) throw tmapRouteError(data.error.code, data.error.message, response.status);
  if (data?.result?.status !== undefined && Number(data.result.status) !== 0 && Number(data.result.status) !== 200) throw tmapRouteError(data.result.status, data.result.message, response.status);
  if (!response.ok) throw tmapRouteError(data?.code ?? `HTTP_${response.status}`, data?.message ?? `HTTP ${response.status}`, response.status);
  if (!data || typeof data !== "object") throw tmapRouteError("INVALID_RESPONSE", "JSON 응답을 읽지 못했습니다.");
  return data as Record<string, unknown>;
}

function legPaths(leg: Leg, segment: RouteSegment, segmentIndex: number): MapPath[] {
  const mode = segment.mode;
  const strings = mode === "WALK" ? leg.steps?.map((step) => step.linestring) : [leg.passShape?.linestring];
  const lines = strings?.map(parseLineString) ?? [];
  const label = segment.routeName ?? "도보";
  if (lines.length && lines.every((points) => points.length >= 2)) return lines.map((points) => ({ mode, label, segmentIndex, points }));
  const points = [segment.fromCoordinate, ...(segment.transit?.stops ?? []).map((stop) => stop.coordinate), segment.toCoordinate].filter((point): point is Coordinate => Boolean(point));
  return points.length >= 2 ? [{ mode, label, segmentIndex, points, approximate: true }] : [];
}

export function parseTmapRoutes(data: TmapResponse, origin: Coordinate, destination: Coordinate, now = Date.now()): RawRoute[] {
  const itineraries = data.metaData?.plan?.itineraries;
  if (!Array.isArray(itineraries)) throw tmapRouteError("INVALID_RESPONSE", "상세 경로 목록이 없습니다. 대중교통 상세 API의 응답을 확인해 주세요.");
  if (!itineraries.length) throw tmapRouteError("NO_RESULTS", "검색된 대중교통 경로가 없습니다.");
  let endedService = 0;
  const routes = itineraries.flatMap((itinerary): RawRoute[] => {
    const legs = itinerary?.legs;
    if (!Array.isArray(legs) || !legs.length) return [];
    if (legs.some((leg) => leg && leg.mode !== "WALK" && Number(leg.service) === 0)) { endedService++; return []; }
    if (!legs.every((leg) => leg && (leg.mode === "WALK" || transitModes.has(leg.mode ?? "")) && numberValue(leg.sectionTime) !== undefined)) return [];
    const totalSeconds = numberValue(itinerary.totalTime) ?? legs.reduce((sum, leg) => sum + numberValue(leg.sectionTime)!, 0);
    const totalDistance = numberValue(itinerary.totalDistance) ?? (legs.every((leg) => numberValue(leg.distance) !== undefined) ? legs.reduce((sum, leg) => sum + numberValue(leg.distance)!, 0) : undefined);
    if (!totalSeconds || totalDistance === undefined) return [];
    const segments: RouteSegment[] = legs.map((leg, index) => {
      const mode = leg.mode as SegmentMode;
      const stops = (Array.isArray(leg.passStopList?.stations) ? leg.passStopList.stations : []).map((stop) => ({ name: stop.stationName ?? stop.name ?? "", id: stop.stationID, coordinate: tmapPoint(stop) })).filter((stop) => stop.name);
      const from = index === 0 && mode === "WALK" ? "현재 위치" : leg.start?.name ?? legs[index - 1]?.end?.name ?? "승차 위치";
      const to = index === legs.length - 1 && mode === "WALK" ? "목적지" : leg.end?.name ?? legs[index + 1]?.start?.name ?? "하차 위치";
      const lineName = leg.mode === "BUS" || leg.mode === "SUBWAY" ? leg.route?.replace(/^[^:：]+[:：]\s*/, "") : leg.route;
      const metroCode = mode === "SUBWAY" && Number(leg.type) >= 1 && Number(leg.type) <= 9 ? Number(leg.type) : undefined;
      return {
        mode, from, to, durationMinutes: numberValue(leg.sectionTime)! / 60,
        distanceMeters: numberValue(leg.distance), routeName: lineName || undefined,
        fromCoordinate: tmapPoint(leg.start) ?? (index === 0 ? origin : stops[0]?.coordinate),
        toCoordinate: tmapPoint(leg.end) ?? (index === legs.length - 1 ? destination : stops.at(-1)?.coordinate),
        ...(mode === "WALK" ? {
          walkingEnvironment: legs[index - 1]?.mode === "SUBWAY" && legs[index + 1]?.mode === "SUBWAY" ? "INDOOR" as const : "OUTDOOR" as const,
          steps: leg.steps?.map((step) => ({ description: step.description?.trim() || step.streetName || "보행로를 따라 이동", distanceMeters: numberValue(step.distance), points: parseLineString(step.linestring) })),
        } : { transit: {
          provider: "TMAP" as const, stationId: stops[0]?.id, endStationId: stops.at(-1)?.id,
          lineId: leg.routeId, lineCode: metroCode, nextStopName: stops[1]?.name,
          stationCount: stops.length > 1 ? stops.length - 1 : undefined, stops,
          service: leg.service === undefined ? undefined : Number(leg.service) === 1,
          // TMAP ID를 서울시 ID로 간주하지 않습니다. 실시간 API는 별도 식별자로 연결합니다.
          alternatives: leg.lane?.filter((lane) => Number(lane.service) !== 0 && lane.route).map((lane) => ({ name: lane.route!, id: lane.routeId })),
        } }),
      };
    });
    const vehicleModes = [...new Set(segments.filter((s) => s.mode !== "WALK").map((s) => s.mode))];
    const mode: TravelMode = vehicleModes.length === 0 ? "WALK" : vehicleModes.length === 1 ? vehicleModes[0] as TravelMode : "MIXED";
    const mapPaths = legs.flatMap((leg, index) => legPaths(leg, segments[index], index));
    const signature = segments.filter((s) => s.mode !== "WALK").map((s) => [s.mode, s.transit?.lineId ?? s.routeName, s.transit?.stationId ?? s.from, s.transit?.endStationId ?? s.to]);
    return [{ id: routeId("tmap", signature.length ? signature : [destination]), mode, durationMinutes: totalSeconds / 60, distanceMeters: totalDistance,
      estimatedArrivalTime: addMinutesToArrivalTime(totalSeconds / 60), fare: numberValue(itinerary.fare?.regular?.totalFare),
      segments, mapPaths, polyline: mapPaths.flatMap((path) => path.points), provider: "TMAP_TRANSIT", isRealtime: false, fetchedAt: new Date(now).toISOString(),
    }];
  });
  if (!routes.length) throw tmapRouteError(endedService === itineraries.length ? "NO_SERVICE" : "INVALID_RESPONSE", endedService === itineraries.length ? "조회 시각에 운행 종료된 경로입니다." : "이동 시간·거리·구간 데이터가 불완전합니다.");
  return routes;
}

export async function getTmapTransitRoutes(origin: Coordinate, destination: Coordinate): Promise<RawRoute[]> {
  const appKey = process.env.TMAP_APP_KEY?.trim();
  if (!appKey) throw new RouteSearchError("TMAP 대중교통 키를 설정해 주세요.", "TMAP_KEY_MISSING", [".env.local에 TMAP_APP_KEY=발급받은_appKey 를 입력한 뒤 서버를 재시작해 주세요.", "SK open API에서 해당 앱의 '대중교통 API' 사용 권한이 필요합니다."]);
  const now = Date.now();
  const searchDttm = new Date(now + 9 * 3600_000).toISOString().replace(/[-T:]/g, "").slice(0, 12);
  const data = await requestTmap("https://apis.openapi.sk.com/transit/routes", {
    startX: String(origin.lng), startY: String(origin.lat), endX: String(destination.lng), endY: String(destination.lat), lang: 0, format: "json", count: 10, searchDttm,
  }, appKey);
  return parseTmapRoutes(data as TmapResponse, origin, destination, now);
}
