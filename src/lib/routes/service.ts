import { buildMockRoutes } from "./mock";
import { getKakaoCarRoutes } from "./providers/kakao-mobility";
import { getTmapTransitRoutes } from "./providers/tmap";
import { getTmapWalkRoutes } from "./providers/tmap-walk";
import { haversineDistanceMeters } from "./geometry";
import { RouteSearchError, safeProviderMessage } from "./errors";
import type {
  Coordinate,
  RawRoute,
  RouteDataMode,
  RouteProvider,
  RoutesResponse,
} from "./types";

type GetRouteCandidatesInput = {
  origin: Coordinate;
  destination: Coordinate;
  mode?: RouteDataMode;
  demoElapsedSeconds?: number;
  allowTaxi?: boolean;
  walkingDistanceMeters?: number;
};

function configuredMode(): RouteDataMode {
  const value = process.env.ROUTE_DATA_MODE;
  return value === "live" || value === "demo" || value === "auto"
    ? value
    : "auto";
}

function errorMessage(reason: unknown): string {
  return reason instanceof RouteSearchError
    ? [reason.message, ...reason.details].join(" ")
    : safeProviderMessage(reason instanceof Error ? reason.message : "경로 제공자 응답 오류");
}

function permittedRoutes(routes: RawRoute[], allowTaxi: boolean): RawRoute[] {
  return allowTaxi ? routes : routes.filter((route) => route.mode !== "CAR" && !route.segments.some((segment) => segment.mode === "CAR"));
}

function selectCandidateRoutes(
  transitRoutes: RawRoute[],
  carRoutes: RawRoute[],
): RawRoute[] {
  const unique = [...new Map(transitRoutes.map((route) => [route.id, route])).values()].sort((a, b) => a.durationMinutes - b.durationMinutes);
  const representatives = [...new Map([...unique].reverse().map((route) => [route.mode, route])).values()];
  // 빠른 지하철 몇 개가 버스·혼합 등 다른 이동 수단을 모두 밀어내지 않도록 대표 경로를 먼저 보존합니다.
  const selected = [...representatives, ...unique.filter((route) => !representatives.includes(route))].slice(0, 8);
  return [...selected.sort((a, b) => a.durationMinutes - b.durationMinutes), ...carRoutes.slice(0, 1)];
}

export async function getRouteCandidates({
  origin,
  destination,
  mode,
  demoElapsedSeconds = 0,
  allowTaxi = true,
  walkingDistanceMeters = 0,
}: GetRouteCandidatesInput): Promise<RoutesResponse> {
  const selectedMode = mode ?? configuredMode();

  if (selectedMode === "demo") {
    const demo = buildMockRoutes(origin, destination, demoElapsedSeconds);
    return { ...demo, routes: permittedRoutes(demo.routes, allowTaxi) };
  }

  // 필수 대중교통 키가 없는 상태를 정상적인 '택시만 있는 검색 결과'로 보이지 않게 합니다.
  if (selectedMode === "live" && !process.env.TMAP_APP_KEY?.trim()) await getTmapTransitRoutes(origin, destination);

  const warnings: string[] = [];
  const transitPromise = getTmapTransitRoutes(origin, destination);
  const walkPromise = walkingDistanceMeters > 0 && haversineDistanceMeters(origin, destination) <= walkingDistanceMeters
    ? getTmapWalkRoutes(origin, destination) : Promise.resolve([] as RawRoute[]);
  const carPromise = !allowTaxi ? Promise.resolve([] as RawRoute[]) : process.env.KAKAO_REST_API_KEY
    ? getKakaoCarRoutes(origin, destination)
    : Promise.reject(new Error("KAKAO_REST_API_KEY가 설정되지 않았습니다."));

  const [transitResult, carResult, walkResult] = await Promise.allSettled([
    transitPromise,
    carPromise,
    walkPromise,
  ]);

  const transitRoutes =
    transitResult.status === "fulfilled" ? transitResult.value : [];
  const carRoutes = carResult.status === "fulfilled" ? carResult.value : [];

  if (transitResult.status === "rejected") {
    warnings.push(errorMessage(transitResult.reason));
  }
  if (carResult.status === "rejected") {
    warnings.push(errorMessage(carResult.reason));
  }
  if (walkResult.status === "rejected") warnings.push(`도보 전용 경로 연결: ${errorMessage(walkResult.reason)} 보행자 경로안내 상품 권한을 확인해 주세요.`);
  const walkRoutes = walkResult.status === "fulfilled" ? walkResult.value.filter((route) => route.distanceMeters <= walkingDistanceMeters) : [];

  const routes = permittedRoutes(selectCandidateRoutes([...transitRoutes, ...walkRoutes], carRoutes), allowTaxi);
  if (routes.length === 0) {
    const fallbackReason = warnings.join(" | ") || "실제 경로 결과가 없습니다.";
    if (selectedMode === "live") {
      // 허용하지 않은 자동차 경로가 대중교통 오류를 가리지 않도록 조회 단계에서 처리합니다.
      if (!allowTaxi && transitResult.status === "rejected" && transitResult.reason instanceof RouteSearchError) {
        const failure = transitResult.reason;
        throw new RouteSearchError(failure.message, failure.code, [...failure.details,
          ...(walkResult.status === "rejected" ? [`도보 전용 경로 연결: ${errorMessage(walkResult.reason)} 보행자 경로안내 상품 권한을 확인해 주세요.`] : []),
        ], failure.status);
      }
      throw new RouteSearchError("이용 가능한 경로를 불러오지 못했습니다.", "ROUTE_PROVIDERS_FAILED", warnings.length ? warnings : [fallbackReason]);
    }

    const demo = buildMockRoutes(
      origin,
      destination,
      demoElapsedSeconds,
      fallbackReason,
    );
    return { ...demo, routes: permittedRoutes(demo.routes, allowTaxi) };
  }

  const providers = Array.from(
    new Set(
      routes
        .map((route) => route.provider)
        .filter((provider): provider is RouteProvider => Boolean(provider)),
    ),
  );

  return {
    routes,
    generatedAt: new Date().toISOString(),
    source: "live",
    providers,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
