import "./dom";
import assert from "node:assert/strict";
import { afterEach, test, mock } from "node:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTripDemo } from "../src/hooks/use-trip-demo";
import { tripService, type RefreshOptions } from "../src/services/trip-service";
import { DEFAULT_PREFERENCES, type TripSnapshot } from "../src/types/trip";
import { DestinationForm } from "../src/components/destination-form";
import { RouteMap } from "../src/components/map/RouteMap";
import { RouteApiError } from "../src/lib/routes/client";
import { TripDashboard } from "../src/components/trip-dashboard";
import type { LocationFix } from "../src/lib/routes/types";

let root: Root | undefined;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; document.body.replaceChildren(); mock.restoreAll(); globalThis.fetch = originalFetch;
});
async function render(element: React.ReactNode) {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root!.render(element));
}
const start = { lat: 37.57, lng: 126.98 };
const initialFix: LocationFix = { ...start, accuracy: 8, timestamp: 2_000_000, heading: 0, speed: 1 };
const snapshot: TripSnapshot = {
  tripId: "test-trip", originLabel: "현재 위치", destination: "선택한 장소", origin: start,
  destinationCoordinate: { lat: 37.58, lng: 127 }, locationFix: initialFix,
  routes: [{ id: "bus-1", title: "버스 100", description: "", arrivalTime: "12:00", durationMinutes: 10,
    onTimeProbability: 95, extraCost: 0, recommended: true, mode: "BUS" }],
  status: { currentTime: "11:50", deadline: "12:10", expectedArrival: "12:00", onTimeProbability: 95, riskLevel: "SAFE", recommendedAction: "이동" },
  alert: null, updatedAt: new Date(initialFix.timestamp).toISOString(), reevaluateInSeconds: 45, routeSource: "live",
};

test("a failed mission displays and copies the provider reason instead of a generic taxi prompt", async () => {
  mock.method(tripService, "startTrip", async () => {
    throw new RouteApiError("대중교통 경로를 불러오지 못했습니다.", 502, "TMAP_AUTH_TEST", ["TMAP appKey와 대중교통 권한을 확인해 주세요.", "조회 출발 위치: 37.57000, 126.98000"]);
  });
  let copied = "";
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied = text; } } });
  let current!: ReturnType<typeof useTripDemo>;
  function Harness() {
    current = useTripDemo();
    return <DestinationForm apiError={current.error} isLoading={current.isStarting} onSubmit={current.startTrip} onResolveLocation={current.resolveCurrentLocation} />;
  }
  await render(<Harness />);
  await act(async () => current.startTrip({ destination: "신설동역", deadline: "2099-01-01T12:00", preferences: DEFAULT_PREFERENCES, useCurrentLocation: true }));
  const alert = container.querySelector('[role="alert"]')!;
  assert.match(alert.textContent!, /appKey/);
  assert.match(alert.textContent!, /오류 코드: TMAP_AUTH_TEST/);
  assert.match(alert.textContent!, /조회 출발 위치/);
  const copy = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("오류 내용 복사"))!;
  await act(async () => copy.click());
  assert.equal(copied, current.error);
  assert.match(container.textContent!, /오류 내용을 복사했습니다/);
});

