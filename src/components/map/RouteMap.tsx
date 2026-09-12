"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Maximize } from "lucide-react";
import { createMap, MODE_COLORS, type MapAdapter } from "./map-adapter";
import { isCoordinate } from "@/lib/routes/geometry";
import { splitProgress } from "@/lib/routes/navigation";
import { createPositionAnimator } from "@/lib/routes/position-animation";
import type { Coordinate, LocationFix, MapPath, TravelMode } from "@/lib/routes/types";

type DisplayRoute = { id?: string; mode?: TravelMode; polyline?: Coordinate[]; mapPaths?: MapPath[] };
type RouteMapProps = {
  origin: Coordinate;
  destination?: Coordinate | null;
  position?: LocationFix | null;
  route?: DisplayRoute | null;
  isDemo?: boolean;
  focus?: { coordinate: Coordinate; label: string; revision: number };
  onPickDestination?: (point: Coordinate) => void;
  className?: string;
  viewRevision?: number;
};

export function RouteMap({ origin, destination, position, route, isDemo = false, focus, onPickDestination, className = "", viewRevision }: RouteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [adapter, setAdapter] = useState<MapAdapter | null>(null);
  const [failed, setFailed] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [following, setFollowing] = useState(true);
  const [retry, setRetry] = useState(0);
  const latest = useRef({ origin, onPickDestination });
  const animator = useRef<ReturnType<typeof createPositionAnimator> | null>(null);
  latest.current = { origin, onPickDestination };

  useEffect(() => {
    let disposed = false;
    let created: MapAdapter | null = null;
    let observer: ResizeObserver | null = null;
    // StrictMode에서 늦게 끝난 이전 SDK 로딩이 새 지도를 지우지 않도록 별도 호스트를 사용합니다.
    const host = document.createElement("div");
    host.className = "absolute inset-0";
    container.current?.appendChild(host);
    setFailed(false); setTileError(false);
    void createMap(host, latest.current.origin, {
      onDrag: () => { if (!disposed) setFollowing(false); },
      onPick: (point) => { if (!disposed) latest.current.onPickDestination?.(point); },
      onTileError: () => { if (!disposed) setTileError(true); },
    }).then((map) => {
      if (disposed) { map.destroy(); host.remove(); return; }
      created = map; setAdapter(map);
      observer = new ResizeObserver(() => map.resize()); observer.observe(host);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; observer?.disconnect(); created?.destroy(); host.remove(); setAdapter(null); };
  }, [retry]);

  const paths = useMemo<MapPath[]>(() => {
    const source = route?.mapPaths?.length ? route.mapPaths : route?.polyline?.length ? [{
      mode: route.mode === "MIXED" ? "BUS" as const : route.mode ?? "WALK" as const,
      points: route.polyline,
      // 메타데이터가 없는 과거 경로를 정확한 형상으로 간주하지 않습니다.
      approximate: true,
    }] : [];
    return source.map((path) => ({ ...path, approximate: isDemo || path.approximate, points: path.points.filter(isCoordinate) }))
      .filter((path) => path.points.length > 1);
  }, [route?.mapPaths, route?.polyline, route?.mode, isDemo]);
  const progress = useMemo(() => splitProgress(paths, isDemo ? null : position), [paths, position, isDemo]);
  const fitRef = useRef(() => {});
  fitRef.current = () => adapter?.fit([origin, ...paths.flatMap((path) => path.points), ...(destination ? [destination] : [])]);

  useEffect(() => { adapter?.draw(progress); }, [adapter, progress]);
  useEffect(() => { adapter?.destination(destination ?? null); }, [adapter, destination?.lat, destination?.lng]);
  useEffect(() => {
    if (!adapter) return;
    const animation = createPositionAnimator((fix) => adapter.position(fix),
      (callback) => window.requestAnimationFrame(callback), (id) => window.cancelAnimationFrame(id),
      typeof window.requestAnimationFrame !== "function" || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
    animator.current = animation;
    return () => { animation.destroy(); animator.current = null; };
  }, [adapter]);
  useEffect(() => {
    animator.current?.update(position ?? null);
    if (following && position && !onPickDestination) adapter?.follow(position);
  }, [adapter, position, following, onPickDestination]);
  // GPS 갱신 때마다 setBounds를 호출하지 않습니다. 경로 선택 변경/전체 경로 버튼만 맞춥니다.
  const pickerCenter = onPickDestination ? `${origin.lat},${origin.lng}` : "";
  const requestedView = viewRevision ?? route?.id;
  useEffect(() => { fitRef.current(); }, [adapter, requestedView, pickerCenter]);
  const overview = useCallback(() => { setFollowing(false); fitRef.current(); }, []);
  const follow = () => { setFollowing(true); adapter?.follow(position ?? origin, true); };
  useEffect(() => {
    adapter?.checkpoint(focus?.coordinate ?? null, focus?.label ?? "");
    if (focus) { setFollowing(false); adapter?.follow(focus.coordinate, true); }
  }, [adapter, focus]);
  const hasApproximate = paths.some((path) => path.approximate);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#131823]" aria-label={onPickDestination ? "목적지 선택 지도" : "이동 경로 지도"}>
      <div className={`relative isolate min-h-80 bg-[#111722] ${className}`}>
        <div ref={container} className="absolute inset-0" />
        {(!adapter || failed) && <div role="status" className="absolute inset-0 z-[500] grid place-content-center gap-3 bg-[#111722] p-5 text-center text-sm text-slate-400">
          {failed ? "지도를 불러오지 못했습니다." : "지도를 불러오는 중…"}
          {failed && <button type="button" onClick={() => setRetry((value) => value + 1)} className="quest-button-secondary">지도 다시 불러오기</button>}
        </div>}
        {adapter && <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex items-start justify-between gap-2">
          <span className="rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-md">
            {onPickDestination ? "지도에서 목적지를 눌러 선택하세요" : following ? "현재 위치 따라가는 중" : "지도 자유롭게 보기"}
          </span>
          {!onPickDestination && <div className="pointer-events-auto flex flex-col gap-2">
            <button type="button" aria-label="현재 위치 따라가기" aria-pressed={following} onClick={follow} className="rounded-xl bg-white p-3 text-blue-600 shadow-md"><LocateFixed size={20} /></button>
            <button type="button" aria-label="전체 경로 보기" onClick={overview} className="rounded-xl bg-white p-3 text-slate-700 shadow-md"><Maximize size={20} /></button>
          </div>}
        </div>}
        {tileError && <p role="status" className="absolute bottom-9 left-3 right-14 z-[500] rounded-lg bg-white/95 px-3 py-2 text-xs text-amber-800">배경 지도 연결이 불안정합니다. 경로와 위치는 계속 표시합니다.</p>}
      </div>
      {!onPickDestination && <div className="space-y-2 px-4 py-3 text-[10px] leading-5 text-slate-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {Object.entries(MODE_COLORS).filter(([mode]) => ["WALK", "RUN", "BUS", "SUBWAY", "CAR"].includes(mode) || paths.some((path) => path.mode === mode)).map(([mode, color]) => <span key={mode} className="flex items-center gap-1.5"><i className="h-1 w-4 rounded" style={{ background: color }} />{{ WALK: "도보", RUN: "달리기", BUS: "버스", SUBWAY: "지하철", EXPRESSBUS: "고속·시외", TRAIN: "기차", AIRPLANE: "항공", FERRY: "해운", CAR: "택시" }[mode]}</span>)}
          <span className="text-slate-400">회색: 지난 구간</span>
          {position && <span className="ml-auto">위치 오차 ±{Math.round(position.accuracy)}m</span>}
        </div>
        {isDemo ? <p className="font-semibold text-amber-700">예시 경로입니다. 실제 도로·노선 안내에 사용할 수 없습니다.</p>
          : hasApproximate ? <p>점선은 도보·정류장 사이의 연결 방향입니다. 실제 보행로와 다를 수 있습니다.</p>
          : !paths.length ? <p className="text-amber-700">이 경로의 상세 선을 받지 못했습니다. 위치와 목적지만 표시합니다.</p> : null}
      </div>}
    </section>
  );
}
