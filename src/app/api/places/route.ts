import { NextRequest, NextResponse } from "next/server";
import { parsePlaceQuery, QueryValidationError } from "@/lib/http/query";
import { searchKakaoPlaces } from "@/lib/places/kakao";
import { searchMockPlaces } from "@/lib/places/mock";
import { parseCoordinate } from "@/lib/routes/geometry";
import type { ApiErrorResponse, PlacesResponse } from "@/lib/routes/types";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: NextRequest): Promise<NextResponse<PlacesResponse | ApiErrorResponse>> {
  try {
    const { keyword, origin } = parsePlaceQuery(request.nextUrl.searchParams);
    const coordinate = parseCoordinate(keyword);
    // 장소 검색과 경로 DEMO 설정은 독립적입니다. 명시적으로 요청할 때만 mock을 사용합니다.
    const demo = request.nextUrl.searchParams.get("mode") === "demo" || request.nextUrl.searchParams.get("demo") === "true";
    const places = coordinate
      ? [{ ...coordinate, name: `지정한 위치 (${keyword})`, address: keyword }]
      : demo ? searchMockPlaces(keyword) : await searchKakaoPlaces(keyword, origin);
    return NextResponse.json({
      places,
      generatedAt: new Date().toISOString(),
      source: demo && !coordinate ? "mock" : "live",
      provider: coordinate ? "COORDINATE" : demo ? "MOCK" : "KAKAO_LOCAL",
    }, { headers });
  } catch (error) {
    const invalid = error instanceof QueryValidationError;
    return NextResponse.json({ error: {
      code: invalid ? "INVALID_QUERY" : "PLACE_PROVIDER_FAILED",
      message: error instanceof Error ? error.message : "장소 검색에 실패했습니다.",
      ...(invalid ? { details: error.details } : {}),
    } }, { status: invalid ? 400 : 502, headers });
  }
}