test("navigation streams GPS immediately, serializes evaluations, uses latest origin and cleans up after back", async () => {
  let now = initialFix.timestamp;
  mock.method(Date, "now", () => now);
  let receive: PositionCallback | undefined;
  let watchCleared = false;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: {
    watchPosition: (success: PositionCallback) => { receive = success; return 42; },
    clearWatch: (id: number) => { watchCleared = id === 42; },
  } } });
  let tick: (() => void) | undefined;
  mock.method(window, "setInterval", (callback: () => void) => { tick = callback; return 1; });
  mock.method(window, "clearInterval", () => {});
  mock.method(tripService, "startTrip", async () => structuredClone(snapshot));
  mock.method(tripService, "endTrip", () => {});
  let resolveRequest: ((value: TripSnapshot) => void) | undefined;
  let calls = 0;
  let requestedOrigin: unknown;
  let signal: AbortSignal | undefined;
  mock.method(tripService, "getTripSnapshot", async (_id: string, options?: RefreshOptions) => {
    calls++; requestedOrigin = options?.origin; signal = options?.signal;
    return new Promise<TripSnapshot>((resolve) => { resolveRequest = resolve; });
  });
  let current!: ReturnType<typeof useTripDemo>;
  function Harness() { current = useTripDemo(); return <span>{current.position?.lat}</span>; }
  await render(<Harness />);
  await act(async () => current.startTrip({ destination: "임의 목적지", deadline: "2099-01-01T12:00", preferences: DEFAULT_PREFERENCES, useCurrentLocation: true }));
  assert.ok(receive);
  now += 12_000;
  await act(async () => receive!({ coords: { latitude: 37.571, longitude: 126.98, accuracy: 8, heading: 90, speed: 1 }, timestamp: now } as GeolocationPosition));
  assert.equal(current.position?.lat, 37.571, "marker updates without waiting for route HTTP request");
  await act(async () => current.pauseReplanning(true));
  await act(async () => tick!());
  assert.equal(calls, 0, "boarding keeps the route while GPS still streams");
  await act(async () => current.pauseReplanning(false));
  await act(async () => tick!());
  assert.deepEqual(requestedOrigin, { lat: 37.571, lng: 126.98 });
  await act(async () => tick!());
  assert.equal(calls, 1, "in-flight evaluation cannot be overlapped");
  now += 1000;
  await act(async () => receive!({ coords: { latitude: 37.572, longitude: 126.98, accuracy: 8, heading: 90, speed: 1 }, timestamp: now } as GeolocationPosition));
  await act(async () => resolveRequest!({ ...snapshot, origin: { lat: 37.571, lng: 126.98 } }));
  assert.equal(current.position?.lat, 37.572, "late route response cannot roll back the marker");
  await act(async () => { void current.refreshNow(); });
  assert.equal(calls, 2);
  await act(async () => current.resetTrip());
  assert.equal(signal?.aborted, true);
  assert.ok(watchCleared);
  await act(async () => resolveRequest!(snapshot));
  assert.equal(current.trip, null, "late response cannot resurrect a finished trip");
});

test("ambiguous destination requires choosing a result and sends exactly that coordinate", async () => {
  const places = [
    { name: "같은 카페", address: "서울 첫 번째 주소", lat: 37.5, lng: 127.1 },
    { name: "같은 카페", address: "부산 두 번째 주소", lat: 35.2, lng: 129.1 },
  ];
  globalThis.fetch = async () => Response.json({ places, provider: "KAKAO_LOCAL", source: "live" });
  let submitted: unknown;
  await render(<DestinationForm isLoading={false} apiError={null} onSubmit={async (value) => { submitted = value; }}
    onResolveLocation={async () => ({ latitude: start.lat, longitude: start.lng, label: "현재 위치" })} />);
  const input = container.querySelector<HTMLInputElement>('input[type="text"]')!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, "같은 카페");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  const search = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("목적지 검색"))!;
  await act(async () => search.click());
  assert.equal(submitted, undefined);
  assert.ok(container.textContent?.includes("부산 두 번째 주소"));
  const second = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("부산 두 번째 주소"))!;
  await act(async () => second.click());
  await act(async () => container.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.deepEqual((submitted as unknown as { destinationPlace: unknown }).destinationPlace, places[1]);
});

