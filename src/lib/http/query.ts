import type { Coordinate, RouteDataMode } from "@/lib/routes/types";

export class QueryValidationError extends Error {
  constructor(public readonly details: string[]) {
    super("요청 파라미터가 올바르지 않습니다.");
    this.name = "QueryValidationError";
  }
}

function parseFiniteNumber(
  searchParams: URLSearchParams,
  key: string,
  errors: string[],
): number {
  const raw = searchParams.get(key);
  const parsed = raw === null ? Number.NaN : Number(raw);

  if (!Number.isFinite(parsed)) {
    errors.push(`${key}는 유효한 숫자여야 합니다.`);
  }

  return parsed;
}

function validateCoordinate(
  coordinate: Coordinate,
  prefix: string,
  errors: string[],
): void {
  if (coordinate.lat < -90 || coordinate.lat > 90) {
    errors.push(`${prefix}Lat은 -90~90 범위여야 합니다.`);
  }
  if (coordinate.lng < -180 || coordinate.lng > 180) {
    errors.push(`${prefix}Lng은 -180~180 범위여야 합니다.`);
  }
}

export function parseRouteQuery(searchParams: URLSearchParams): {
  origin: Coordinate;
  destination: Coordinate;
  mode?: RouteDataMode;
  demoElapsedSeconds: number;
} {
  const errors: string[] = [];
  const origin: Coordinate = {
    lat: parseFiniteNumber(searchParams, "originLat", errors),
    lng: parseFiniteNumber(searchParams, "originLng", errors),
  };
  const destination: Coordinate = {
    lat: parseFiniteNumber(searchParams, "destinationLat", errors),
    lng: parseFiniteNumber(searchParams, "destinationLng", errors),
  };

  validateCoordinate(origin, "origin", errors);
  validateCoordinate(destination, "destination", errors);

  const rawMode = searchParams.get("mode");
  const demoAlias = searchParams.get("demo");
  let mode: RouteDataMode | undefined;

  if (demoAlias === "true") {
    mode = "demo";
  } else if (rawMode !== null) {
    if (["auto", "live", "demo"].includes(rawMode)) {
      mode = rawMode as RouteDataMode;
    } else {
      errors.push("mode는 auto, live, demo 중 하나여야 합니다.");
    }
  }

  const elapsedRaw = searchParams.get("demoElapsedSeconds") ?? "0";
  const demoElapsedSeconds = Number(elapsedRaw);
  if (!Number.isFinite(demoElapsedSeconds) || demoElapsedSeconds < 0) {
    errors.push("demoElapsedSeconds는 0 이상의 숫자여야 합니다.");
  }

  if (errors.length > 0) {
    throw new QueryValidationError(errors);
  }

  return { origin, destination, mode, demoElapsedSeconds };
}

export function parsePlaceQuery(searchParams: URLSearchParams): {
  keyword: string;
  origin?: Coordinate;
} {
  const errors: string[] = [];
  const keyword = (searchParams.get("keyword") ?? "").trim();

  if (keyword.length < 2 || keyword.length > 80) {
    errors.push("keyword는 2~80자로 입력해야 합니다.");
  }

  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  let origin: Coordinate | undefined;

  if (latRaw !== null || lngRaw !== null) {
    const lat = latRaw?.trim() ? Number(latRaw) : NaN;
    const lng = lngRaw?.trim() ? Number(lngRaw) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      errors.push("lat과 lng는 함께 유효한 숫자로 입력해야 합니다.");
    } else {
      origin = { lat, lng };
      validateCoordinate(origin, "origin", errors);
    }
  }

  if (errors.length > 0) {
    throw new QueryValidationError(errors);
  }

  return { keyword, origin };
}
