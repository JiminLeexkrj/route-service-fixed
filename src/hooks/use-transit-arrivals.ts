"use client";
import { useCallback, useEffect, useState } from "react";
import type { JourneySegment } from "@/lib/routes/types";
import { arrivalQuery, arrivalSearchParams, type ArrivalResponse, type TimetableDay } from "@/lib/transit/types";

export function useTransitArrivals(segment: JourneySegment | undefined, kind: "realtime" | "schedule" = "realtime", day: TimetableDay = "auto", isDemo = false) {
  const query = segment ? arrivalQuery(segment, kind, day) : null;
  const key = query ? arrivalSearchParams(query).toString() : "";
  const [state, setState] = useState<{ key: string; data: ArrivalResponse | null; loading: boolean }>({ key: "", data: null, loading: false });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!key || isDemo) return;
    let disposed = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (disposed || controller || document.visibilityState === "hidden") return;
      controller = new AbortController();
      setState((previous) => ({ key, data: previous.key === key ? previous.data : null, loading: true }));
      try {
        const response = await fetch(`/api/transit?${key}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        if (!response.ok) throw new Error("조회 실패");
        const data = await response.json() as ArrivalResponse;
        if (!disposed) setState({ key, data, loading: false });
      } catch {
        if (!disposed) setState({ key, loading: false, data: { status: "error", source: "", fetchedAt: Date.now(), departures: [], message: "도착정보를 불러오지 못했습니다. 새로고침해 주세요." } });
      } finally { controller = null; }
    };
    void load();
    const onVisible = () => { if (document.visibilityState !== "hidden") void load(); };
    const timer = kind === "realtime" ? window.setInterval(() => void load(), 30_000) : undefined;
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; controller?.abort(); if (timer) window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [key, kind, isDemo, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { data: state.key === key ? state.data : null, loading: Boolean(key) && !isDemo && (state.key !== key || state.loading), refresh };
}