test("map moves the position overlay without recreating map or fitting bounds for every GPS sample", async () => {
  let mapsCreated = 0;
  let fitCount = 0;
  let panCount = 0;
  let positionUpdates = 0;
  const handlers = new Map<string, (...args: unknown[]) => void>();
  class LatLng { constructor(public lat: number, public lng: number) {} getLat() { return this.lat; } getLng() { return this.lng; } }
  class Layer { setMap() {} setPosition() { positionUpdates++; } setContent() {} setRadius() {} }
  process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY = "test-only";
  window.kakao = { maps: {
    load: (callback: () => void) => callback(), LatLng,
    LatLngBounds: class { extend() {} },
    Map: class { constructor() { mapsCreated++; } setBounds() { fitCount++; } panTo() { panCount++; } setLevel() {} relayout() {} },
    Polyline: Layer, CustomOverlay: Layer, Circle: Layer,
    event: { addListener: (_map: unknown, name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
      removeListener: (_map: unknown, name: string) => handlers.delete(name) },
  } } as unknown as typeof window.kakao;
  const route = { id: "bus-1", mode: "BUS" as const, mapPaths: [{ mode: "BUS" as const, points: [start, { lat: 37.58, lng: 127.0 }] }] };
  const props = { origin: start, destination: snapshot.destinationCoordinate, route };
  await render(<RouteMap {...props} position={initialFix} />);
  assert.equal(mapsCreated, 1);
  const initialBounds = fitCount;
  await act(async () => root!.render(<RouteMap {...props} position={{ ...initialFix, lat: 37.571, timestamp: initialFix.timestamp + 1000 }} />));
  assert.equal(mapsCreated, 1);
  assert.equal(fitCount, initialBounds);
  assert.ok(positionUpdates >= 2);
  await act(async () => handlers.get("dragstart")!());
  const afterDrag = panCount;
  await act(async () => root!.render(<RouteMap {...props} position={{ ...initialFix, lat: 37.572, timestamp: initialFix.timestamp + 2000 }} />));
  assert.equal(panCount, afterDrag, "manual drag pauses camera following");
  const follow = container.querySelector<HTMLButtonElement>('[aria-label="현재 위치 따라가기"]')!;
  await act(async () => follow.click());
  assert.ok(panCount > afterDrag);
  delete process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY;
});

test("automatic transport changes update the action while preserving the dashboard map and its viewport", async () => {
  let maps = 0; let fits = 0;
  class Layer { setMap() {} setPosition() {} setContent() {} setRadius() {} }
  class LatLng { constructor(public lat: number, public lng: number) {} getLat() { return this.lat; } getLng() { return this.lng; } }
  process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY = "test-only";
  window.kakao = { maps: {
    load: (callback: () => void) => callback(), LatLng, LatLngBounds: class { extend() {} },
    Map: class { constructor() { maps++; } setBounds() { fits++; } panTo() {} setLevel() {} relayout() {} },
    Polyline: Layer, CustomOverlay: Layer, Circle: Layer, event: { addListener() {}, removeListener() {} },
  } } as unknown as typeof window.kakao;
  globalThis.fetch = async () => Response.json({ status: "unavailable", source: "TMAP", fetchedAt: Date.now(), departures: [], message: "실시간 미연결" });
  const busTrip: TripSnapshot = { ...snapshot, routes: [{ ...snapshot.routes[0], segments: [{ id: "bus", mode: "BUS", from: "A정류장", to: "B정류장", routeName: "123", durationMinutes: 10 }], mapPaths: [{ mode: "BUS", points: [start, snapshot.destinationCoordinate!] }] }] };
  const props = { locationError: null, isRefreshing: false, error: null, isSimulating: false, onRefresh: async () => {}, onSimulateTraffic: async () => {}, onSavePreferences: async () => {}, onBack: () => {} };
  await render(<TripDashboard {...props} trip={busTrip} position={initialFix} />);
  const initialFits = fits;
  assert.equal(maps, 1); assert.match(container.querySelector('[aria-label="지금 해야 할 일"]')!.textContent!, /123번 버스/);
  const newTrip: TripSnapshot = { ...busTrip, routes: [{ ...busTrip.routes[0], id: "new-subway", title: "6호선", mode: "SUBWAY", segments: [{ id: "metro", mode: "SUBWAY", from: "안암역", to: "동묘앞역", routeName: "6호선", durationMinutes: 4 }] }] };
  await act(async () => root!.render(<TripDashboard {...props} trip={newTrip} position={{ ...initialFix, lat: start.lat + .001, timestamp: initialFix.timestamp + 1000 }} />));
  assert.match(container.querySelector('[aria-label="지금 해야 할 일"]')!.textContent!, /안암역에서 6호선/);
  assert.equal(maps, 1, "changing the route must not remount the nested map"); assert.equal(fits, initialFits, "automatic rerouting must not reset the viewport");
  delete process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY;
});

import { JourneyGuide } from "../src/components/journey-guide";
import { TransitArrivalPanel } from "../src/components/transit-arrival-panel";
import type { JourneySegment } from "../src/lib/routes/types";
const journeyBus: JourneySegment = { id: "bus", mode: "BUS", from: "고려대 정류장", to: "안암역 정류장", durationMinutes: 7, routeName: "성북04", fromCoordinate: { lat: 37.59, lng: 127.02 }, toCoordinate: { lat: 37.586, lng: 127.029 }, transit: { stationId: "100", cityCode: 1000, arsId: "08100", nextStopName: "안암역", stationCount: 3 } };

test("mission actions advance through running, boarding, alighting and arrival, with the exact stop focused on the map", async () => {
  const now = Date.now();
  const segments: JourneySegment[] = [
    { id: "run", mode: "RUN", from: "현재 위치", to: "고려대 정류장", durationMinutes: 3, distanceMeters: 350, savedMinutes: 2 },
    journeyBus,
    { id: "walk", mode: "WALK", from: "안암역 정류장", to: "학교", durationMinutes: 2, distanceMeters: 150 },
  ];
  globalThis.fetch = async () => Response.json({ status: "live", source: "서울시", fetchedAt: now, message: "최신 도착정보", departures: [{ id: "next", lineName: "성북04", destination: "안암역", arrivalAt: now + 360000, message: "6분 뒤" }] });
  let paused = false; let focused: unknown;
  const onPause = (value: boolean) => { paused = value; };
  await render(<JourneyGuide route={{ ...snapshot.routes[0], segments }} destination="학교" now={now} deadlineAt={now + 3600000} isDemo={false} map={<div>지도 영역</div>} onPauseReplanning={onPause} onFocus={(point) => { focused = point; }} />);
  const action = () => container.querySelector('section[aria-label="지금 해야 할 일"]')!;
  assert.match(action().textContent!, /고려대 정류장까지 달려가세요/);
  assert.match(action().textContent!, /성북04번 버스 6분 뒤/);
  const click = async (text: string) => { const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)); assert.ok(button, text); await act(async () => button.click()); };
  await click("승차 위치"); assert.deepEqual(focused, journeyBus.fromCoordinate);
  await click("여기에 도착했어요"); assert.match(action().textContent!, /고려대 정류장에서 성북04번 버스/);
  await click("승차했어요"); assert.equal(paused, true); assert.match(action().textContent!, /안암역 정류장 하차/);
  await click("하차했어요"); assert.equal(paused, false); assert.match(action().textContent!, /학교까지 걸어가세요/);
  await click("목적지에 도착했어요"); assert.match(action().textContent!, /미션 클리어/); assert.equal(paused, true);
  await click("도착 확인 취소"); assert.equal(paused, false); assert.match(action().textContent!, /달려가세요/);
});

