import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/places/route";
import { POST as evaluateApi } from "../src/app/api/evaluate/route";
import { RouteSearchError } from "../src/lib/routes/errors";
import { RouteApiError, routeErrorMessage } from "../src/lib/routes/client";
import { searchKakaoPlaces } from "../src/lib/places/kakao";
import { getTmapTransitRoutes, parseLineString } from "../src/lib/routes/providers/tmap";
import { getRouteCandidates } from "../src/lib/routes/service";
import { tmapBus, tmapSubway, tmapResponse, tmapWalkResponse } from "./tmap-fixtures";
import { createPositionAnimator } from "../src/lib/routes/position-animation";
import { updateWalkingProgress } from "../src/lib/routes/live-guidance";
import { isCoordinate, parseCoordinate } from "../src/lib/routes/geometry";
import { isFreshFix, projectOnPaths, shouldReplan, splitProgress } from "../src/lib/routes/navigation";
import { ApiTripService } from "../src/services/trip-service";
import { evaluateTrip } from "../src/lib/algorithm/evaluateTrip";
import { buildMockRoutes } from "../src/lib/routes/mock";
import { DEFAULT_PREFERENCES } from "../src/types/trip";
import type { LocationFix, MapPath } from "../src/lib/routes/types";

const originalFetch = globalThis.fetch;
const env = { ...process.env };
afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...env }; });
const origin = { lat: 37.57, lng: 126.98 };
const destination = { lat: 37.58, lng: 127.01 };
const fix = (timestamp = Date.now()): LocationFix => ({ ...origin, timestamp, accuracy: 8, heading: 90, speed: 1.3 });
const response = (value: unknown) => Response.json(value);

test("arbitrary store keyword and full street address are both queried; duplicates and invalid coordinates are filtered", async () => {
  process.env.KAKAO_REST_API_KEY = "test-only";
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)); requests.push(url);
    return response({ documents: url.pathname.includes("keyword") ? [
      { place_name: "새로운 카페", road_address_name: "부산광역시 새길 123", x: "129.1", y: "35.2" },
      { place_name: "invalid", x: "", y: "" },
    ] : [
      { address_name: "부산광역시 새길 123", road_address: { building_name: "새로운 카페" }, x: "129.1", y: "35.2" },
      { address_name: "부산광역시 새길 124", x: "129.101", y: "35.2" },
    ] });
  };
  const places = await searchKakaoPlaces("부산광역시 새길 123", origin);
  assert.equal(places.length, 2);
  assert.equal(places[0].name, "새로운 카페");
  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => url.searchParams.get("query") === "부산광역시 새길 123"));
  assert.ok(requests.every((url) => !url.searchParams.has("radius") && !url.searchParams.has("sort")));
});

test("zero keyword results still return an address match", async () => {
  process.env.KAKAO_REST_API_KEY = "test-only";
  globalThis.fetch = async (input) => response({ documents: String(input).includes("/keyword.") ? [] : [{ address_name: "주소만 있는 목적지", x: "127.1", y: "37.4" }] });
  assert.equal((await searchKakaoPlaces("주소만 있는 목적지"))[0].name, "주소만 있는 목적지");
});

test("missing/invalid key is a provider error, never silently a four-place DB", async () => {
  delete process.env.KAKAO_REST_API_KEY;
  const result = await GET(new NextRequest("http://localhost/api/places?keyword=서울역"));
  assert.equal(result.status, 502);
  const body = await result.json();
  assert.equal(body.error.code, "PLACE_PROVIDER_FAILED");
  assert.equal(body.places, undefined);
});

test("route demo setting does not restrict destination search; only explicit place demo uses mock", async () => {
  process.env.ROUTE_DATA_MODE = "demo";
  process.env.KAKAO_REST_API_KEY = "test-only";
  globalThis.fetch = async () => response({ documents: [{ place_name: "부산 새 목적지", x: "129.1", y: "35.2" }] });
  const result = await GET(new NextRequest("http://localhost/api/places?keyword=부산역"));
  assert.equal((await result.json()).provider, "KAKAO_LOCAL");
  const demo = await GET(new NextRequest("http://localhost/api/places?keyword=서울역&mode=demo"));
  assert.equal((await demo.json()).provider, "MOCK");
});

