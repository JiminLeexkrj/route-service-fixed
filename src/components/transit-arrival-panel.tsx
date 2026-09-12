"use client";
import { RefreshCw, Radio, CalendarDays } from "lucide-react";
import { useState } from "react";
import { useTransitArrivals } from "@/hooks/use-transit-arrivals";
import type { JourneySegment } from "@/lib/routes/types";
import { arrivalLabel } from "@/lib/transit/types";

export function TransitArrivalPanel({ segment, now, isDemo }: { segment: JourneySegment; now: number; isDemo: boolean }) {
  const [kind, setKind] = useState<"realtime" | "schedule">("realtime");
  const { data, loading, refresh } = useTransitArrivals(segment, kind, "auto", isDemo);
  const stale = data?.status === "live" && now - data.fetchedAt > 90_000;
  return <div className="mt-4 rounded-xl border border-white/10 bg-[#0c111a] p-3 sm:p-4">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${segment.from} 도착정보 종류`}>
      {[{ value: "realtime" as const, label: "실시간", Icon: Radio }, { value: "schedule" as const, label: "운행 안내", Icon: CalendarDays }].map(({ value, label, Icon }) =>
        <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${kind === value ? "border-[#bda4ff]/50 bg-[#bda4ff]/10 text-[#d8c8ff]" : "border-white/10 text-slate-400"}`}><Icon size={12} />{label}</button>)}
      <button type="button" onClick={refresh} disabled={loading} aria-label={`${segment.from} 도착정보 새로고침`} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-white/10"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
    </div>
    {segment.mode !== "BUS" && segment.mode !== "SUBWAY" && <p className="mt-3 text-xs text-slate-400">이 교통수단의 차량 도착정보는 운영사에서 확인해 주세요.</p>}
    {kind === "schedule" && segment.transit?.service !== undefined && <p className="mt-3 text-xs text-slate-300">경로 조회 시각: {segment.transit.service ? "운행 중으로 조회됨" : "운행 종료"} · 도착 예정 시각과는 다릅니다.</p>}
    {isDemo ? <p className="mt-3 text-xs text-amber-300">훈련용 예시 경로입니다. 실제 정류장의 도착정보를 연결하지 않습니다.</p>
      : stale ? <p role="status" className="mt-3 text-xs text-amber-300">도착정보가 오래되었습니다. 새로고침 후 확인하세요.</p>
      : <>
        {loading && !data && <p role="status" className="mt-3 text-xs text-slate-400">{kind === "realtime" ? "실시간 도착정보" : "운행 안내"} 조회 중…</p>}
        {data?.departures.length ? <ul className="mt-3 divide-y divide-white/10" aria-label={`${segment.from} ${kind === "realtime" ? "실시간 도착 목록" : "예정 시간표"}`}>
          {data.departures.map((departure) => <li key={departure.id} className="py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="font-mono text-base font-bold text-white">{departure.arrivalAt === undefined ? "--:--" : new Date(departure.arrivalAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
              <strong className={`text-sm ${kind === "realtime" ? "text-[#d8fa48]" : "text-[#c4b5fd]"}`}>{kind === "schedule" ? "시간표 예정" : arrivalLabel(departure, now)}</strong></div>
            <p className="mt-1 text-xs text-slate-300">{departure.destination}{segment.mode === "SUBWAY" ? "행" : ""}</p><p className="mt-1 text-[10px] text-slate-500">{departure.message}</p>
          </li>)}
        </ul> : null}
        {data && <p role="status" className="mt-3 text-xs leading-5 text-slate-400">{data.message}</p>}
      </>}
    {segment.mode === "BUS" && kind === "schedule" && segment.transit?.intervalMinutes && <p className="mt-3 text-sm text-slate-200">평균 배차간격 약 {segment.transit.intervalMinutes}분 <span className="block text-[11px] text-slate-500">다음 버스가 {segment.transit.intervalMinutes}분 뒤 온다는 뜻은 아닙니다.</span></p>}
    {data?.source && <p className="mt-3 border-t border-white/5 pt-2 font-mono text-[9px] text-slate-500">{data.status === "live" ? "LIVE" : data.status === "schedule" ? "SCHEDULE" : "연결 상태"} · {data.source}{data.serviceDay ? ` · ${data.serviceDay}` : ""} · {new Date(data.fetchedAt).toLocaleTimeString("ko-KR", { hour12: false })} 조회</p>}
  </div>;
}