test("arrivals refresh on click, expose timetable separately and ignore an old stop response after switching", async () => {
  const now = Date.now();
  let resolveOld: ((value: Response) => void) | undefined;
  const requests: URL[] = [];
  let currentCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "https://test.example"); requests.push(url);
    if (url.searchParams.get("stationName") === journeyBus.from) return new Promise<Response>((resolve) => { resolveOld = resolve; });
    currentCalls++;
    return Response.json({ status: "live", source: "서울시", fetchedAt: now, message: "새 정류장", departures: [{ id: "new", lineName: "123", destination: `새 노선 ${currentCalls}`, arrivalAt: now + 60000 * currentCalls, message: "최신" }] });
  };
  await render(<TransitArrivalPanel segment={journeyBus} now={now} isDemo={false} />);
  const second: JourneySegment = { ...journeyBus, id: "second", from: "새 정류장", routeName: "123", transit: { ...journeyBus.transit, stationId: "200" } };
  await act(async () => root!.render(<TransitArrivalPanel segment={second} now={now} isDemo={false} />));
  assert.match(container.textContent!, /새 노선 1/);
  await act(async () => resolveOld!(Response.json({ status: "live", source: "서울시", fetchedAt: now, message: "오래된 정류장", departures: [{ id: "old", destination: "잘못된 노선", message: "" }] })));
  assert.ok(!container.textContent!.includes("잘못된 노선"));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="새 정류장 도착정보 새로고침"]')!.click());
  assert.match(container.textContent!, /새 노선 2/);
  const schedule = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("운행 안내"))!;
  await act(async () => schedule.click());
  assert.equal(requests.at(-1)!.searchParams.get("kind"), "schedule");
});

test("mission setup submits the chosen running skill and has no permitted cost input", async () => {
  let submitted: { preferences: typeof DEFAULT_PREFERENCES } | undefined;
  globalThis.fetch = async () => Response.json({ places: [{ name: "학교", address: "서울", lat: 37.58, lng: 127.02 }], source: "live", provider: "KAKAO_LOCAL" });
  await render(<DestinationForm isLoading={false} apiError={null} onSubmit={async (value) => { submitted = value; }} onResolveLocation={async () => ({ latitude: 37.58, longitude: 127.02, label: "현재 위치" })} />);
  const run = container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="뛰기 가능"]')!;
  await act(async () => run.click()); assert.equal(run.getAttribute("aria-checked"), "true");
  const input = container.querySelector<HTMLInputElement>('input[type="text"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, "학교"); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
  await act(async () => container.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(submitted?.preferences.canRun, true); assert.ok(!("maxExtraCost" in submitted!.preferences));
  assert.ok(!container.textContent?.includes("추가비용"));
});