test("coordinates support any selected destination without a geocoding key", async () => {
  delete process.env.KAKAO_REST_API_KEY;
  globalThis.fetch = async () => { throw new Error("must not geocode coordinates"); };
  const result = await GET(new NextRequest("http://localhost/api/places?keyword=35.1796,129.0756"));
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).places[0].lat, 35.1796);
  assert.equal(parseCoordinate("91, 127"), null);
  assert.equal(isCoordinate({ lat: Infinity, lng: 127 }), false);
  const invalid = await GET(new NextRequest("http://localhost/api/places?keyword=서울역&lat=37"));
  assert.equal(invalid.status, 400);
});

const evaluateRequest = (allowTaxi = false, extra: Record<string, unknown> = {}) => new NextRequest("http://localhost/api/evaluate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    origin, destination, deadline: Date.now() + 3600000, mode: "live",
    preferences: { ...DEFAULT_PREFERENCES, walkingDistanceMeters: 0, allowTaxi, canRun: true }, ...extra,
  }),
});

test("TMAP uses a server appKey header, detailed endpoint and current Korean departure time; walk and transit geometry survive", async () => {
  process.env.TMAP_APP_KEY = "+test-only";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://apis.openapi.sk.com/transit/routes");
    assert.equal(init?.method, "POST"); assert.equal(new Headers(init?.headers).get("appKey"), "+test-only");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.startX, String(origin.lng)); assert.equal(body.startY, String(origin.lat)); assert.equal(body.count, 10);
    assert.equal(body.searchDttm, new Date(Date.now() + 9 * 3600000).toISOString().replace(/[-T:]/g, "").slice(0, 12));
    return response(tmapResponse());
  };
  const [route] = await getTmapTransitRoutes(origin, destination);
  assert.equal(route.provider, "TMAP_TRANSIT"); assert.equal(route.durationMinutes, 15);
  assert.equal(route.segments[1].durationMinutes, 10); assert.equal(route.segments[1].routeName, "123");
  assert.equal(route.mapPaths?.[1].points.length, 3); assert.ok(route.mapPaths?.every((path) => !path.approximate));
  assert.equal(route.segments[0].steps?.[0].description, "횡단보도를 건너 A정류장으로 이동");
  assert.equal(route.segments[1].transit?.localLineId, undefined, "TMAP IDs are not government IDs");
});

test("taxi OFF retains a TMAP rejection and never requests an unwanted car route or an old provider", async () => {
  process.env.TMAP_APP_KEY = "+test/private-key"; process.env.KAKAO_REST_API_KEY = "private-rest-key";
  const requests: string[] = [];
  globalThis.fetch = async (input) => { requests.push(String(input)); return response({ error: { code: "AUTH_TEST", message: `appKey rejected ${process.env.TMAP_APP_KEY} ${encodeURIComponent(process.env.TMAP_APP_KEY!)} ${process.env.KAKAO_REST_API_KEY}` } }); };
  const result = await evaluateApi(evaluateRequest()); const body = await result.json();
  assert.equal(result.status, 502); assert.equal(body.error.code, "TMAP_AUTH_TEST");
  assert.match(body.error.details.join(" "), /appKey와 대중교통 API 상품 사용 권한/);
  assert.deepEqual(requests, ["https://apis.openapi.sk.com/transit/routes"]);
  assert.ok(!JSON.stringify(body).includes("private-key") && !JSON.stringify(body).includes("private-rest-key"));
});

test("missing TMAP credentials is explicit even with taxi ON, instead of silently returning only taxis", async () => {
  delete process.env.TMAP_APP_KEY;
  globalThis.fetch = async () => { throw new Error("must not call any upstream"); };
  const result = await evaluateApi(evaluateRequest(true));
  assert.equal(result.status, 502); assert.equal((await result.json()).error.code, "TMAP_KEY_MISSING");
});

