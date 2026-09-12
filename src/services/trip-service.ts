import type { SwitchHistory, TripEvaluation } from "@/lib/algorithm/types";
import { getCurrentPosition } from "@/lib/location/geolocation";
import { RouteApiError, searchPlace } from "@/lib/routes/client";
import type { Coordinate, LocationFix } from "@/lib/routes/types";
import { isCoordinate } from "@/lib/routes/geometry";
import { formatClock } from "@/lib/time";
import {
  createInitialMockTrip,
  createTrafficChangedMockTrip,
  MOCK_CURRENT_LOCATION,
} from "@/data/mock-trip";
import type {
  CurrentLocation,
  RouteOption,
  StartTripRequest,
  TrafficAlert,
  TripSnapshot,
  UserPreferences,
} from "@/types/trip";

export interface LocationProvider {
  getCurrentLocation(): Promise<CurrentLocation>;
}

export interface RouteProvider {
  searchRoutes(request: StartTripRequest): Promise<TripSnapshot["routes"]>;
}

export type RefreshOptions = { origin?: Coordinate; signal?: AbortSignal };

export interface TripService {
  getCurrentLocation(): Promise<CurrentLocation>;
  startTrip(request: StartTripRequest, signal?: AbortSignal): Promise<TripSnapshot>;
  getTripSnapshot(tripId: string, options?: RefreshOptions): Promise<TripSnapshot>;
  savePreferences(
    tripId: string,
    preferences: UserPreferences,
  ): Promise<void>;
  simulateTrafficEvent(tripId: string, options?: RefreshOptions): Promise<TripSnapshot>;
  endTrip(tripId: string): void;
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

class MockTripService implements TripService {
  private trips = new Map<string, TripSnapshot>();

  endTrip(tripId: string) { this.trips.delete(tripId); }

  async getCurrentLocation() {
    await wait(450);
    return MOCK_CURRENT_LOCATION;
  }

  async startTrip(request: StartTripRequest) {
    await wait(700);
    const trip = createInitialMockTrip(request);
    this.trips.set(trip.tripId, trip);
    return trip;
  }

  async getTripSnapshot(tripId: string) {
    await wait(250);
    const trip = this.trips.get(tripId);
    if (!trip) throw new Error("이동 정보를 찾을 수 없습니다.");
    return trip;
  }

  async savePreferences(tripId: string, _preferences: UserPreferences) {
    await wait(350);
    if (!this.trips.has(tripId)) {
      throw new Error("이동 정보를 찾을 수 없습니다.");
    }
  }

  async simulateTrafficEvent(tripId: string) {
    await wait(900);
    const current = this.trips.get(tripId);
    if (!current) throw new Error("이동 정보를 찾을 수 없습니다.");

    const changed = createTrafficChangedMockTrip(current);
    this.trips.set(tripId, changed);
    return changed;
  }
}

type EvaluateApiResponse = {
  evaluation: TripEvaluation;
  routeSource: "live" | "mock";
  warnings?: string[];
  demo?: { message: string };
};

type TripSession = {
  origin: Coordinate;
  destinationCoordinate: Coordinate;
  destinationLabel: string;
  originLabel: string;
  deadline: number;
  preferences: UserPreferences;
  history: SwitchHistory;
  demoElapsedSeconds: number;
  startedAt: number;
  locationFix: LocationFix;
};

/**
 * DARTS 알고리즘(/api/evaluate)과 실제 위치 API를 사용하는 구현체.
 * 데이터 출처는 snapshot에 보존하여 실제 안내와 데모를 구분합니다.
 */
class ApiTripService implements TripService {
  private sessions = new Map<string, TripSession>();

  async getCurrentLocation(): Promise<CurrentLocation> {
    const position = await getCurrentPosition();
    return {
      latitude: position.lat,
      longitude: position.lng,
      label: `현재 위치 (${position.lat.toFixed(3)}, ${position.lng.toFixed(3)})`,
    };
  }

