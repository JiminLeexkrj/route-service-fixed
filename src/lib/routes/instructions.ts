import type { JourneySegment } from "./types";
import type { ArrivalResponse, Departure } from "@/lib/transit/types";
import { arrivalLabel } from "@/lib/transit/types";

export const isTransit = (segment: JourneySegment) => ["BUS", "SUBWAY", "EXPRESSBUS", "TRAIN", "AIRPLANE", "FERRY"].includes(segment.mode);
export const isOnFoot = (segment: JourneySegment) => segment.mode === "WALK" || segment.mode === "RUN";
export const formatDistance = (meters?: number) => meters === undefined ? "거리 정보 없음" : meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
export const minutesLabel = (minutes: number) => minutes < 1 ? "1분 미만" : `${Math.ceil(minutes)}분`;
export const segmentKey = (s: JourneySegment) => [s.mode, s.routeName, s.from, s.to, s.transit?.stationId, s.transit?.endStationId].join("|");
const transitLabels: Partial<Record<JourneySegment["mode"], string>> = { SUBWAY: "지하철", EXPRESSBUS: "고속·시외버스", TRAIN: "기차", AIRPLANE: "항공편", FERRY: "여객선" };
export const transitName = (s: JourneySegment) => s.mode === "BUS" ? `${s.routeName ?? "안내된"}번 버스`.replace("번번", "번") : s.routeName ?? transitLabels[s.mode] ?? "교통수단";
export const directionLabel = (s: JourneySegment) => s.transit?.nextStopName ? `${s.transit.nextStopName} 방면` : s.transit?.direction ? `${s.transit.direction.replace(/\s*방면$/, "")} 방면` : "승강장·정류장의 방면을 확인하세요";

export function reachableDeparture(data: ArrivalResponse | null, next: JourneySegment, now: number, approachMinutes = 0): Departure | undefined {
  if (!data || data.status !== "live" || now - data.fetchedAt > 90_000) return undefined;
  const readyAt = now + approachMinutes * 60_000 + 30_000;
  return data.departures.find((departure) => {
    if (departure.arrivalAt === undefined || departure.arrivalAt < readyAt) return false;
    if (next.mode === "SUBWAY") {
      const normalize = (s: string) => s.replace(/\([^)]*\)/g, "").replace(/(역|행)+$/, "").replace(/\s/g, "");
      const terminal = normalize(departure.destination);
      // 목적지 전에 종착하는 단축 운행 열차를 승차 대상으로 추천하지 않습니다.
      const stops = next.transit?.stops ?? [];
      if (stops.slice(1, -1).some((stop) => normalize(stop.name) === terminal)) return false;
    }
    return true;
  });
}

export function describeNextAction(segments: JourneySegment[], index: number, boarded: boolean, data: ArrivalResponse | null, now: number): { title: string; details: string[]; button: string } {
  const segment = segments[index];
  if (!segment) return { title: "목적지에 도착했습니다", details: ["이동을 마쳤다면 도착을 확인해 주세요."], button: "도착 확인" };
  const distance = formatDistance(segment.distanceMeters);
  const duration = minutesLabel(segment.durationMinutes);
  if (isOnFoot(segment)) {
    const next = segments.slice(index + 1).find(isTransit);
    const details = [`${segment.from} → ${segment.to} · ${distance} · 예상 ${duration}`];
    details.push(...(segment.steps ?? []).slice(0, 3).map((step) => step.description));
    if (segment.mode === "RUN") details.push(`가벼운 달리기 기준입니다. 걷기보다 보행 구간에서 약 ${(segment.savedMinutes ?? 0).toFixed(1)}분을 줄이는 계획입니다. 신호 대기와 실내 환승은 걸어서 이동하세요.`);
    if (next) {
      if (next.transit?.startExit) details.push(`${next.from} ${next.transit.startExit}번 출입구로 들어가세요.`);
      details.push(`다음: ${next.from}에서 ${directionLabel(next)} ${transitName(next)} 승차 → ${next.to} 하차.`);
      const approach = segments.slice(index, segments.indexOf(next)).reduce((sum, s) => sum + s.durationMinutes, 0);
      const departure = reachableDeparture(data, next, now, approach);
      if (departure) details.push(`${transitName(next)} ${arrivalLabel(departure, now)} 도착 예정${next.mode === "SUBWAY" ? ` · ${departure.destination}행 (하차역 정차 확인)` : ""}. 이동 시간과 승차 준비 30초를 고려한 다음 편입니다.`);
      else details.push("승차 시각은 실시간 도착정보와 현장 전광판을 확인하세요. 배차간격은 실제 남은 대기시간이 아닙니다.");
    }
    return { title: `${segment.to}까지 ${segment.mode === "RUN" ? "달려가세요" : "걸어가세요"}`, details,
      button: index === segments.length - 1 ? "목적지에 도착했어요" : "여기에 도착했어요" };
  }
  if (isTransit(segment)) {
    const details = [directionLabel(segment)];
    if (["EXPRESSBUS", "TRAIN", "AIRPLANE", "FERRY"].includes(segment.mode)) details.push("승차권·예약, 실제 출발 시각과 탑승 마감은 운영사에서 확인해 주세요.");
    if (boarded) {
      details.push(`${segment.to}에서 내리세요. 이 구간 전체는 ${segment.transit?.stationCount ? `${segment.transit.stationCount}정거장 · ` : ""}예상 ${duration}입니다.`);
      const next = segments[index + 1];
      if (segment.transit?.endExit) details.push(`하차 후 ${segment.transit.endExit}번 출구로 이동하세요.`);
      if (next) details.push(`하차 후: ${isOnFoot(next) ? `${next.to}까지 ${formatDistance(next.distanceMeters)} ${next.mode === "RUN" ? "달리기" : "도보"} · 예상 ${minutesLabel(next.durationMinutes)}` : `${next.from}에서 ${transitName(next)}로 환승`}.`);
      return { title: `${transitName(segment)} 이용 중 · ${segment.to} 하차`, details, button: "하차했어요" };
    }
    const departure = reachableDeparture(data, segment, now);
    details.push(departure ? `${arrivalLabel(departure, now)} 도착 예정 · ${departure.destination}${segment.mode === "SUBWAY" ? "행. 하차역에 정차하는 열차인지 확인하고 승차하세요." : ". 버스 번호를 확인하고 승차하세요."}` : "도착 시각을 확인한 뒤 승차하세요. 확인되지 않은 대기시간은 안내하지 않습니다.");
    if (segment.transit?.arsId) details.push(`승차 정류장 번호 ${segment.transit.arsId}. 반대편 정류장과 구분해 주세요.`);
    if (segment.transit?.fastTransfer) details.push(`빠른 환승 위치 ${segment.transit.fastTransfer}.`);
    details.push(`${segment.to}까지 ${segment.transit?.stationCount ? `${segment.transit.stationCount}정거장 · ` : ""}예상 ${duration} 이동 후 하차하세요.`);
    return { title: `${segment.from}에서 ${transitName(segment)}에 타세요`, details, button: "승차했어요" };
  }
  return { title: boarded ? `${segment.to}까지 택시로 이동하세요` : `${segment.from}에서 택시를 호출하세요`,
    details: [`택시 앱의 승차 위치를 현재 위치로, 목적지를 ${segment.to}(으)로 지정하세요.`, `주행 ${distance} · 예상 ${duration}. 배차와 승차 대기시간은 포함되지 않습니다.`, "차량 번호와 목적지를 확인한 뒤 승차하세요."],
    button: boarded ? "택시에서 내렸어요" : "택시에 탔어요" };
}