test("TMAP numeric strings and missing total distance still evaluate with taxi OFF and running ON", async () => {
  process.env.TMAP_APP_KEY = "test-only";
  globalThis.fetch = async () => response(tmapResponse([{ ...tmapBus, totalTime: "900", totalDistance: undefined,
    legs: tmapBus.legs.map((leg) => ({ ...leg, sectionTime: String(leg.sectionTime), distance: String(leg.distance) })),
  }]));
  const [route] = await getTmapTransitRoutes(origin, destination); assert.equal(route.distanceMeters, 2500);
  const result = await evaluateApi(evaluateRequest()); const body = await result.json();
  assert.equal(result.status, 200); assert.equal(body.routeSource, "live");
  assert.ok(body.evaluation.policies.some((item: { policy: { segments: { mode: string }[] } }) => item.policy.segments.some((segment) => segment.mode === "RUN")));
  assert.ok(body.evaluation.policies.every((item: { policy: { usesTaxi: boolean } }) => !item.policy.usesTaxi));
});

test("bus, subway and mixed alternatives remain present when the provider puts several subways first", async () => {
  process.env.TMAP_APP_KEY = "test-only";
  const subways = Array.from({ length: 5 }, (_, index) => ({ ...tmapSubway, legs: tmapSubway.legs.map((leg) => leg.mode === "SUBWAY" ? { ...leg, routeId: `metro-${index}` } : leg) }));
  const mixed = { ...tmapBus, legs: [...tmapBus.legs, tmapSubway.legs[1]], totalTime: 1800 };
  globalThis.fetch = async () => response(tmapResponse([...subways, tmapBus, mixed]));
  const result = await getRouteCandidates({ origin, destination, allowTaxi: false, mode: "live" });
  for (const mode of ["BUS", "SUBWAY", "MIXED"]) assert.ok(result.routes.some((route) => route.mode === mode), mode);
});

test("malformed shapes are marked approximate and ended service is not offered as an operating route", async () => {
  process.env.TMAP_APP_KEY = "test-only";
  assert.deepEqual(parseLineString("127,37 broken 127.1,37.1"), []);
  globalThis.fetch = async () => response(tmapResponse([{ ...tmapBus, legs: tmapBus.legs.map((leg) => ({ ...leg, passShape: undefined, steps: undefined })) }]));
  assert.ok((await getTmapTransitRoutes(origin, destination))[0].mapPaths?.every((path) => path.approximate));
  globalThis.fetch = async () => response(tmapResponse([{ ...tmapBus, legs: tmapBus.legs.map((leg) => ({ ...leg, service: 0 })) }]));
  await assert.rejects(getTmapTransitRoutes(origin, destination), (error: unknown) => error instanceof RouteSearchError && error.code === "TMAP_NO_SERVICE");
});

test("nearby destinations can use actual TMAP pedestrian geometry when transit returns no route", async () => {
  process.env.TMAP_APP_KEY = "test-only";
  const closeOrigin = { lat: 37.57, lng: 127 }; const closeDestination = { lat: 37.571, lng: 127.001 };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.hostname, "apis.openapi.sk.com");
    if (url.pathname.includes("pedestrian")) {
      const body = JSON.parse(String(init?.body)); assert.equal(body.reqCoordType, "WGS84GEO"); assert.equal(body.startX, 127);
      return response(tmapWalkResponse);
    }
    return response({ result: { status: 11, message: "nearby" } });
  };
  const result = await evaluateApi(evaluateRequest(false, { origin: closeOrigin, destination: closeDestination, preferences: { ...DEFAULT_PREFERENCES, canRun: true, allowTaxi: false, walkingDistanceMeters: 500 } }));
  const body = await result.json(); assert.equal(result.status, 200);
  assert.ok(body.evaluation.policies.some((p: { policy: { segments: { mode: string }[] } }) => p.policy.segments[0].mode === "RUN"));
  assert.ok(body.evaluation.policies[0].policy.mapPaths[0].points.length > 2);
  assert.match(body.warnings.join(" "), /11/);
});

