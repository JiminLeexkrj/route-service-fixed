"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Flag, RefreshCw, Timer, Zap } from "lucide-react";
import type { Coordinate, LocationFix } from "@/lib/routes/types";
import { AppHeader } from "./app-header";
import { RouteMap } from "./map/RouteMap";
import { UserPreferencePanel } from "./user-preference-panel";
import { JourneyGuide } from "./journey-guide";
import { DEFAULT_PREFERENCES, type TripSnapshot, type UserPreferences } from "@/types/trip";

type Props = {
  trip: TripSnapshot; position: LocationFix | null; locationError: string | null;
  isRefreshing: boolean; onRefresh: () => Promise<void>; error: string | null;
  isSimulating: boolean; onSimulateTraffic: () => Promise<void>;
  onSavePreferences: (preferences: UserPreferences) => Promise<void>; onBack: () => void;
  onPauseReplanning?: (pause: boolean) => void;
};
const modeLabel = { WALK: "도보·달리기", BUS: "버스", SUBWAY: "지하철", MIXED: "환승 조합", CAR: "택시", EXPRESSBUS: "고속·시외", TRAIN: "기차", AIRPLANE: "항공", FERRY: "해운" };
function countdown(deadline: number | undefined, now: number) {
  if (deadline === undefined) return "--:--";
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  const hours = Math.floor(total / 3600);
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export function TripDashboard({ trip, position, locationError, isRefreshing, onRefresh, error, isSimulating, onSimulateTraffic, onSavePreferences, onBack, onPauseReplanning }: Props) {
  const recommendedId = trip.routes.find((route) => route.recommended)?.id ?? trip.routes[0]?.id;
  const [selectedId, setSelectedId] = useState(recommendedId);
  const [now, setNow] = useState(Date.now());
  const [openSignal, setOpenSignal] = useState(0);
  const [pause, setPause] = useState(false);
  const [guideVersion, setGuideVersion] = useState(0);
  const [viewRevision, setViewRevision] = useState(0);
  const [focus, setFocus] = useState<{ coordinate: Coordinate; label: string; revision: number }>();
  const previousRecommended = useRef(recommendedId);
  const route = trip.routes.find((candidate) => candidate.id === selectedId) ?? trip.routes.find((candidate) => candidate.recommended) ?? trip.routes[0];
  const preferences = trip.preferences ?? DEFAULT_PREFERENCES;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const previous = previousRecommended.current;
    if (!pause) setSelectedId((selected) => !trip.routes.some((candidate) => candidate.id === selected) || selected === previous ? recommendedId : selected);
    previousRecommended.current = recommendedId;
  }, [trip.routes, recommendedId, pause]);
  const pauseReplanning = useCallback((paused: boolean) => { setPause(paused); onPauseReplanning?.(paused); }, [onPauseReplanning]);
  const focusMap = (coordinate: Coordinate, label: string) => {
    setFocus((previous) => ({ coordinate, label, revision: (previous?.revision ?? 0) + 1 }));
    document.getElementById("mission-map")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  };
  const refreshRoute = async () => { pauseReplanning(false); await onRefresh(); setGuideVersion((v) => v + 1); setFocus(undefined); };
  const applyPreferences = async (value: UserPreferences) => {
    await onSavePreferences(value); pauseReplanning(false); setGuideVersion((v) => v + 1);
  };
  const overdue = trip.deadlineAt !== undefined && now > trip.deadlineAt;
  const slack = route?.arrivalAt !== undefined && trip.deadlineAt !== undefined ? Math.round((trip.deadlineAt - route.arrivalAt) / 60000) : null;
  return <div className="quest-shell min-h-screen">
    <AppHeader compact onOpenPreferences={() => setOpenSignal((value) => value + 1)} />
    <main className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-8 sm:pt-8">
      <div className="mb-6 flex items-center gap-3"><button type="button" onClick={onBack} aria-label="목적지 입력 화면으로 돌아가기" className="quest-button-secondary !p-3"><ArrowLeft size={17} /></button>
        <div className="min-w-0 flex-1"><p className="quest-eyebrow">MISSION IN PROGRESS</p><h1 className="mt-1 flex items-center gap-2 text-lg font-black sm:text-xl"><Flag size={17} className="shrink-0 text-[#d8fa48]" /><span className="truncate">{trip.destination}</span></h1></div>
        <span className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[9px] ${trip.routeSource === "mock" ? "border-amber-400/40 text-amber-300" : "border-white/15 text-slate-400"}`}>{trip.routeSource === "mock" ? "DEMO" : "TIME QUEST"}</span>
      </div>
      <section className="quest-panel mb-6 grid grid-cols-2 divide-x divide-white/10 overflow-hidden sm:grid-cols-[1.4fr_1fr_1fr]" aria-label="미션 제한 시간">
        <div className="col-span-2 flex items-center justify-between gap-3 border-b border-white/10 p-5 sm:col-span-1 sm:border-b-0 sm:p-6"><div><p className="flex items-center gap-2 text-[11px] text-slate-400"><Timer size={13} />{overdue ? "목표 시간이 지났어요" : "남은 미션 시간"}</p><p className={`quest-timer mt-2 text-4xl font-bold sm:text-5xl ${overdue ? "text-rose-300" : "text-[#d8fa48]"}`}>{countdown(trip.deadlineAt, now)}</p></div><span className="text-right text-[10px] leading-5 text-slate-500">마감<br /><strong className="font-mono text-sm text-slate-300">{trip.status.deadline}</strong></span></div>
        <div className="p-5 sm:p-6"><p className="text-[11px] text-slate-400">선택 경로 예상 도착</p><p className="mt-3 font-mono text-2xl font-bold text-white">{route?.arrivalTime ?? "--:--"}</p><p className={`mt-2 text-[11px] ${slack !== null && slack < 0 ? "text-rose-300" : "text-[#bda4ff]"}`}>{slack === null ? "교통 상황에 따라 변동" : slack >= 0 ? `목표보다 약 ${slack}분 일찍` : `목표보다 약 ${-slack}분 늦게`}</p></div>
        <div className="p-5 sm:p-6"><p className="text-[11px] text-slate-400">정시 도착 가능성</p><p className="mt-3 font-mono text-2xl font-bold text-white">{route?.onTimeProbability ?? "--"}<span className="ml-1 text-sm text-slate-500">%</span></p><p className="mt-2 text-[10px] text-slate-500">이동시간 모델의 추정치</p></div>
      </section>
      {error && <p role="alert" className="mb-5 whitespace-pre-line rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-xs leading-6 text-red-300">{error}</p>}
      {trip.routeSource === "live" && !trip.routes.some((candidate) => candidate.segments?.some((segment) => ["BUS", "SUBWAY", "EXPRESSBUS", "TRAIN", "AIRPLANE", "FERRY"].includes(segment.mode))) && <div role="status" className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-xs leading-6 text-amber-200"><strong>대중교통 경로를 받지 못해 조회에 성공한 이동 방법만 표시합니다.</strong><p className="mt-2 whitespace-pre-line">{trip.warnings?.join("\n") ?? "이 구간에 제공되는 버스·지하철 경로가 없습니다."}</p></div>}
      {trip.routeSource === "mock" && <p role="status" className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-6 text-amber-200"><strong>훈련 모드 · 예시 데이터</strong><br />가상 경로와 시간을 표시합니다. 실제 이동 안내에 사용하지 마세요.</p>}
      {trip.alert && <div role="status" className="mb-5 rounded-xl border border-[#bda4ff]/30 bg-[#bda4ff]/5 p-4 text-xs leading-6"><strong className="text-[#d8c8ff]">경로 업데이트 · {trip.alert.title}</strong><p className="text-slate-400">{trip.alert.detail}</p></div>}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="quest-eyebrow text-slate-400">CHOOSE YOUR ROUTE</p><span className="text-[10px] text-slate-500">{route?.runningSavedMinutes ? `달리기 적용 · 보행 구간 약 ${route.runningSavedMinutes.toFixed(1)}분 단축` : "경로를 누르면 지도와 행동 안내가 함께 바뀝니다"}</span></div>
      <div className="mb-6 flex gap-3 overflow-x-auto pb-2" aria-label="경로 선택">
        {trip.routes.map((option) => <button key={option.id} type="button" aria-pressed={route?.id === option.id} className="quest-tab" onClick={() => { setSelectedId(option.id); pauseReplanning(false); setFocus(undefined); setViewRevision((value) => value + 1); }}>
          <span className="mb-2 block text-[10px] font-bold">{modeLabel[option.mode ?? "MIXED"]}</span><span className="flex items-center justify-between gap-3"><strong className="font-mono text-2xl">{option.durationMinutes}<span className="ml-1 text-xs font-medium">분</span></strong><span className="text-[10px]">{option.recommended ? "추천 경로" : "대안 경로"}</span></span><span className="mt-2 block truncate text-xs font-semibold">{option.title}</span><span className="mt-1 block text-[10px] text-slate-500">{option.description}</span>{Boolean(option.runningSavedMinutes) && <span className="mt-2 flex items-center gap-1 text-[10px] text-[#bda4ff]"><Zap size={11} /> 달리기 스킬 적용</span>}
        </button>)}
      </div>
      {route?.constraintWarnings?.length ? <p className="mb-4 rounded-xl border border-amber-400/20 p-3 text-xs text-amber-300">{route.constraintWarnings.join(" ")} 아래 이동 스킬에서 가능 거리를 조정할 수 있습니다.</p> : null}
      {route && <JourneyGuide key={trip.tripId} route={route} resetRevision={guideVersion} position={position} destination={trip.destination} deadlineAt={trip.deadlineAt} now={now} isDemo={trip.routeSource === "mock"} onFocus={focusMap} onPauseReplanning={pauseReplanning}
        map={<div id="mission-map" className="scroll-mt-24 space-y-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] text-slate-500">{isRefreshing ? "현재 위치에서 다시 계산 중…" : pause ? "현재 구간 안내 중 · 위치와 도착정보 갱신" : `경로 갱신 ${new Date(trip.updatedAt).toLocaleTimeString("ko-KR", { hour12: false })}`}</p><button type="button" onClick={() => void refreshRoute()} disabled={isRefreshing} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2 py-2 text-[10px] text-slate-300"><RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} /> 현재 위치에서 재탐색</button></div>
          {locationError && <p role="status" className="rounded-xl bg-amber-400/5 p-3 text-[11px] leading-5 text-amber-300">{locationError}</p>}
          {position && <p role="status" className="text-[10px] text-slate-400">GPS 갱신 {new Date(position.timestamp).toLocaleTimeString("ko-KR", { hour12: false })} · {position.lat.toFixed(5)}, {position.lng.toFixed(5)} · 이동에 따라 포인트와 남은 보행 안내 갱신</p>}
          {trip.origin && trip.destinationCoordinate && <RouteMap origin={trip.origin} destination={trip.destinationCoordinate} position={position} route={route} focus={focus} viewRevision={viewRevision} isDemo={trip.routeSource === "mock"} className="h-[38vh] min-h-[300px] max-h-[480px]" />}
        </div>} />}
      <div className="mt-6"><UserPreferencePanel preferences={preferences} forceOpenSignal={openSignal} onApply={applyPreferences} /></div>
      {trip.warnings?.length ? <details className="mt-5 rounded-xl border border-white/10 p-4 text-xs text-slate-400"><summary className="cursor-pointer">일부 경로 정보 연결 상태</summary><ul className="mt-3 space-y-2">{trip.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
      {trip.routeSource === "mock" && <button type="button" onClick={() => void onSimulateTraffic()} disabled={isSimulating} className="quest-button-secondary mt-4">{isSimulating ? "훈련 상황 변경 중" : "훈련: 교통 정체 발생시키기"}</button>}
      <footer className="mt-8 flex flex-wrap justify-between gap-4 border-t border-white/10 pt-5 text-[10px] leading-5 text-slate-500"><span>위치 권한을 켜면 지도가 이동을 따라갑니다. 승차 중에는 하차 지점까지 현재 안내를 유지합니다.</span><button type="button" onClick={onBack} className="text-slate-400 underline underline-offset-4">새 미션 시작</button></footer>
    </main>
  </div>;
}
