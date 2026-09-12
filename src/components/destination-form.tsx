"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Copy,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  Map as MapIcon,
} from "lucide-react";
import { PreferenceControls } from "@/components/user-preference-panel";
import { RouteMap } from "@/components/map/RouteMap";
import { searchPlace } from "@/lib/routes/client";
import type { Coordinate, PlaceResult } from "@/lib/routes/types";
import { getDefaultDeadline, toDateTimeLocalValue } from "@/lib/time";
import {
  DEFAULT_PREFERENCES,
  type CurrentLocation,
  type StartTripRequest,
} from "@/types/trip";

type DestinationFormProps = {
  isLoading: boolean;
  apiError: string | null;
  onSubmit: (request: StartTripRequest) => Promise<void>;
  onResolveLocation: () => Promise<CurrentLocation>;
};

export function DestinationForm({
  isLoading,
  apiError,
  onSubmit,
  onResolveLocation,
}: DestinationFormProps) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [destination, setDestination] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minimumDeadline, setMinimumDeadline] = useState("");
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  const origin = location ? { lat: location.latitude, lng: location.longitude } : undefined;
  useEffect(() => () => searchRequest.current?.abort(), []);

  const selectPlace = (place: PlaceResult) => {
    searchRequest.current?.abort();
    searchRequest.current = null;
    setIsSearching(false);
    setSelectedPlace(place);
    setDestination(place.name);
    setPlaces([]);
    setFormError(null);
  };
  const findPlaces = async (): Promise<PlaceResult | null> => {
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setIsSearching(true); setFormError(null); setPlaces([]);
    try {
      const results = await searchPlace(destination.trim(), { origin, signal: controller.signal });
      if (controller.signal.aborted) return null;
      setPlaces(results);
      if (!results.length) setFormError("검색 결과가 없습니다. 지역명과 주소를 함께 검색하거나 지도에서 선택해 주세요.");
      if (results.length === 1) { selectPlace(results[0]); return results[0]; }
      if (results.length > 1) setFormError("아래 검색 결과에서 주소를 확인하고 목적지를 선택해 주세요.");
      return null;
    } catch (cause) {
      if (!controller.signal.aborted) setFormError(cause instanceof Error ? cause.message : "장소 검색에 실패했습니다.");
      return null;
    } finally {
      if (searchRequest.current === controller) { searchRequest.current = null; setIsSearching(false); }
    }
  };
  const pickOnMap = (point: Coordinate) => selectPlace({
    ...point, name: "지도에서 선택한 목적지", address: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`,
  });

  useEffect(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1, 0, 0);
    setMinimumDeadline(toDateTimeLocalValue(now));
    setDeadline(getDefaultDeadline());
  }, []);

  const handleLocation = async () => {
    setIsLocating(true);
    setFormError(null);
    try {
      const current = await onResolveLocation();
      setLocation(current);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "현재 위치를 확인하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!destination.trim()) {
      setFormError("목적지를 입력해 주세요.");
      return;
    }
    if (!deadline) {
      setFormError("도착해야 하는 시간을 선택해 주세요.");
      return;
    }
    if (new Date(deadline).getTime() <= Date.now()) {
      setFormError("현재 시각보다 늦은 도착시간을 선택해 주세요.");
      return;
    }

    const place = selectedPlace ?? await findPlaces();
    if (!place) return;
    await onSubmit({
      destination: place.name,
      destinationPlace: place,
      deadline,
      useCurrentLocation: Boolean(location),
      preferences,
    });
  };

  const visibleError = formError ?? apiError;
  useEffect(() => setCopyStatus(""), [visibleError]);
  const copyError = async () => {
    if (!visibleError) return;
    try {
      await navigator.clipboard.writeText(visibleError);
      setCopyStatus("오류 내용을 복사했습니다.");
    } catch {
      setCopyStatus("자동 복사를 할 수 없습니다. 위 내용을 선택해 복사하거나 화면을 캡처해 주세요.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="quest-panel relative p-5 sm:p-7">
      <div className="mb-7 flex items-center justify-between gap-3"><div><p className="quest-eyebrow text-[#bda4ff]">NEW MISSION</p><h2 className="mt-2 text-xl font-extrabold">목표를 설정하세요</h2></div><span className="rounded-lg border border-white/10 px-3 py-2 font-mono text-xs text-slate-400">01 / 02</span></div>
      <div className="space-y-5">
        <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><MapPin size={14} className="text-[#d8fa48]" /> 목적지</span>
          <input type="text" value={destination} onChange={(event) => {
            searchRequest.current?.abort(); searchRequest.current = null; setIsSearching(false);
            setDestination(event.target.value); setSelectedPlace(null); setPlaces([]); setFormError(null);
          }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void findPlaces(); } }} maxLength={80}
            placeholder="장소명, 도로명·지번 주소 또는 위도, 경도" autoComplete="off" className="quest-input" />
        </label>
        <div className="flex gap-2">
          <button type="button" disabled={isSearching || isLoading || destination.trim().length < 2} onClick={() => void findPlaces()} className="quest-button-secondary flex-1">{isSearching ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />} 목적지 검색</button>
          <button type="button" onClick={() => setMapOpen((value) => !value)} aria-expanded={mapOpen} className="quest-button-secondary flex-1"><MapIcon size={15} /> 지도에서 선택</button>
        </div>
        {places.length > 1 && <ul aria-label="목적지 검색 결과" className="max-h-64 divide-y divide-white/10 overflow-auto rounded-xl border border-white/15">
          {places.map((place, index) => <li key={`${place.lat},${place.lng},${index}`}><button type="button" onClick={() => selectPlace(place)} className="w-full px-4 py-3 text-left transition hover:bg-white/5 focus:bg-white/5"><span className="block text-sm font-bold text-white">{place.name}</span><span className="mt-1 block text-xs text-slate-400">{place.address}</span></button></li>)}
        </ul>}
        {selectedPlace && <div role="status" className="rounded-xl border border-[#d8fa48]/20 bg-[#d8fa48]/5 p-3 text-xs text-[#d8fa48]"><strong className="flex items-center gap-2"><CheckCircle2 size={14} /> 선택한 목적지: {selectedPlace.name}</strong><span className="mt-1 block pl-5 text-slate-400">{selectedPlace.address}</span></div>}
        {mapOpen && <RouteMap origin={origin ?? selectedPlace ?? { lat: 37.5665, lng: 126.978 }} destination={selectedPlace} onPickDestination={pickOnMap} className="h-80" />}
        <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><CalendarClock size={14} className="text-[#bda4ff]" /> 도착 마감시간</span><input type="datetime-local" value={deadline} min={minimumDeadline} onChange={(event) => setDeadline(event.target.value)} className="quest-input" /></label>
        <button type="button" onClick={() => void handleLocation()} disabled={isLocating} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-white/25">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#d8fa48]/10 text-[#d8fa48]">{isLocating ? <LoaderCircle size={17} className="animate-spin" /> : <LocateFixed size={17} />}</span>
          <span className="min-w-0 flex-1"><span className="block text-xs font-bold">{location ? "현재 위치 확인 완료" : "현재 위치 사용"}</span><span className="mt-1 block truncate text-[11px] text-slate-400">{location?.label ?? "출발 지점을 확인해 주세요"}</span></span><ArrowRight size={15} className="shrink-0 text-slate-500" />
        </button>
        <div className="border-t border-white/10 pt-5"><p className="mb-3 font-mono text-[10px] tracking-widest text-slate-500">CHOOSE YOUR SKILLS</p><PreferenceControls value={preferences} onChange={setPreferences} /></div>
      </div>
      {visibleError && <div role="alert" className="mt-4 rounded-lg border border-red-300/15 bg-red-400/10 p-3 text-xs leading-5 text-red-200">
        <p className="whitespace-pre-line break-words">{visibleError}</p>
        {apiError && !formError && <button type="button" onClick={() => void copyError()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200/20 px-3 py-2 text-[11px] hover:bg-white/5"><Copy size={13} /> 오류 내용 복사</button>}
        {copyStatus && <p role="status" className="mt-2 text-[11px] text-slate-300">{copyStatus}</p>}
      </div>}
      <button type="submit" disabled={isLoading || isSearching || isLocating || !deadline} className="quest-button mt-6 h-14 w-full text-base">{isLoading ? <><LoaderCircle size={18} className="animate-spin" /> 미션 경로 계산 중</> : <><Navigation size={18} /> 길찾기 시작 <span className="ml-auto font-mono text-[10px] opacity-60">START →</span></>}</button>
    </form>
  );
}
