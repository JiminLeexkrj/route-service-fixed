import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { buildPolicies } from "../src/lib/algorithm/policyBuilder";
import { evaluateTrip } from "../src/lib/algorithm/evaluateTrip";
import { getTmapTransitRoutes } from "../src/lib/routes/providers/tmap";
import { tmapSubway, tmapResponse } from "./tmap-fixtures";
import { describeNextAction, reachableDeparture } from "../src/lib/routes/instructions";
import { parseBusArrivals, parseSubwayArrivals, getTransitArrivals } from "../src/lib/transit/arrivals";
import { GET } from "../src/app/api/transit/route";
import { DEFAULT_PREFERENCES } from "../src/types/trip";
import type { JourneySegment, RawRoute } from "../src/lib/routes/types";
import type { ArrivalQuery, ArrivalResponse } from "../src/lib/transit/types";

const env = { ...process.env }; const originalFetch = globalThis.fetch;
afterEach(() => { process.env = { ...env }; globalThis.fetch = originalFetch; });
const now = Date.parse("2026-09-12T17:38:00+09:00");
const base: RawRoute = { id: "transit-1", mode: "MIXED", durationMinutes: 32, distanceMeters: 3800, estimatedArrivalTime: "18:10", fare: 100000,
  segments: [
    { mode: "WALK", from: "현재 위치", to: "A정류장", durationMinutes: 6, distanceMeters: 400, walkingEnvironment: "OUTDOOR" },
    { mode: "BUS", from: "A정류장", to: "B정류장", durationMinutes: 10, distanceMeters: 2000, routeName: "성북04" },
    { mode: "WALK", from: "B정류장", to: "안암역", durationMinutes: 4, distanceMeters: 280, walkingEnvironment: "OUTDOOR" },
    { mode: "SUBWAY", from: "안암역", to: "동묘앞역", durationMinutes: 4, routeName: "6호선" },
    { mode: "WALK", from: "6호선 승강장", to: "1호선 승강장", durationMinutes: 3, distanceMeters: 180, walkingEnvironment: "INDOOR" },
  ],
  mapPaths: [{ mode: "WALK", segmentIndex: 0, points: [{ lat: 37.57, lng: 127 }, { lat: 37.571, lng: 127.001 }], approximate: true },
    { mode: "WALK", segmentIndex: 2, points: [{ lat: 37.58, lng: 127 }, { lat: 37.581, lng: 127.001 }], approximate: true }],
};

test("running changes access and middle transfer walk times and map modes, while vehicles and indoor transfers keep their duration", () => {
  const [walk, run] = buildPolicies([base], now, { allowTaxi: false, canRun: true });
  assert.equal(run.segments[0].mode, "RUN"); assert.equal(run.segments[2].mode, "RUN");
  assert.equal(run.segments[4].mode, "WALK");
  assert.ok(run.segments[0].travelTime.p50 < walk.segments[0].travelTime.p50);
  assert.equal(run.segments[1].travelTime.p50, walk.segments[1].travelTime.p50);
  assert.equal(run.segments[3].travelTime.p50, walk.segments[3].travelTime.p50);
  assert.ok(run.segments[2].savedMinutes! > 0);
  assert.equal(run.mapPaths?.[1].mode, "RUN");
  const without = buildPolicies([base], now, { allowTaxi: false, canRun: false });
  assert.equal(without.length, 1); assert.ok(without.every((p) => p.segments.every((s) => s.mode !== "RUN")));
});

test("expensive fares no longer reject routes, but disallowed taxi routes never come back as fallback", () => {
  const result = evaluateTrip({ now, deadline: now + 3600_000, rawRoutes: [base], preferences: { ...DEFAULT_PREFERENCES, walkingDistanceMeters: 5000 }, history: { candidateStreak: 0 }, dataMode: "LIVE" });
  assert.equal(result.policies[0].rejectedReasons.length, 0);
  const car: RawRoute = { ...base, id: "car", mode: "CAR", segments: [{ mode: "CAR", from: "출발", to: "목적", durationMinutes: 15 }] };
  assert.equal(buildPolicies([car], now, { canRun: false, allowTaxi: false }).length, 0);
  assert.throws(() => evaluateTrip({ now, deadline: now + 3600_000, rawRoutes: [car], preferences: { ...DEFAULT_PREFERENCES, allowTaxi: false }, history: { candidateStreak: 0 }, dataMode: "LIVE" }), /이동 수단/);
});

