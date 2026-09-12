"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BusFront, Check, ChevronDown, Flag, Footprints, MapPin, TrainFront, Trophy, Undo2, Zap, CarTaxiFront, Plane, Ship } from "lucide-react";
import type { Coordinate, JourneySegment, LocationFix } from "@/lib/routes/types";
import { updateWalkingProgress } from "@/lib/routes/live-guidance";
import type { RouteOption } from "@/types/trip";
import { describeNextAction, directionLabel, formatDistance, isOnFoot, isTransit, minutesLabel, segmentKey, transitName } from "@/lib/routes/instructions";
import { useTransitArrivals } from "@/hooks/use-transit-arrivals";
import { TransitArrivalPanel } from "./transit-arrival-panel";

const MODE = {
  WALK: { Icon: Footprints, label: "도보", color: "#94a3b8" }, RUN: { Icon: Zap, label: "달리기", color: "#bda4ff" },
  BUS: { Icon: BusFront, label: "버스", color: "#63c991" }, SUBWAY: { Icon: TrainFront, label: "지하철", color: "#83aaff" },
  TAXI: { Icon: CarTaxiFront, label: "택시", color: "#facb74" }, CAR: { Icon: CarTaxiFront, label: "택시", color: "#facb74" },
  EXPRESSBUS: { Icon: BusFront, label: "고속·시외버스", color: "#2dd4bf" }, TRAIN: { Icon: TrainFront, label: "기차", color: "#a5b4fc" },
  AIRPLANE: { Icon: Plane, label: "항공", color: "#7dd3fc" }, FERRY: { Icon: Ship, label: "해운", color: "#67e8f9" },
};
type Props = { route: RouteOption; destination: string; deadlineAt?: number; now: number; isDemo: boolean; map: ReactNode; position?: LocationFix | null; resetRevision?: number; onFocus: (point: Coordinate, label: string) => void; onPauseReplanning: (pause: boolean) => void };