test("empty results, timeout and HTTP authentication retain distinct TMAP reasons", async () => {
  process.env.TMAP_APP_KEY = "test-only";
  const cases = [
    { reply: () => response(tmapResponse([])), code: "TMAP_NO_RESULTS" },
    { reply: () => new Response(null, { status: 401 }), code: "TMAP_HTTP_401" },
    { reply: () => { throw new DOMException("timeout", "TimeoutError"); }, code: "TMAP_TIMEOUT" },
  ];
  for (const entry of cases) {
    globalThis.fetch = async () => entry.reply();
    const result = await evaluateApi(evaluateRequest()); assert.equal(result.status, 502); assert.equal((await result.json()).error.code, entry.code);
  }
});

test("taxi ON retains a working taxi and an explicit transit failure warning", async () => {
  process.env.TMAP_APP_KEY = "test-only"; process.env.KAKAO_REST_API_KEY = "test-only";
  globalThis.fetch = async (input) => String(input).includes("openapi.sk.com") ? response({ result: { status: 31, message: "temporarily unavailable" } }) : response({ routes: [{ result_code: 0, summary: { duration: 600, distance: 2500 } }] });
  const result = await evaluateApi(evaluateRequest(true)); const body = await result.json();
  assert.equal(result.status, 200); assert.ok(body.evaluation.policies[0].policy.usesTaxi); assert.match(body.warnings.join(" "), /TMAP.*31/);
});

test("trip service passes actionable provider details and real coordinates to the UI", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: {
    getCurrentPosition: (success: (position: unknown) => void) => success({ coords: { latitude: origin.lat, longitude: origin.lng, accuracy: 8, heading: null, speed: null }, timestamp: Date.now() }),
  } } });
  globalThis.fetch = async () => Response.json({ error: { code: "TMAP_KEY_MISSING", message: "TMAP 키가 필요합니다.", details: ["대중교통 API appKey를 확인하세요."] } }, { status: 502 });
  await assert.rejects(new ApiTripService().startTrip({ destination: "신설동역", destinationPlace: { ...destination, name: "신설동역", address: "서울" }, deadline: new Date(Date.now() + 3600000).toISOString(), useCurrentLocation: true, preferences: DEFAULT_PREFERENCES }), (error: unknown) => {
    assert.ok(error instanceof RouteApiError); const text = routeErrorMessage(error, "fallback");
    assert.match(text, /appKey/); assert.match(text, /오류 코드: TMAP_KEY_MISSING/); assert.match(text, /조회 출발 위치: 37.57000, 126.98000/); return true;
  });
});

test("marker interpolation reaches each GPS fix, resumes from painted position and stops when tracking ends", () => {
  let next = 0; const frames = new Map<number, FrameRequestCallback>(); const paints: (LocationFix | null)[] = [];
  const animation = createPositionAnimator((point) => paints.push(point), (callback) => { frames.set(++next, callback); return next; }, (id) => frames.delete(id));
  animation.update(fix()); animation.update({ ...fix(), lat: origin.lat + .001 });
  const frame = (time: number) => { const entries = [...frames]; frames.clear(); for (const [, callback] of entries) callback(time); };
  frame(0); frame(325); const halfway = paints.at(-1)!.lat;
  assert.ok(halfway > origin.lat && halfway < origin.lat + .001);
  animation.update({ ...fix(), lat: origin.lat + .002 }); frame(400); assert.equal(paints.at(-1)!.lat, halfway);
  frame(1050); assert.equal(paints.at(-1)!.lat, origin.lat + .002); assert.equal(frames.size, 0);
  animation.update(fix()); animation.destroy(); assert.equal(frames.size, 0);
});

test("GPS updates remaining walking distance without waiting for another route request", () => {
  const segment = { id: "walk", mode: "WALK" as const, from: "현재 위치", to: "정류장", durationMinutes: 10, distanceMeters: 1000 };
  const path: MapPath = { mode: "WALK", segmentIndex: 0, points: [origin, { ...origin, lng: origin.lng + .01 }] };
  const moved = { ...fix(), lng: origin.lng + .005 };
  const live = updateWalkingProgress(segment, [path], moved);
  assert.ok(Math.abs(live.distanceMeters! - 500) < 5); assert.ok(Math.abs(live.durationMinutes - 5) < .1);
  assert.equal(updateWalkingProgress(segment, [{ ...path, approximate: true }], moved), segment);
  assert.equal(updateWalkingProgress(segment, [path], { ...moved, accuracy: 500 }), segment);
});

