import { NextRequest, NextResponse } from "next/server";
import { getTransitArrivals } from "@/lib/transit/arrivals";
import type { ArrivalQuery, TimetableDay } from "@/lib/transit/types";
import { isCoordinate } from "@/lib/routes/geometry";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const text = (name: string, limit = 80) => {
    const value = params.get(name)?.trim();
    if (value && (value.length > limit || /[\u0000-\u001f]/.test(value))) throw new Error("조회 값이 올바르지 않습니다.");
    return value || undefined;
  };
  const integer = (name: string) => {
    const value = text(name, 10);
    if (value === undefined) return undefined;
    if (!/^\d{1,7}$/.test(value)) throw new Error("노선·지역 코드가 올바르지 않습니다.");
    return Number(value);
  };
  try {
    const mode = text("mode");
    const kind = text("kind");
    const stationName = text("stationName");
    const lineName = text("lineName");
    const directionCode = integer("directionCode");
    const day = text("day") ?? "auto";
    const lat = text("stationLat", 24); const lng = text("stationLng", 24);
    const station = lat !== undefined || lng !== undefined ? { lat: lat === undefined ? NaN : Number(lat), lng: lng === undefined ? NaN : Number(lng) } : undefined;
    if (station && !isCoordinate(station)) throw new Error("승차 지점 좌표를 확인해 주세요.");
    if ((mode !== "BUS" && mode !== "SUBWAY") || (kind !== "realtime" && kind !== "schedule") || !stationName || !lineName ||
      (directionCode !== undefined && directionCode !== 1 && directionCode !== 2) || !["auto", "weekday", "saturday", "holiday"].includes(day)) throw new Error("역·노선·조회 종류를 확인해 주세요.");
    const query: ArrivalQuery = { mode, kind, stationName, lineName, directionCode, day: day as TimetableDay,
      stationId: text("stationId", 20), arsId: text("arsId", 12), localLineId: text("localLineId", 30),
      cityCode: integer("cityCode"), lineCode: integer("lineCode"), nextStopName: text("nextStopName"),
      stationLat: station?.lat, stationLng: station?.lng,
    };
    return NextResponse.json(await getTransitArrivals(query), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: { message: "도착정보 조회 조건을 확인해 주세요." } }, { status: 400 });
  }
}