export function JourneyGuide({ route, destination, deadlineAt, now, isDemo, map, position, resetRevision, onFocus, onPauseReplanning }: Props) {
  const segments = route.segments ?? [];
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [boarded, setBoarded] = useState(false);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  useEffect(() => { setActiveKey(null); setExpandedKey(null); setBoarded(false); setFinishedAt(null); }, [route.id, resetRevision]);
  const activeIndex = Math.max(0, segments.findIndex((s) => segmentKey(s) === activeKey));
  const active = segments[activeIndex];
  const activeFingerprint = active ? segmentKey(active) : "";
  const previousFingerprint = useRef(activeFingerprint);
  useEffect(() => {
    if (previousFingerprint.current !== activeFingerprint) setBoarded(false);
    previousFingerprint.current = activeFingerprint;
  }, [activeFingerprint]);
  useEffect(() => { onPauseReplanning(boarded || finishedAt !== null); return () => onPauseReplanning(false); }, [boarded, finishedAt, onPauseReplanning]);
  const nextTransit = !finishedAt && !boarded ? segments.slice(activeIndex).find(isTransit) : undefined;
  const arrivals = useTransitArrivals(nextTransit, "realtime", "auto", isDemo);
  const liveSegments = segments.map((segment, index) => index === activeIndex && !isDemo ? updateWalkingProgress(segment, (route.mapPaths ?? []).filter((path) => path.segmentIndex === (segment.sourceIndex ?? index)), position, now) : segment);
  const action = describeNextAction(liveSegments, activeIndex, boarded, arrivals.data, now);
  const advance = () => {
    if (!active) return;
    if (!isOnFoot(active) && !boarded) { setBoarded(true); return; }
    setBoarded(false);
    const next = segments[activeIndex + 1];
    if (next) { setActiveKey(segmentKey(next)); setExpandedKey(segmentKey(next)); }
    else setFinishedAt(now);
  };
  const reset = () => { setActiveKey(segments[0] ? segmentKey(segments[0]) : null); setExpandedKey(null); setBoarded(false); setFinishedAt(null); };
  const cleared = finishedAt !== null && deadlineAt !== undefined && finishedAt <= deadlineAt;
  const percentage = finishedAt ? 100 : segments.length ? Math.round(activeIndex / segments.length * 100) : 0;
  const activeMode = active ? MODE[active.mode] : MODE.WALK;
  const expanded = expandedKey ?? (nextTransit ? segmentKey(nextTransit) : activeFingerprint);

  return <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.05fr]">
    <div className="min-w-0 space-y-5 lg:sticky lg:top-24">
      <section className={`quest-panel relative overflow-hidden p-5 sm:p-6 ${finishedAt ? "quest-clear" : ""}`} aria-label="지금 해야 할 일">
        <span className="absolute left-0 top-0 h-full w-1 bg-[#d8fa48]" />
        <div className="flex items-center justify-between gap-3"><p className="quest-eyebrow text-[#d8fa48]">{finishedAt ? "MISSION RESULT" : "CURRENT QUEST"}</p><span className="font-mono text-[10px] text-slate-500">{finishedAt ? "FINISH" : `STEP ${String(activeIndex + 1).padStart(2, "0")}`}</span></div>
        {finishedAt ? <div className="py-4 text-center"><Trophy size={42} className="mx-auto mb-4 text-[#d8fa48]" /><h2 className="text-2xl font-black">{cleared ? "미션 클리어!" : "목적지 도착 완료"}</h2><p className="mt-3 text-sm text-slate-300">{destination} 도착을 확인했습니다.</p><p className="mt-1 text-xs text-slate-400">{new Date(finishedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} · {cleared ? "목표 시간 안에 도착했어요." : "이동을 마쳤어요."}</p><button type="button" onClick={reset} className="mt-5 text-xs text-slate-500 underline">도착 확인 취소</button></div>
          : !active ? <div className="py-4"><h2 className="font-bold">상세 구간 정보를 받지 못했습니다</h2><p className="mt-2 text-xs text-slate-400">현재 위치에서 경로를 다시 조회해 주세요.</p></div>
          : <>
            <div className="mt-5 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5" style={{ color: activeMode.color }}><activeMode.Icon size={22} /></span><div><p className="mb-1 text-[11px] text-slate-400">지금 해야 할 일</p><h2 aria-live="polite" className="text-xl font-extrabold leading-8 tracking-tight">{action.title}</h2></div></div>
            <ol className="mt-5 space-y-3 text-xs leading-6 text-slate-300">{action.details.map((detail, index) => <li key={index} className="flex gap-3"><span className="mt-1 font-mono text-[10px] text-slate-500">{String(index + 1).padStart(2, "0")}</span><span>{detail}</span></li>)}</ol>
            {arrivals.loading && <p role="status" className="mt-3 text-[11px] text-slate-500">다음 승차 지점 도착정보를 확인하고 있어요.</p>}
            <button type="button" onClick={advance} className="quest-button mt-5 w-full">{action.button}<ArrowRight size={16} /></button>
            <p className="mt-2 text-center text-[10px] text-slate-500">실제로 이동·승하차한 뒤 눌러주세요.</p>
            {(activeIndex > 0 || boarded) && <button type="button" onClick={() => { if (boarded) setBoarded(false); else if (segments[activeIndex - 1]) setActiveKey(segmentKey(segments[activeIndex - 1])); }} className="mt-3 flex items-center gap-1 text-[11px] text-slate-500"><Undo2 size={12} /> 이전 단계로</button>}
          </>}
      </section>
      {map}
      <div className="quest-panel p-4"><div className="flex items-center justify-between text-[11px]"><span className="text-slate-400">미션 진행</span><span className="font-mono text-[#bda4ff]">{finishedAt ? segments.length : activeIndex} / {segments.length} CHECKPOINTS</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-[#bda4ff] transition-[width] duration-500" style={{ width: `${percentage}%` }} /></div></div>
    </div>
    <section className="quest-panel min-w-0 overflow-hidden" aria-label="구간별 이동 안내">
      <div className="border-b border-white/10 p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">미션 로드맵</h2><Flag size={18} className="text-[#d8fa48]" /></div><p className="mt-2 text-xs text-slate-400">구간을 눌러 승하차 위치·도착정보·보행 동작을 확인하세요.</p></div>
      <ol className="px-4 py-5 sm:px-6">
        {segments.map((segment, index) => {
          const key = segmentKey(segment); const style = MODE[segment.mode]; const isExpanded = expanded === key;
          const done = finishedAt !== null || index < activeIndex;
          const title = isOnFoot(segment) ? `${segment.to}까지 ${style.label}` : isTransit(segment) ? `${segment.from} 승차` : `${segment.from}에서 택시`;
          return <li key={`${key}-${index}`} className="relative flex gap-3 sm:gap-4">
            <div className="relative flex w-8 shrink-0 flex-col items-center"><span className="z-10 grid h-8 w-8 place-items-center rounded-full border-2 bg-[#131823]" style={{ borderColor: done ? "#4c5667" : style.color, color: done ? "#64748b" : style.color }}>{done ? <Check size={14} /> : <style.Icon size={15} />}</span><span className={`my-1 min-h-8 w-0.5 flex-1 ${isOnFoot(segment) ? "border-l-2 border-dashed border-slate-600" : ""}`} style={isOnFoot(segment) ? {} : { background: done ? "#343d4d" : style.color }} /></div>
            <div className={`min-w-0 flex-1 pb-6 ${done ? "opacity-65" : ""}`}>
              <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedKey(isExpanded ? "closed" : key)} className="flex w-full items-start justify-between gap-3 pb-2 text-left">
                <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-[11px] font-bold" style={{ color: style.color }}>{segment.mode === "BUS" || segment.mode === "SUBWAY" ? transitName(segment) : style.label}{index === activeIndex && !finishedAt && <span className="rounded bg-[#d8fa48]/10 px-1.5 py-0.5 font-mono text-[9px] text-[#d8fa48]">NOW</span>}</span><strong className="mt-1 block text-base leading-7">{title}</strong><span className="mt-1 block text-[11px] text-slate-400">{isOnFoot(segment) ? `${formatDistance(segment.distanceMeters)} · 예상 ${minutesLabel(segment.durationMinutes)}` : `${segment.to} 하차 · ${segment.transit?.stationCount ? `${segment.transit.stationCount}정거장 · ` : ""}예상 ${minutesLabel(segment.durationMinutes)}`}</span></span>
                <ChevronDown size={16} className={`mt-2 shrink-0 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
              {segment.mode === "RUN" && <p className="mt-1 text-[11px] text-[#bda4ff]">달리기 스킬 적용 · 보행 시간 약 {(segment.savedMinutes ?? 0).toFixed(1)}분 단축</p>}
              {isExpanded && <div className="mt-2">
                {isTransit(segment) && <><p className="text-sm font-semibold text-slate-300">{directionLabel(segment)}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">{segment.transit?.arsId && <span>정류장 {segment.transit.arsId}</span>}{segment.transit?.fastTransfer && <span>빠른 환승 {segment.transit.fastTransfer}</span>}{segment.transit?.startExit && <span>진입 {segment.transit.startExit}번 출구</span>}</div><TransitArrivalPanel segment={segment} now={now} isDemo={isDemo} />
                  {Boolean(segment.transit?.stops?.length) && <details className="mt-4 text-xs text-slate-400"><summary className="cursor-pointer py-2">경유 정류장·역 {segment.transit?.stationCount ? `${segment.transit.stationCount}개` : "보기"}</summary><ol className="mt-2 space-y-2 border-l border-white/15 pl-3">{segment.transit!.stops!.map((stop, stopIndex) => <li key={`${stop.id}-${stopIndex}`}>{stop.name}</li>)}</ol></details>}
                  <div className="mt-4 border-t border-white/10 pt-3"><p className="text-sm font-bold">{segment.to} 하차</p>{segment.transit?.endExit && <p className="mt-1 text-xs text-slate-400">{segment.transit.endExit}번 출구로 나가세요.</p>}</div>
                </>}
                {isOnFoot(segment) && <><p className="text-xs leading-6 text-slate-400">{segment.from}에서 {segment.to}까지 {formatDistance(segment.distanceMeters)} 이동하세요.{segment.walkingEnvironment === "INDOOR" ? " 실내 환승 통로는 걸어서 이동하세요." : ""}</p>
                  {segment.steps?.length ? <ol className="mt-3 space-y-2 border-l border-white/15 pl-3 text-xs leading-6 text-slate-300">{segment.steps.map((step, stepIndex) => <li key={stepIndex}>{step.description}</li>)}</ol> : <p className="mt-2 text-[11px] text-slate-500">점선 구간은 연결 방향이며 실제 보행로와 다를 수 있습니다.</p>}</>}
                {(segment.mode === "TAXI" || segment.mode === "CAR") && <p className="text-xs leading-6 text-slate-400">{segment.to}(으)로 택시를 호출하세요. 표시 시간은 주행 예상이며 배차·승차 대기는 별도입니다.</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {segment.fromCoordinate && !isOnFoot(segment) && <button type="button" onClick={() => onFocus(segment.fromCoordinate!, `${segment.from} 승차`)} className="quest-button-secondary !min-h-8 !px-2 !py-1 !text-[10px]"><MapPin size={12} /> 승차 위치</button>}
                  {segment.toCoordinate && <button type="button" onClick={() => onFocus(segment.toCoordinate!, `${segment.to}${isOnFoot(segment) ? "" : " 하차"}`)} className="quest-button-secondary !min-h-8 !px-2 !py-1 !text-[10px]"><MapPin size={12} /> {isOnFoot(segment) ? "도착 위치" : "하차 위치"}</button>}
                  {index !== activeIndex && !finishedAt && <button type="button" onClick={() => { setBoarded(false); setActiveKey(key); }} className="ml-auto text-[10px] text-[#bda4ff] underline underline-offset-4">현재 구간으로 지정</button>}
                </div>
              </div>}
            </div>
          </li>;
        })}
        <li className="flex items-center gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d8fa48] text-slate-950"><Flag size={15} /></span><div><span className="font-mono text-[9px] tracking-widest text-[#d8fa48]">FINAL CHECKPOINT</span><p className="mt-1 text-base font-extrabold">{destination}</p></div></li>
      </ol>
      <p className="border-t border-white/10 px-5 py-4 text-[10px] leading-5 text-slate-500">구간 시간은 예상 이동시간입니다. 실시간 도착이 확인되지 않으면 대기시간·승차 시각을 확정하지 않습니다.</p>
    </section>
  </div>;
}