  async startTrip(request: StartTripRequest, signal?: AbortSignal): Promise<TripSnapshot> {
    const originPosition = await getCurrentPosition();

    signal?.throwIfAborted();
    let destinationPlace = request.destinationPlace;
    if (destinationPlace && !isCoordinate(destinationPlace)) throw new Error("목적지 좌표가 올바르지 않습니다.");
    if (!destinationPlace) {
      const places = await searchPlace(request.destination, { origin: originPosition, signal });
      if (places.length > 1) throw new Error("검색 결과에서 주소를 확인하고 목적지를 선택해 주세요.");
      destinationPlace = places[0];
    }
    if (!destinationPlace) throw new Error(`"${request.destination}" 검색 결과가 없습니다. 주소로 검색하거나 지도에서 선택해 주세요.`);
    signal?.throwIfAborted();

    const tripId = `trip-${crypto.randomUUID()}`;
    const deadline = new Date(request.deadline).getTime();
    const session: TripSession = {
      origin: originPosition,
      destinationCoordinate: { lat: destinationPlace.lat, lng: destinationPlace.lng },
      destinationLabel: destinationPlace.name,
      originLabel: "현재 위치",
      deadline,
      preferences: request.preferences,
      history: { candidateStreak: 0 },
      demoElapsedSeconds: 0,
      startedAt: Date.now(),
      locationFix: originPosition,
    };
    const result = await this.requestEvaluation(session, signal);
    signal?.throwIfAborted();
    session.history = result.evaluation.history ?? { currentPolicyId: result.evaluation.recommendedPolicyId, candidateStreak: 0 };
    this.sessions.set(tripId, session);
    return this.toSnapshot(tripId, session, result);
  }

  endTrip(tripId: string) { this.sessions.delete(tripId); }

  async getTripSnapshot(tripId: string, options: RefreshOptions = {}): Promise<TripSnapshot> {
    const session = this.requireSession(tripId);
    // 요청 중 수신한 GPS가 이 응답의 출발 좌표를 바꾸지 않도록 요청 당시 값을 보존합니다.
    const requested = { ...session, origin: options.origin ?? session.origin };
    const result = await this.requestEvaluation(requested, options.signal);
    options.signal?.throwIfAborted();
    session.origin = requested.origin;
    this.applyHistory(session, result.evaluation);
    return this.toSnapshot(tripId, requested, result);
  }

  async savePreferences(
    tripId: string,
    preferences: UserPreferences,
  ): Promise<void> {
    const session = this.requireSession(tripId);
    session.preferences = preferences;
  }

  async simulateTrafficEvent(tripId: string, options: RefreshOptions = {}): Promise<TripSnapshot> {
    this.requireSession(tripId).demoElapsedSeconds = 999;
    return this.getTripSnapshot(tripId, options);
  }

  private requireSession(tripId: string): TripSession {
    const session = this.sessions.get(tripId);
    if (!session) throw new Error("이동 정보를 찾을 수 없습니다.");
    return session;
  }

  private applyHistory(session: TripSession, evaluation: TripEvaluation) {
    session.history = evaluation.history ?? {
      currentPolicyId: evaluation.recommendedPolicyId,
      candidatePolicyId: undefined,
      candidateStreak: 0,
      lastSwitchAt: evaluation.shouldSwitch ? evaluation.evaluatedAt : session.history.lastSwitchAt,
    };
  }

  private async requestEvaluation(
    session: TripSession,
    signal?: AbortSignal,
  ): Promise<EvaluateApiResponse> {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        origin: session.origin,
        destination: session.destinationCoordinate,
        deadline: session.deadline,
        preferences: session.preferences,
        demoElapsedSeconds: Math.max(session.demoElapsedSeconds, (Date.now() - session.startedAt) / 1000),
        history: session.history,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new RouteApiError(body?.error?.message ?? "경로 평가에 실패했습니다.", response.status, body?.error?.code, [
        ...(Array.isArray(body?.error?.details) ? body.error.details.filter((detail: unknown): detail is string => typeof detail === "string") : []),
        `조회 출발 위치: ${session.origin.lat.toFixed(5)}, ${session.origin.lng.toFixed(5)}`,
        `조회 목적지: ${session.destinationLabel} (${session.destinationCoordinate.lat.toFixed(5)}, ${session.destinationCoordinate.lng.toFixed(5)})`,
      ]);
    }

