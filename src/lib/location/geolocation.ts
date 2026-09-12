import type { LocationFix } from "@/lib/routes/types";

export type GeolocationRequestOptions = Pick<PositionOptions, "enableHighAccuracy" | "maximumAge" | "timeout">;
const DEFAULT_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 };
const FALLBACK_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 };

function requireGeolocation(): Geolocation {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error("위치 추적은 HTTPS 또는 localhost에서 사용할 수 있습니다.");
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("이 브라우저에서는 위치정보를 사용할 수 없습니다.");
  }
  return navigator.geolocation;
}

export function locationErrorMessage(error: unknown): string {
  const code = (error as GeolocationPositionError | null)?.code;
  if (code === 1) return "위치 권한이 차단되어 있습니다. 브라우저의 사이트 설정에서 위치를 허용해 주세요.";
  if (code === 2) return "현재 위치 신호를 받지 못했습니다. 위치 서비스를 켜고 다시 시도해 주세요.";
  if (code === 3) return "위치 확인 시간이 초과되었습니다. 신호가 잡히면 추적을 다시 시도합니다.";
  return error instanceof Error ? error.message : "현재 위치를 확인하지 못했습니다.";
}

function toFix(position: GeolocationPosition): LocationFix {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
    speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
    timestamp: position.timestamp,
  };
}

function requestPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    try {
      requireGeolocation().getCurrentPosition(resolve, reject, options);
    } catch (error) { reject(error); }
  });
}

// GPS 신호가 약한 실내·노트북 환경에서는 고정밀 측위가 시간 내에 끝나지 않을 수 있어,
// 시간 초과(code 3) 시 와이파이/네트워크 기반의 저정밀 측위로 한 번 더 시도한다.
export async function getCurrentPosition(options: GeolocationRequestOptions = {}): Promise<LocationFix> {
  try {
    return toFix(await requestPosition({ ...DEFAULT_OPTIONS, ...options }));
  } catch (error) {
    const isTimeout = (error as GeolocationPositionError | null)?.code === 3;
    if (!isTimeout) throw new Error(locationErrorMessage(error));
    try {
      return toFix(await requestPosition({ ...FALLBACK_OPTIONS, ...options }));
    } catch (fallbackError) {
      throw new Error(locationErrorMessage(fallbackError));
    }
  }
}

export function watchCurrentPosition(
  onPosition: (fix: LocationFix) => void,
  onError?: (error: GeolocationPositionError | Error) => void,
  options: GeolocationRequestOptions = {},
): () => void {
  try {
    const geo = requireGeolocation();
    const id = geo.watchPosition((position) => onPosition(toFix(position)), onError, { ...DEFAULT_OPTIONS, ...options });
    return () => geo.clearWatch(id);
  } catch (error) {
    onError?.(new Error(locationErrorMessage(error)));
    return () => undefined;
  }
}
