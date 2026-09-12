// 모의 응답: TMAP 공식 상세 응답 필드와 단위(초, m)를 사용합니다.
export const tmapBus = { totalTime: 900, totalDistance: 2500, pathType: 2, legs: [
  { mode: "WALK", sectionTime: 120, distance: 200, start: { name: "출발지", lon: 126.98, lat: 37.57 }, end: { name: "A정류장", lon: 126.981, lat: 37.571 },
    steps: [{ description: "횡단보도를 건너 A정류장으로 이동", distance: 200, linestring: "126.98,37.57 126.9805,37.5701 126.981,37.571" }] },
  { mode: "BUS", route: "간선:123", routeId: "tmap-bus-123", type: 11, service: 1, sectionTime: 600, distance: 2000,
    start: { name: "A정류장", lon: 126.981, lat: 37.571 }, end: { name: "B정류장", lon: 127.009, lat: 37.579 },
    passShape: { linestring: "126.981,37.571 126.99,37.572 127.009,37.579" },
    passStopList: { stations: [{ stationID: "TMAP-A", stationName: "A정류장", lon: "126.981", lat: "37.571" }, { stationID: "TMAP-C", stationName: "C정류장", lon: "126.99", lat: "37.572" }, { stationID: "TMAP-B", stationName: "B정류장", lon: "127.009", lat: "37.579" }] } },
  { mode: "WALK", sectionTime: 180, distance: 300, start: { name: "B정류장", lon: 127.009, lat: 37.579 }, end: { name: "도착지", lon: 127.01, lat: 37.58 },
    steps: [{ description: "목적지까지 보행로를 따라 이동", distance: 300, linestring: "127.009,37.579 127.01,37.58" }] },
] };
export const tmapSubway = { ...tmapBus, pathType: 1, legs: tmapBus.legs.map((leg) => leg.mode === "BUS" ? { ...leg, mode: "SUBWAY", route: "수도권6호선", routeId: "metro-6", type: 6,
  start: { name: "안암", lon: 127.028, lat: 37.586 }, end: { name: "동묘앞", lon: 127.016, lat: 37.572 },
  passShape: { linestring: "127.028,37.586 127.02,37.58 127.016,37.572" }, passStopList: { stations: [
    { stationID: "TMAP-640", stationName: "안암", lon: "127.028", lat: "37.586" }, { stationID: "TMAP-639", stationName: "보문", lon: "127.02", lat: "37.58" }, { stationID: "TMAP-637", stationName: "동묘앞", lon: "127.016", lat: "37.572" },
  ] } } : leg) };
export const tmapResponse = (itineraries: unknown[] = [tmapBus]) => ({ metaData: { plan: { itineraries } } });
export const tmapWalkResponse = { features: [
  { geometry: { type: "Point", coordinates: [127, 37.57] }, properties: { totalTime: 300, totalDistance: 250, description: "보행로로 출발" } },
  { geometry: { type: "LineString", coordinates: [[127, 37.57], [127.0005, 37.5701], [127.001, 37.571]] }, properties: { distance: 250, time: 300 } },
] };
