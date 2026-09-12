"use client";
import { Flag, Footprints, Route, TrainFront, Zap } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { DestinationForm } from "@/components/destination-form";
import type { CurrentLocation, StartTripRequest } from "@/types/trip";

type Props = { isLoading: boolean; error: string | null; onStart: (request: StartTripRequest) => Promise<void>; onResolveLocation: () => Promise<CurrentLocation> };
export function LandingPage({ isLoading, error, onStart, onResolveLocation }: Props) {
  return <div className="quest-shell min-h-screen">
    <AppHeader />
    <main className="mx-auto max-w-7xl px-5 pb-12 sm:px-8">
      <section className="grid items-center gap-10 py-9 sm:py-14 lg:grid-cols-[1.04fr_1fr] lg:gap-16 lg:py-16">
        <div className="min-w-0 animate-fade-up">
          <p className="quest-eyebrow mb-5"><span className="mr-2 inline-block h-1.5 w-1.5 bg-[#d8fa48]" /> EVERY SECOND COUNTS</p>
          <h1 className="text-[2.9rem] font-black leading-[1.13] tracking-[-0.065em] sm:text-6xl lg:text-[4.5rem]">오늘의 미션,<br /><span className="text-[#d8fa48]">제시간에 도착.</span></h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-slate-400 sm:text-base">버스를 탈까, 지하철로 갈아탈까, 조금 뛰어볼까?<br className="hidden sm:block" /> 목표 시간을 정하고 지금 할 일을 하나씩 클리어하세요.</p>
          <div className="quest-route-art relative mt-9 hidden overflow-hidden rounded-3xl border border-white/10 p-6 sm:block" aria-label="미션 순서: 이동, 환승, 도착">
            <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-slate-500"><span>YOUR NEXT ADVENTURE</span><span className="text-[#bda4ff]">READY?</span></div>
            <div className="relative mt-9 flex items-center justify-between gap-3">
              <span className="absolute inset-x-8 top-7 border-t border-dashed border-[#d8fa48]/35" />
              {[{ Icon: Footprints, label: "이동", num: "01" }, { Icon: TrainFront, label: "환승", num: "02" }, { Icon: Flag, label: "도착", num: "03" }].map(({ Icon, label, num }) => <div key={num} className="relative flex flex-col items-center gap-3"><span className={`grid h-14 w-14 place-items-center rounded-2xl border ${num === "03" ? "border-[#d8fa48] bg-[#d8fa48] text-slate-950 shadow-[0_0_30px_#d8fa4820]" : "border-white/20 bg-[#171d29] text-[#bda4ff]"}`}><Icon size={24} /></span><span className="text-xs text-slate-300"><span className="mr-2 font-mono text-slate-500">{num}</span>{label}</span></div>)}
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-3 text-[11px] text-slate-400"><span className="flex items-center gap-1.5"><Route size={13} className="text-[#d8fa48]" /> 내 위치 따라가는 지도</span><span className="flex items-center gap-1.5"><TrainFront size={13} className="text-[#bda4ff]" /> 구간별 승하차 안내</span><span className="flex items-center gap-1.5"><Zap size={13} className="text-[#d8fa48]" /> 달리기 조합</span></div>
        </div>
        <DestinationForm isLoading={isLoading} apiError={error} onSubmit={onStart} onResolveLocation={onResolveLocation} />
      </section>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-white/10 pt-6 text-[11px] text-slate-500"><span>현실의 이동을, 하나의 퀘스트로.</span><span>목표를 향해. 신호는 지키면서.</span></footer>
    </main>
  </div>;
}
