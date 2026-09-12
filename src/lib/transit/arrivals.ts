import type { ArrivalQuery, ArrivalResponse, Departure } from "./types";
import { haversineDistanceMeters, isCoordinate } from "@/lib/routes/geometry";

const CACHE_LIMIT = 100;
const cache = new Map<string, { expires: number; value: Promise<ArrivalResponse> }>();
const normal = (value: unknown) => String(value ?? "").replace(/\([^)]*\)/g, "").replace(/(역|방면|행)+$/g, "").replace(/\s/g, "");
const empty = (message: string, source = "", now = Date.now()): ArrivalResponse => ({ status: "unavailable", source, fetchedAt: now, departures: [], message });

async function requestJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error("도착정보 제공처에 연결하지 못했습니다.");
  const data = await response.json();
  if (!data || typeof data !== "object") throw new Error("도착정보 응답을 확인하지 못했습니다.");
  return data;
}

export function getTransitArrivals(query: ArrivalQuery): Promise<ArrivalResponse> {
  const key = JSON.stringify(query);
  const previous = cache.get(key);
  if (previous && previous.expires > Date.now()) return previous.value;
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  const value = (query.kind === "schedule" ? getTimetable(query) : query.mode === "BUS" ? getBusArrivals(query) : getSubwayArrivals(query))
    .catch((): ArrivalResponse => ({ ...empty("도착정보 조회에 실패했습니다. 잠시 후 새로고침해 주세요."), status: "error" }));
  cache.set(key, { expires: Date.now() + 15_000, value });
  return value;
}

async function getTimetable(_query: ArrivalQuery): Promise<ArrivalResponse> {
  return empty("TMAP 상세 경로 API는 승하차 지점과 구간 소요시간을 제공합니다. 개별 차량의 출발 시간표·실시간 도착분은 포함되지 않으므로, 실시간 탭이나 현장 전광판에서 확인해 주세요.", "TMAP 대중교통");
}