    return response.json();
  }

  private toSnapshot(
    tripId: string,
    session: TripSession,
    result: EvaluateApiResponse,
  ): TripSnapshot {
    const { evaluation, routeSource, warnings, demo } = result;
    const demoMessage = demo?.message;
    const now = evaluation.evaluatedAt;
    const target = evaluation.policies.find(
      (p) => p.policy.id === evaluation.recommendedPolicyId,
    )!;
    const current = evaluation.currentPolicyId
      ? evaluation.policies.find((p) => p.policy.id === evaluation.currentPolicyId)
      : undefined;

    const routes: RouteOption[] = evaluation.policies.map(({ policy, forecast, rejectedReasons }) => ({
      id: policy.id,
      title: policy.label,
      description: `환승 ${policy.transferCount}회 · 도보·달리기 ${Math.round(policy.walkingMeters)}m`,
      arrivalTime: formatClock(new Date(forecast.arrivalP50)),
      arrivalAt: forecast.arrivalP50,
      durationMinutes: Math.max(0, Math.round((forecast.arrivalP50 - now) / 60_000)),
      onTimeProbability: Math.round(forecast.onTimeProbability * 100),
      extraCost: policy.extraCost,
      recommended: policy.id === evaluation.recommendedPolicyId,
      mode: policy.mode, polyline: policy.polyline, mapPaths: policy.mapPaths,
      runningSavedMinutes: policy.segments.reduce((sum, segment) => sum + (segment.savedMinutes ?? 0), 0),
      constraintWarnings: rejectedReasons,
      segments: policy.segments.map((segment, sourceIndex) => ({ ...segment, sourceIndex })).filter((segment) => !((segment.mode === "WALK" || segment.mode === "RUN") && segment.travelTime.mean <= 0.1 && !segment.distanceMeters)).map((segment) => ({
        ...segment,
        durationMinutes: Math.round(segment.travelTime.p50 * 10) / 10,
        from: segment.from === "현재 위치" ? session.originLabel : segment.from,
        to: segment.to === "목적지" ? session.destinationLabel : segment.to,
      })),
    }));

    let alert: TrafficAlert | null = null;
    if (evaluation.shouldSwitch && current) {
      alert = {
        id: `alert-${now}`,
        title: demoMessage ? "교통 상황 변화 감지" : "정시 도착 확률 변화 감지",
        detail: evaluation.switchReason ?? evaluation.recommendation.reason,
        suggestion: evaluation.recommendation.action.description,
        previousArrival: formatClock(new Date(current.forecast.arrivalP50)),
        newArrival: formatClock(new Date(target.forecast.arrivalP50)),
        occurredAt: formatClock(new Date(now)),
        severity:
          target.riskLevel === "DANGER" || target.riskLevel === "LATE"
            ? "CRITICAL"
            : "WARNING",
      };
    }

    return {
      tripId,
      originLabel: session.originLabel,
      destination: session.destinationLabel,
      status: {
        currentTime: formatClock(new Date(now)),
        deadline: formatClock(new Date(session.deadline)),
        expectedArrival: formatClock(new Date(target.forecast.arrivalP50)),
        onTimeProbability: Math.round(target.forecast.onTimeProbability * 100),
        riskLevel: target.riskLevel,
        recommendedAction: evaluation.recommendation.action.description,
      },
      routes,
      alert,
      updatedAt: new Date(now).toISOString(),
      origin: session.origin,
      destinationCoordinate: session.destinationCoordinate,
      locationFix: session.locationFix,
      routeSource,
      warnings,
      reevaluateInSeconds: evaluation.recommendation.reevaluateInSeconds,
      deadlineAt: session.deadline,
      startedAt: session.startedAt,
      preferences: session.preferences,
    };
  }
}

// 실제 경로와 데모 경로는 snapshot.routeSource를 통해 화면에서 구별합니다.
export const tripService: TripService = new ApiTripService();

export { MockTripService, ApiTripService };
