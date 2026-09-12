import { addMinutesToArrivalTime } from "@/lib/routes/time";
import type { Coordinate, RawRoute } from "@/lib/routes/types";

type KakaoRoad = {
  name?: string;
  vertexes?: number[];
};

type KakaoSection = {
  distance?: number;
  duration?: number;
  roads?: KakaoRoad[];
};

type KakaoRoute = {
  result_code?: number;
  result_msg?: string;
  summary?: {
    distance?: number;
    duration?: number;
    fare?: {
      taxi?: number;
      toll?: number;
    };
  };
  sections?: KakaoSection[];
};

type KakaoDirectionsResponse = {
  routes?: KakaoRoute[];
};

function toPolyline(route: KakaoRoute): Coordinate[] {
  const coordinates: Coordinate[] = [];

  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const vertexes = road.vertexes ?? [];
      for (let index = 0; index + 1 < vertexes.length; index += 2) {
        const lng = vertexes[index];
        const lat = vertexes[index + 1];
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          coordinates.push({ lat, lng });
        }
      }
    }
  }

  // 도로의 굽은 구간을 600개 점으로 잘라 지름길처럼 보이지 않도록 원래 형상을 보존합니다.
  return coordinates;
}

function routeRoadName(route: KakaoRoute): string {
  const uniqueNames = Array.from(
    new Set(
      (route.sections ?? [])
        .flatMap((section) => section.roads ?? [])
        .map((road) => road.name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );

  return uniqueNames.slice(0, 3).join(" → ") || "실시간 자동차 경로";
}

export async function getKakaoCarRoutes(
  origin: Coordinate,
  destination: Coordinate,
): Promise<RawRoute[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    throw new Error("KAKAO_REST_API_KEY가 설정되지 않았습니다.");
  }

  const params = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    priority: "RECOMMEND",
    alternatives: "true",
    summary: "false",
    road_details: "false",
    car_fuel: "GASOLINE",
    car_hipass: "false",
  });

  const response = await fetch(
    `https://apis-navi.kakaomobility.com/v1/directions?${params.toString()}`,
    {
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Kakao Mobility API 오류 (${response.status})`);
  }

  const data = (await response.json()) as KakaoDirectionsResponse;
  const fetchedAt = new Date().toISOString();

  return (data.routes ?? [])
    .filter(
      (route) =>
        route.result_code === 0 &&
        Number.isFinite(route.summary?.duration) &&
        Number.isFinite(route.summary?.distance),
    )
    .slice(0, 2)
    .map((route, index): RawRoute => {
      const durationMinutes = Math.max(
        1,
        Math.ceil((route.summary?.duration ?? 0) / 60),
      );
      const distanceMeters = Math.round(route.summary?.distance ?? 0);
      const taxiFare = route.summary?.fare?.taxi;
      const polyline = toPolyline(route);

      return {
        id: `kakao-car-${index + 1}`,
        mode: "CAR",
        durationMinutes,
        distanceMeters,
        estimatedArrivalTime: addMinutesToArrivalTime(durationMinutes),
        ...(Number.isFinite(taxiFare) ? { fare: taxiFare } : {}),
        segments: [
          {
            mode: "CAR",
            from: "현재 위치",
            to: "목적지",
            durationMinutes,
            distanceMeters,
            routeName: `택시 · ${routeRoadName(route)}`,
            fromCoordinate: origin,
            toCoordinate: destination,
          },
        ],
        ...(polyline.length > 1 ? { polyline } : {}),
        mapPaths: polyline.length > 1 ? [{ mode: "CAR", points: polyline, label: "택시" }] : [],
        provider: "KAKAO_MOBILITY",
        isRealtime: true,
        fetchedAt,
      };
    });
}