type SubwayRow = {
  subwayId?: string; statnNm?: string; updnLine?: string; trainLineNm?: string;
  barvlDt?: string; recptnDt?: string; bstatnNm?: string; btrainNo?: string;
  arvlMsg2?: string; arvlCd?: string; btrainSttus?: string;
};
export function parseSubwayArrivals(rows: SubwayRow[], query: ArrivalQuery, now: number): ArrivalResponse {
  const lineId = query.lineCode && query.lineCode >= 1 && query.lineCode <= 9 ? String(1000 + query.lineCode) : undefined;
  if (!lineId || (!query.nextStopName && !query.directionCode)) return empty("노선 또는 방면을 확인할 수 없어 다른 열차의 도착정보를 표시하지 않았습니다.", "서울시 TOPIS", now);
  const departures = rows.flatMap((row, index): Departure[] => {
    if (String(row.subwayId) !== lineId || normal(row.statnNm) !== normal(query.stationName)) return [];
    if (query.nextStopName) {
      const next = row.trainLineNm?.split(" - ").at(-1);
      if (!next || normal(next) !== normal(query.nextStopName)) return [];
    } else if (row.updnLine !== (query.directionCode === 1 ? "상행" : "하행")) return [];
    if (row.btrainSttus === "급행" && !query.lineName.includes("급행")) return [];
    const updatedAt = row.recptnDt ? Date.parse(row.recptnDt.replace(" ", "T") + (/[+Z]/.test(row.recptnDt) ? "" : "+09:00")) : NaN;
    if (!Number.isFinite(updatedAt) || now - updatedAt > 120_000 || updatedAt > now + 30_000 || row.arvlCd === "3") return [];
    const seconds = row.barvlDt === "" || row.barvlDt === undefined ? NaN : Number(row.barvlDt);
    // 0초는 제공처의 정보 없음일 수도 있으므로 실제 진입/도착 코드가 있을 때만 곧 도착으로 해석합니다.
    const known = Number.isFinite(seconds) && (seconds > 0 || row.arvlCd === "1" || row.arvlCd === "2");
    const arrivalAt = known ? updatedAt + seconds * 1000 : undefined;
    if (arrivalAt !== undefined && arrivalAt < now - 30_000) return [];
    return [{ id: `${row.btrainNo ?? index}-${updatedAt}`, lineName: query.lineName, destination: row.bstatnNm ?? row.trainLineNm ?? "행선지 확인 필요",
      arrivalAt, updatedAt, message: row.arvlMsg2 ?? "도착 시각 미제공" }];
  }).sort((a, b) => (a.arrivalAt ?? Infinity) - (b.arrivalAt ?? Infinity)).slice(0, 4);
  return { status: "live", source: "서울시 TOPIS", fetchedAt: now, departures,
    message: departures.length ? "열차 정보 생성 시각을 반영했습니다. 행선지와 하차역 정차 여부를 확인하세요." : "이 노선·방면의 최신 도착정보가 없습니다. 역 전광판을 확인해 주세요." };
}
async function getSubwayArrivals(query: ArrivalQuery): Promise<ArrivalResponse> {
  if (!process.env.SEOUL_SUBWAY_API_KEY) return empty("실시간 지하철 서비스가 아직 연결되지 않았습니다. 노선과 승하차 지점은 TMAP 경로 안내에서 확인할 수 있습니다.", "서울시 TOPIS");
  if (!query.lineCode || query.lineCode < 1 || query.lineCode > 9 || (query.cityCode && query.cityCode !== 1000)) return empty("이 지역·노선은 현재 실시간 연동 범위 밖입니다. 역 전광판을 확인해 주세요.", "서울시 TOPIS");
  const baseName = query.stationName.replace(/\([^)]*\)/g, "").replace(/역$/, "").trim();
  const aliases: Record<string, string> = { 공릉: "공릉(서울산업대입구)", 대모산입구: "대모산", 천호: "천호(풍납토성)", 몽촌토성: "몽촌토성(평화의문)" };
  const name = aliases[baseName] ?? baseName;
  const url = `https://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(process.env.SEOUL_SUBWAY_API_KEY)}/json/realtimeStationArrival/0/40/${encodeURIComponent(name)}`;
  const data = await requestJson(url);
  const providerError = data.errorMessage as { code?: string } | undefined;
  if (providerError?.code && providerError.code !== "INFO-000") throw new Error("실시간 지하철 조회 실패");
  if (!Array.isArray(data.realtimeArrivalList)) return empty("이 역의 실시간 도착정보가 없습니다.", "서울시 TOPIS");
  return parseSubwayArrivals(data.realtimeArrivalList, query, Date.now());
}