test("TMAP station IDs, next station, line and walking directions reach the action guidance", async () => {
  process.env.TMAP_APP_KEY = "test-only";
  globalThis.fetch = async () => Response.json(tmapResponse([tmapSubway]));
  const routes = await getTmapTransitRoutes({ lat: 37.585, lng: 127.027 }, { lat: 37.571, lng: 127.015 });
  const [policy] = buildPolicies(routes, now, { allowTaxi: false, canRun: false });
  const subway = policy.segments[1];
  assert.equal(subway.transit?.stationId, "TMAP-640"); assert.equal(subway.transit?.provider, "TMAP");
  assert.equal(subway.transit?.lineCode, 6); assert.equal(subway.transit?.nextStopName, "보문");
  assert.equal(subway.transit?.fastTransfer, undefined, "unprovided platform positions cannot be fabricated");
  const action = describeNextAction(policy.segments.map((s) => ({ ...s, durationMinutes: s.travelTime.p50 })), 1, false, null, now);
  assert.match(action.title, /안암.*6호선/); assert.match(action.details.join(" "), /보문.*동묘앞/);
});

const query: ArrivalQuery = { kind: "realtime", mode: "SUBWAY", stationName: "안암", lineName: "6호선", lineCode: 6, cityCode: 1000, directionCode: 1, nextStopName: "보문" };
const subwayRow = { statnNm: "안암", subwayId: "1006", updnLine: "상행", trainLineNm: "응암순환 - 보문방면", bstatnNm: "응암순환", barvlDt: "360", recptnDt: "2026-09-12 17:37:30", arvlCd: "0", btrainNo: "6101" };
test("subway live arrivals match station, line and next direction, compensate source age and discard stale departures", () => {
  const result = parseSubwayArrivals([subwayRow, { ...subwayRow, subwayId: "1001" }, { ...subwayRow, trainLineNm: "봉화산 - 고려대방면" },
    { ...subwayRow, recptnDt: "2026-09-12 17:30:00" }, { ...subwayRow, arvlCd: "3" }], query, now);
  assert.equal(result.departures.length, 1); assert.equal(result.departures[0].arrivalAt, now + 330_000);
  const unknown = parseSubwayArrivals([{ ...subwayRow, barvlDt: "0", arvlCd: "0", arvlMsg2: "전역 출발" }], query, now);
  assert.equal(unknown.departures[0].arrivalAt, undefined, "unknown zero must not become a fabricated immediate arrival");
});

test("bus live API filters route identity and never treats average interval or departure waiting as an arrival", () => {
  const xml = `<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>
    <itemList><busRouteId>wrong</busRouteId><rtNm>999</rtNm><arrmsg1>1분후</arrmsg1></itemList>
    <itemList><busRouteId>12345</busRouteId><rtNm>성북04</rtNm><nxtStn>안암역</nxtStn><arrmsg1>6분6초후[2번째 전]</arrmsg1><arrmsg2>출발대기</arrmsg2></itemList>
    </msgBody></ServiceResult>`;
  const result = parseBusArrivals(xml, { kind: "realtime", mode: "BUS", stationName: "고려대학교", lineName: "성북04", localLineId: "12345", nextStopName: "안암역" }, now);
  assert.equal(result.departures.length, 1); assert.equal(result.departures[0].arrivalAt, now + 366_000);
});

