import type { JourneySegment } from "@/lib/routes/types";

export type TimetableDay = "auto" | "weekday" | "saturday" | "holiday";
export type ArrivalQuery = {
  kind: "realtime" | "schedule";
  mode: "BUS" | "SUBWAY";
  stationName: string;
  lineName: string;
  stationId?: string;
  arsId?: string;
  cityCode?: number;
  localLineId?: string;
  lineCode?: number;
  directionCode?: 1 | 2;
  nextStopName?: string;
  stationLat?: number;
  stationLng?: number;
  day?: TimetableDay;
};
export type Departure = {
  id: string;
  lineName: string;
  destination: string;
  arrivalAt?: number;
  message: string;
  updatedAt?: number;
};
export type ArrivalResponse = {
  status: "live" | "schedule" | "unavailable" | "error";
  source: string;
  fetchedAt: number;
  departures: Departure[];
  message: string;
  serviceDay?: string;
};

export function arrivalQuery(segment: JourneySegment, kind: ArrivalQuery["kind"] = "realtime", day: TimetableDay = "auto"): ArrivalQuery | null {
  if (segment.mode !== "BUS" && segment.mode !== "SUBWAY") return null;
  const transit = segment.transit;
  return {
    kind, mode: segment.mode, stationName: segment.from, lineName: segment.routeName ?? "",
    stationId: transit?.stationId, arsId: transit?.arsId, cityCode: transit?.cityCode,
    localLineId: transit?.localLineId, lineCode: transit?.lineCode,
    directionCode: transit?.directionCode, nextStopName: transit?.nextStopName, day,
    stationLat: segment.fromCoordinate?.lat, stationLng: segment.fromCoordinate?.lng,
  };
}
export function arrivalSearchParams(query: ArrivalQuery): URLSearchParams {
  return new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
}

export function arrivalLabel(departure: Departure, now: number): string {
  if (departure.arrivalAt === undefined) return departure.message;
  const seconds = Math.ceil((departure.arrivalAt - now) / 1000);
  if (seconds < -30) return "예정 시각 지남 · 재조회 필요";
  return seconds <= 30 ? "곧 도착" : `${Math.ceil(seconds / 60)}분 뒤`;
}
