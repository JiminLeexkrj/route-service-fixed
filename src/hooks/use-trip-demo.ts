"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { locationErrorMessage, watchCurrentPosition } from "@/lib/location/geolocation";
import { isFreshFix, shouldReplan } from "@/lib/routes/navigation";
import { routeErrorMessage } from "@/lib/routes/client";
import type { LocationFix } from "@/lib/routes/types";
import { tripService } from "@/services/trip-service";
import type { CurrentLocation, StartTripRequest, TripSnapshot, UserPreferences } from "@/types/trip";

export function useTripDemo() {
  const [trip, setTrip] = useState<TripSnapshot | null>(null);
  const [position, setPosition] = useState<LocationFix | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const tripRef = useRef<TripSnapshot | null>(null);
  const fixRef = useRef<LocationFix | null>(null);
  const accurateFixRef = useRef<LocationFix | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const lastAttempt = useRef(0);
  const retryAfter = useRef(0);
  const replanningPaused = useRef(false);

  const resolveCurrentLocation = useCallback(async (): Promise<CurrentLocation> => {
    return tripService.getCurrentLocation();
  }, []);

  const startTrip = useCallback(async (request: StartTripRequest) => {
    const token = ++generation.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsStarting(true);
    setError(null);
    try {
      const snapshot = await tripService.startTrip(request, controller.signal);
      if (generation.current !== token) { tripService.endTrip(snapshot.tripId); return; }
      tripRef.current = snapshot;
      fixRef.current = snapshot.locationFix ?? null;
      accurateFixRef.current = snapshot.locationFix && snapshot.locationFix.accuracy <= 100 ? snapshot.locationFix : null;
      lastAttempt.current = Date.now();
      retryAfter.current = 0;
      setPosition(fixRef.current);
      setTrip(snapshot);
    } catch (cause) {
      if (!controller.signal.aborted) setError(routeErrorMessage(cause, "길찾기를 시작하지 못했습니다."));
    } finally {
      if (generation.current === token) { setIsStarting(false); requestRef.current = null; }
    }
  }, []);

  const refresh = useCallback(async (simulate = false) => {
    const current = tripRef.current;
    if (!current || requestRef.current) return false;
    const token = generation.current;
    const controller = new AbortController();
    requestRef.current = controller;
    lastAttempt.current = Date.now();
    setIsRefreshing(true);
    setIsSimulating(simulate);
    try {
      const fix = accurateFixRef.current;
      const options = { signal: controller.signal, origin: fix && isFreshFix(fix) ? { lat: fix.lat, lng: fix.lng } : current.origin };
      const next = simulate
        ? await tripService.simulateTrafficEvent(current.tripId, options)
        : await tripService.getTripSnapshot(current.tripId, options);
      if (generation.current !== token || controller.signal.aborted) return false;
      tripRef.current = next;
      setTrip(next);
      setError(null);
      retryAfter.current = 0;
      return true;
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === token) {
        retryAfter.current = Date.now() + 60_000;
        setError(`경로 갱신 실패 · 이전 경로를 유지합니다.\n${routeErrorMessage(cause, "잠시 후 다시 시도합니다.")}`);
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsRefreshing(false);
        setIsSimulating(false);
      }
    }
  }, []);

  const tripId = trip?.tripId;
  useEffect(() => {
    if (!tripId) return;
    const stop = watchCurrentPosition((fix) => {
      if (!isFreshFix(fix, fixRef.current)) return;
      fixRef.current = fix;
      setPosition(fix);
      if (fix.accuracy <= 100) accurateFixRef.current = fix;
      setLocationError(fix.accuracy > 100 ? "위치 오차가 커서 경로 재탐색에는 마지막으로 정확했던 위치를 사용합니다." : null);
    }, (cause) => setLocationError(locationErrorMessage(cause)));

    const tick = () => {
      const current = tripRef.current;
      if (!current || requestRef.current || replanningPaused.current || Date.now() < retryAfter.current || document.visibilityState === "hidden") return;
      const latest = fixRef.current;
      if (latest && !isFreshFix(latest)) setLocationError("위치 신호가 오래되었습니다. 마지막 확인 위치를 표시하고 있습니다.");
      const route = current.routes.find((item) => item.recommended);
      if (shouldReplan({ now: Date.now(), lastAttempt: lastAttempt.current,
        intervalSeconds: current.reevaluateInSeconds ?? 30, evaluatedOrigin: current.origin,
        fix: accurateFixRef.current, paths: route?.mapPaths })) void refresh();
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { stop(); window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [tripId, refresh]);

  const savePreferences = useCallback(async (preferences: UserPreferences) => {
    const current = tripRef.current;
    if (!current) return;
    // 이전 조건의 응답이 새 조건을 덮어쓰지 않게 취소 후 동일한 갱신 통로를 사용합니다.
    requestRef.current?.abort();
    requestRef.current = null;
    await tripService.savePreferences(current.tripId, preferences);
    const applied = await refresh();
    if (!applied) throw new Error("설정 변경 후 경로를 계산하지 못했습니다. 다시 시도해 주세요.");
  }, [refresh]);

  const pauseReplanning = useCallback((pause: boolean) => {
    replanningPaused.current = pause;
    if (pause) requestRef.current?.abort();
  }, []);

  const resetTrip = useCallback(() => {
    replanningPaused.current = false;
    retryAfter.current = 0;
    ++generation.current;
    requestRef.current?.abort();
    requestRef.current = null;
    if (tripRef.current) tripService.endTrip(tripRef.current.tripId);
    tripRef.current = null;
    fixRef.current = accurateFixRef.current = null;
    setTrip(null); setPosition(null); setError(null); setLocationError(null);
    setIsRefreshing(false); setIsSimulating(false); setIsStarting(false);
  }, []);

  useEffect(() => () => {
    ++generation.current;
    requestRef.current?.abort();
    if (tripRef.current) tripService.endTrip(tripRef.current.tripId);
  }, []);

  return {
    trip, position, error, locationError, isStarting, isRefreshing, isSimulating,
    resolveCurrentLocation, startTrip, savePreferences, resetTrip, pauseReplanning,
    simulateTrafficEvent: async () => { await refresh(true); }, refreshNow: async () => { await refresh(); },
  };
}