const xmlValue = (xml: string, tag: string): string => {
  const value = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? "";
  return value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
};
export function parseBusArrivals(xml: string, query: ArrivalQuery, now: number): ArrivalResponse {
  if (xmlValue(xml, "headerCd") !== "0") throw new Error("실시간 버스 조회 실패");
  const items = Array.from(xml.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g), (match) => match[1]);
  const departures = items.flatMap((item, index): Departure[] => {
    const routeId = xmlValue(item, "busRouteId");
    const name = xmlValue(item, "rtNm") || xmlValue(item, "busRouteAbrv");
    if (query.localLineId ? routeId !== query.localLineId : normal(name) !== normal(query.lineName)) return [];
    if (query.nextStopName && xmlValue(item, "nxtStn") && normal(query.nextStopName) !== normal(xmlValue(item, "nxtStn"))) return [];
    return [1, 2].flatMap((order): Departure[] => {
      const message = xmlValue(item, `arrmsg${order}`);
      if (!message || /운행종료|출발대기|회차대기/.test(message)) return [];
      const minutes = /(\d+)분/.exec(message);
      const seconds = /(\d+)초/.exec(message);
      const duration = minutes || seconds ? Number(minutes?.[1] ?? 0) * 60 + Number(seconds?.[1] ?? 0) : undefined;
      return [{ id: `${routeId}-${index}-${order}`, lineName: name || query.lineName, destination: xmlValue(item, "adirection") || xmlValue(item, "nxtStn") || "정류장 행선지 확인",
        arrivalAt: duration === undefined ? undefined : now + duration * 1000, updatedAt: now, message }];
    });
  }).sort((a, b) => (a.arrivalAt ?? Infinity) - (b.arrivalAt ?? Infinity)).slice(0, 4);
  return { status: "live", source: "서울시 버스정보", fetchedAt: now, departures,
    message: departures.length ? "이 승차 정류장의 해당 노선 정보입니다. 30초마다 갱신합니다." : "이 정류장의 해당 노선 도착정보가 없습니다. 운행 여부를 확인해 주세요." };
}
async function getBusArrivals(query: ArrivalQuery): Promise<ArrivalResponse> {
  if (query.cityCode !== undefined && query.cityCode !== 1000) return empty("현재 실시간 버스 연동은 서울 정류장을 지원합니다. 이 구간은 정류장 전광판을 확인해 주세요.", "서울시 버스정보");
  if (!process.env.SEOUL_BUS_API_KEY) return empty("실시간 버스 서비스가 아직 연결되지 않았습니다. 노선·승하차 지점은 아래 경로대로 확인할 수 있습니다.", "서울시 버스정보");
  // 공공데이터의 일반(Decoding) 인증키를 URLSearchParams로 한 번만 인코딩합니다.
  const rawKey = process.env.SEOUL_BUS_API_KEY;
  const serviceKey = /%[0-9a-f]{2}/i.test(rawKey) ? decodeURIComponent(rawKey) : rawKey;
  const arsId = query.arsId?.replace(/-/g, "") || await resolveSeoulStop(query, serviceKey);
  if (!arsId || !/^\d{5}$/.test(arsId)) return empty("TMAP 승차 지점과 일치하는 서울 정류장 번호를 확인하지 못했습니다. 정류장 전광판을 확인해 주세요.", "서울시 버스정보");
  const params = new URLSearchParams({ ServiceKey: serviceKey, arsId });
  const response = await fetch(`https://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?${params}`, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
  if (!response.ok) throw new Error("버스 도착 조회 실패");
  const xml = await response.text();
  if (xml.length > 2_000_000) throw new Error("응답 크기 초과");
  return parseBusArrivals(xml, query, Date.now());
}

const stationCache = new Map<string, { arsId: string; expires: number }>();
async function resolveSeoulStop(query: ArrivalQuery, serviceKey: string): Promise<string | undefined> {
  const coordinate = { lat: query.stationLat!, lng: query.stationLng! };
  if (!isCoordinate(coordinate)) return undefined;
  const identity = `${query.stationName}:${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`;
  const cached = stationCache.get(identity);
  if (cached && cached.expires > Date.now()) return cached.arsId;
  const params = new URLSearchParams({ ServiceKey: serviceKey, stSrch: query.stationName });
  const response = await fetch(`https://ws.bus.go.kr/api/rest/stationinfo/getStationByName?${params}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
  if (!response.ok) return undefined;
  const xml = await response.text();
  if (xml.length > 2_000_000 || xmlValue(xml, "headerCd") !== "0") return undefined;
  const matches = Array.from(xml.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g)).flatMap((match) => {
    const row = match[1];
    if (normal(xmlValue(row, "stNm")) !== normal(query.stationName)) return [];
    const point = { lat: Number(xmlValue(row, "tmY")), lng: Number(xmlValue(row, "tmX")) };
    const arsId = xmlValue(row, "arsId");
    if (!isCoordinate(point) || !/^\d{5}$/.test(arsId) || arsId === "00000") return [];
    const distance = haversineDistanceMeters(point, coordinate);
    return distance <= 80 ? [{ arsId, distance }] : [];
  }).sort((a, b) => a.distance - b.distance);
  // 같은 이름의 맞은편 정류장이 비슷한 거리에 있으면 임의로 선택하지 않습니다.
  if (!matches.length || (matches[1] && matches[1].distance - matches[0].distance < 10)) return undefined;
  if (stationCache.size >= 100) stationCache.delete(stationCache.keys().next().value!);
  stationCache.set(identity, { arsId: matches[0].arsId, expires: Date.now() + 3600_000 });
  return matches[0].arsId;
}