const paths: MapPath[] = [{ mode: "BUS", points: [origin, { lat: 37.57, lng: 127.0 }, { lat: 37.58, lng: 127.0 }] }];
test("position projects onto the road segment and separates traveled and remaining geometry", () => {
  const current = { ...fix(), lat: 37.57, lng: 126.99 };
  const projection = projectOnPaths(paths, current);
  assert.equal(projection?.distance, 0);
  const split = splitProgress(paths, current);
  assert.equal(split[0].traveled, true);
  assert.deepEqual(split[1].points[0], { lat: 37.57, lng: 126.99 });
  assert.deepEqual(split[1].points.at(-1), { lat: 37.58, lng: 127.0 });
});

test("stale/out-of-order/invalid GPS cannot move the marker backwards", () => {
  const current = fix();
  assert.equal(isFreshFix({ ...current, timestamp: current.timestamp - 1 }, current), false);
  assert.equal(isFreshFix({ ...current, timestamp: current.timestamp - 40_000 }), false);
  assert.equal(isFreshFix({ ...current, lat: NaN }), false);
  assert.equal(isFreshFix(current), true);
});

test("GPS movement reroutes with throttling; stationary users still get periodic traffic updates", () => {
  const now = Date.now();
  const input = { now, lastAttempt: now - 11_000, intervalSeconds: 45, evaluatedOrigin: origin, fix: { ...fix(now), lat: origin.lat + 0.001 } };
  assert.equal(shouldReplan(input), true);
  assert.equal(shouldReplan({ ...input, lastAttempt: now - 9_000 }), false);
  assert.equal(shouldReplan({ ...input, fix: fix(now) }), false);
  assert.equal(shouldReplan({ ...input, fix: { ...input.fix, accuracy: 300 } }), false);
  assert.equal(shouldReplan({ ...input, lastAttempt: now - 46_000, fix: fix(now) }), true);
});

test("trip service preserves the chosen result coordinates and evaluates from a new GPS origin", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: {
    getCurrentPosition: (success: (position: unknown) => void) => success({ coords: { latitude: origin.lat, longitude: origin.lng, accuracy: 8, heading: 90, speed: 1 }, timestamp: Date.now() }),
  } } });
  const bodies: { origin: typeof origin; destination: typeof destination }[] = [];
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "/api/evaluate", "selected places must not be searched again");
    const body = JSON.parse(String(options?.body)); bodies.push(body);
    const now = Date.now();
    return response({ routeSource: "mock", warnings: ["test scenario"], evaluation: evaluateTrip({
      now, deadline: now + 3_600_000, rawRoutes: buildMockRoutes(body.origin, body.destination).routes,
      preferences: DEFAULT_PREFERENCES, dataMode: "DEMO", history: body.history,
    }) });
  };
  const service = new ApiTripService();
  const first = await service.startTrip({ destination: "임의 목적지", destinationPlace: { ...destination, name: "같은 이름의 두 번째 지점", address: "임의 주소" },
    deadline: new Date(Date.now() + 3_600_000).toISOString(), useCurrentLocation: true, preferences: DEFAULT_PREFERENCES });
  const moved = { lat: origin.lat + 0.002, lng: origin.lng + 0.001 };
  const next = await service.getTripSnapshot(first.tripId, { origin: moved });
  assert.deepEqual(bodies[0].destination, destination);
  assert.deepEqual(bodies[1].origin, moved);
  assert.deepEqual(next.origin, moved);
  assert.equal(next.routeSource, "mock");
  assert.ok(next.routes[0].polyline?.length);
  service.endTrip(first.tripId);
  await assert.rejects(service.getTripSnapshot(first.tripId), /찾을 수 없습니다/);
});
