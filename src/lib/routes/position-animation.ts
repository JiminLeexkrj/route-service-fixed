import { haversineDistanceMeters } from "./geometry";
import type { LocationFix } from "./types";

/** 새 GPS 표본 사이만 보간합니다. 신호가 멈추면 마커도 마지막 확인 위치에서 멈춥니다. */
export function createPositionAnimator(
  draw: (fix: LocationFix | null) => void,
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (id: number) => void,
  reducedMotion = false,
) {
  let painted: LocationFix | null = null;
  let frame: number | null = null;
  const cancel = () => { if (frame !== null) cancelFrame(frame); frame = null; };
  return {
    update(target: LocationFix | null) {
      cancel();
      const start = painted;
      if (!target || !start || reducedMotion || haversineDistanceMeters(start, target) > 250 || (start.lat === target.lat && start.lng === target.lng)) {
        painted = target; draw(target); return;
      }
      let started: number | undefined;
      const tick: FrameRequestCallback = (time) => {
        started ??= time;
        const fraction = Math.min(1, (time - started) / 650);
        const ease = fraction * (2 - fraction);
        painted = { ...target, lat: start.lat + (target.lat - start.lat) * ease, lng: start.lng + (target.lng - start.lng) * ease };
        draw(painted);
        frame = fraction < 1 ? requestFrame(tick) : null;
      };
      frame = requestFrame(tick);
    },
    destroy: cancel,
  };
}
