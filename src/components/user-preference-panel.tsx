"use client";
import { useEffect, useRef, useState } from "react";
import { CarTaxiFront, Check, ChevronDown, Footprints, LoaderCircle, Settings2, Zap } from "lucide-react";
import type { UserPreferences } from "@/types/trip";

export function PreferenceControls({ value, onChange }: { value: UserPreferences; onChange: (value: UserPreferences) => void }) {
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {[{ key: "canRun" as const, label: "뛰기 가능", note: "보행 구간에 달리기 추가", icon: Zap },
        { key: "allowTaxi" as const, label: "택시 허용", note: "택시 경로도 함께 비교", icon: CarTaxiFront }].map(({ key, label, note, icon: Icon }) =>
        <button key={key} type="button" role="switch" aria-checked={value[key]} aria-label={label} onClick={() => onChange({ ...value, [key]: !value[key] })}
          className={`skill-tile ${value[key] ? "skill-tile-active" : ""}`}>
          <span className="flex items-center justify-between"><Icon size={20} /><span className="font-mono text-[10px]">{value[key] ? "ON" : "OFF"}</span></span>
          <strong className="mt-3 block text-sm">{label}</strong><span className="mt-1 block text-[11px] text-slate-400">{note}</span>
        </button>)}
    </div>
    <label className="block text-xs text-slate-300">
      <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Footprints size={14} /> 도보·달리기 가능 거리</span><strong className="font-mono text-[#d8fa48]">{value.walkingDistanceMeters >= 1000 ? `${(value.walkingDistanceMeters / 1000).toFixed(1)}km` : `${value.walkingDistanceMeters}m`}</strong></span>
      <input type="range" min={100} max={5000} step={100} value={value.walkingDistanceMeters} onChange={(event) => onChange({ ...value, walkingDistanceMeters: Number(event.target.value) })} className="range-control mt-3 w-full" />
    </label>
    {value.canRun && <p className="text-[11px] leading-5 text-slate-400">대중교통 경로의 야외 보행 구간에 시속 8km 달리기를 적용합니다. 실내 환승은 걸어서, 신호는 지키며 이동하세요.</p>}
  </div>;
}

export function UserPreferencePanel({ preferences, forceOpenSignal, onApply }: { preferences: UserPreferences; forceOpenSignal: number; onApply: (preferences: UserPreferences) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => setDraft(preferences), [preferences]);
  useEffect(() => {
    if (forceOpenSignal > 0) { setOpen(true); panel.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }
  }, [forceOpenSignal]);
  const apply = async () => {
    setSaving(true); setMessage("");
    try { await onApply(draft); setMessage("이동 스킬을 적용했습니다."); }
    catch { setMessage("설정을 반영하지 못했습니다. 다시 시도해 주세요."); }
    finally { setSaving(false); }
  };
  return <section ref={panel} id="preferences" className="quest-panel scroll-mt-24">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-5 text-left">
      <Settings2 className="text-[#bda4ff]" size={20} /><span className="flex-1"><strong className="block text-sm">이동 스킬 설정</strong><span className="text-xs text-slate-400">걷기·달리기·택시 조합을 변경해요</span></span><ChevronDown size={17} className={open ? "rotate-180" : ""} />
    </button>
    {open && <div className="border-t border-white/10 p-5"><PreferenceControls value={draft} onChange={setDraft} />
      <button type="button" onClick={() => void apply()} disabled={saving} className="quest-button mt-5 w-full">{saving ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={17} />} {saving ? "경로 다시 계산 중" : "이 스킬로 다시 계산"}</button>
      {message && <p role="status" className="mt-3 text-xs text-slate-300">{message}</p>}
    </div>}
  </section>;
}
