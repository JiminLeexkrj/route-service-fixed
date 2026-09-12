"use client";
import { Settings2, Timer, Zap } from "lucide-react";
export function AppHeader({ compact = false, onOpenPreferences }: { compact?: boolean; onOpenPreferences?: () => void }) {
  return <header className={`z-40 border-b border-white/10 bg-[#0b0e15]/90 backdrop-blur-xl ${compact ? "sticky top-0" : "relative"}`}>
    <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
      <div className="flex items-center gap-3" aria-label="제시간 · 타임 퀘스트">
        <div className="flex h-10 w-10 -rotate-6 items-center justify-center rounded-xl bg-[#d8fa48] text-[#11150b]"><Timer size={23} strokeWidth={2.6} /></div>
        <div><span className="text-xl font-black tracking-tight text-white">제시간<span className="text-[#d8fa48]">.</span></span><p className="mt-0.5 font-mono text-[9px] tracking-[0.2em] text-slate-400">TIME QUEST</p></div>
      </div>
      {compact ? <button type="button" onClick={onOpenPreferences} className="quest-button-secondary"><Settings2 size={16} /><span className="text-xs">이동 스킬</span></button>
        : <span className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-[11px] font-semibold text-slate-300"><Zap size={13} className="text-[#d8fa48]" /> 정시 도착 챌린지</span>}
    </div>
  </header>;
}