test("TMAP bus stops resolve by matching name and coordinates before looking up Seoul arrivals", async () => {
  process.env.SEOUL_BUS_API_KEY = "test-only-seoul-key";
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)); requests.push(url);
    assert.equal(url.searchParams.get("ServiceKey"), "test-only-seoul-key");
    if (url.pathname.endsWith("getStationByName")) return new Response(`<ServiceResult><headerCd>0</headerCd>
      <itemList><stNm>TMAP 테스트 정류장</stNm><tmX>127.028</tmX><tmY>37.586</tmY><arsId>08123</arsId></itemList>
      <itemList><stNm>TMAP 테스트 정류장</stNm><tmX>127.029</tmX><tmY>37.586</tmY><arsId>08124</arsId></itemList></ServiceResult>`);
    assert.equal(url.searchParams.get("arsId"), "08123");
    return new Response(`<ServiceResult><headerCd>0</headerCd><itemList><rtNm>성북04</rtNm><nxtStn>안암역</nxtStn><arrmsg1>6분후</arrmsg1></itemList></ServiceResult>`);
  };
  const result = await getTransitArrivals({ mode: "BUS", kind: "realtime", stationName: "TMAP 테스트 정류장", stationId: "TMAP-UNRELATED-ID", lineName: "성북04", stationLat: 37.586, stationLng: 127.028, nextStopName: "안암역" });
  assert.equal(result.departures.length, 1); assert.equal(result.status, "live"); assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => !url.toString().includes("TMAP-UNRELATED-ID")));
});

test("TMAP service information does not call an old timetable provider or invent departures", async () => {
  globalThis.fetch = async () => { throw new Error("no timetable upstream is configured"); };
  const result = await getTransitArrivals({ ...query, kind: "schedule" });
  assert.equal(result.status, "unavailable"); assert.equal(result.departures.length, 0); assert.equal(result.source, "TMAP 대중교통");
});

test("missing live credentials returns explicit unavailable without fake fallback data or upstream calls", async () => {
  delete process.env.SEOUL_SUBWAY_API_KEY; delete process.env.SEOUL_BUS_API_KEY;
  globalThis.fetch = async () => { throw new Error("must not contact upstream without credentials"); };
  const result = await getTransitArrivals({ ...query, stationName: "미연결테스트역" });
  assert.equal(result.status, "unavailable"); assert.equal(result.departures.length, 0);
  const malformed = await GET(new NextRequest("http://localhost/api/transit?kind=realtime&mode=BOAT&stationName=안암&lineName=6"));
  assert.equal(malformed.status, 400);
});

test("next action includes catchable live departure and never recommends a train that terminates before the exit", () => {
  const bus: JourneySegment = { id: "bus", mode: "BUS", from: "A정류장", to: "B정류장", durationMinutes: 10, routeName: "성북04", transit: { stationCount: 5 } };
  const walk: JourneySegment = { id: "walk", mode: "RUN", from: "현재 위치", to: "A정류장", durationMinutes: 3, distanceMeters: 400, savedMinutes: 3 };
  const data: ArrivalResponse = { status: "live", source: "서울시", fetchedAt: now, message: "", departures: [
    { id: "miss", lineName: "성북04", destination: "B", arrivalAt: now + 60000, message: "1분 뒤" },
    { id: "catch", lineName: "성북04", destination: "B", arrivalAt: now + 360000, message: "6분 뒤" },
  ] };
  const action = describeNextAction([walk, bus], 0, false, data, now);
  assert.match(action.title, /A정류장.*달려/); assert.match(action.details.join(" "), /성북04번 버스 6분 뒤/);
  assert.match(describeNextAction([bus], 0, true, data, now).title, /B정류장 하차/);
  assert.equal(reachableDeparture(data, bus, now + 100000), undefined, "stale realtime feed is not a boarding instruction");
  const subway: JourneySegment = { ...bus, mode: "SUBWAY", transit: { stops: [{ name: "안암" }, { name: "보문" }, { name: "동묘앞" }] } };
  const shortTurn: ArrivalResponse = { ...data, departures: [{ id: "short", lineName: "6호선", destination: "보문", arrivalAt: now + 500000, message: "" }] };
  assert.equal(reachableDeparture(shortTurn, subway, now), undefined);
});
