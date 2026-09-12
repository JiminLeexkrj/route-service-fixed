import type {
  ApiErrorResponse,
  Coordinate,
  PlaceResult,
  PlacesResponse,
  RouteDataMode,
  RoutesResponse,
} from "./types";

export class RouteApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = "RouteApiError";
  }
}

export function routeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof RouteApiError) {
    return [error.message, ...(error.details ?? []), ...(error.code ? [`오류 코드: ${error.code}`] : [])].join("\n");
  }
  return error instanceof Error ? error.message : fallback;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiErrorResponse;

  if (!response.ok) {
    const apiError = body as ApiErrorResponse;
    throw new RouteApiError(
      apiError.error?.message ?? `API 요청 실패 (${response.status})`,
      response.status,
      apiError.error?.code,
      apiError.error?.details,
    );
  }

  return body as T;
}

export type SearchPlaceOptions = {
  origin?: Coordinate;
  mode?: RouteDataMode;
  signal?: AbortSignal;
};

export async function searchPlace(
  keyword: string,
  options: SearchPlaceOptions = {},
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ keyword });
  if (options.origin) {
    params.set("lat", String(options.origin.lat));
    params.set("lng", String(options.origin.lng));
  }
  if (options.mode) params.set("mode", options.mode);

  const response = await fetch(`/api/places?${params.toString()}`, {
    cache: "no-store",
    signal: options.signal,
  });
  const result = await parseResponse<PlacesResponse>(response);
  return result.places;
}

export type GetRoutesOptions = {
  mode?: RouteDataMode;
  demoElapsedSeconds?: number;
  signal?: AbortSignal;
};

export async function getRoutes(
  origin: Coordinate,
  destination: Coordinate,
  options: GetRoutesOptions = {},
): Promise<RoutesResponse> {
  const params = new URLSearchParams({
    originLat: String(origin.lat),
    originLng: String(origin.lng),
    destinationLat: String(destination.lat),
    destinationLng: String(destination.lng),
  });

  if (options.mode) params.set("mode", options.mode);
  if (options.demoElapsedSeconds !== undefined) {
    params.set("demoElapsedSeconds", String(options.demoElapsedSeconds));
  }

  const response = await fetch(`/api/routes?${params.toString()}`, {
    cache: "no-store",
    signal: options.signal,
  });
  return parseResponse<RoutesResponse>(response);
}

/**
 * 의미를 명확히 하기 위한 재탐색 별칭입니다.
 * API Route가 no-store이며 매 호출마다 provider에 새로 요청합니다.
 */
export async function refreshRoutes(
  origin: Coordinate,
  destination: Coordinate,
  options: GetRoutesOptions = {},
): Promise<RoutesResponse> {
  return getRoutes(origin, destination, options);
}
