import type { Coordinate, LocationFix } from "@/lib/routes/types";
import type { DrawPath } from "@/lib/routes/navigation";

export const MODE_COLORS = { WALK: "#94a3b8", RUN: "#a855f7", BUS: "#16a34a", SUBWAY: "#2563eb", EXPRESSBUS: "#0d9488", TRAIN: "#6366f1", AIRPLANE: "#0284c7", FERRY: "#0891b2", CAR: "#ea580c" };
export type MapAdapter = {
  provider: "Kakao" | "OpenStreetMap";
  draw(paths: DrawPath[]): void;
  position(fix: LocationFix | null): void;
  destination(point: Coordinate | null): void;
  checkpoint(point: Coordinate | null, label: string): void;
  fit(points: Coordinate[]): void;
  follow(point: Coordinate, zoomIn?: boolean): void;
  resize(): void;
  destroy(): void;
};
type MapEvents = { onDrag: () => void; onPick?: (point: Coordinate) => void; onTileError: () => void };

function badge(label: string, color: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "route-map-badge";
  element.style.background = color;
  element.textContent = label;
  return element;
}
function userBadge(fix: LocationFix): HTMLDivElement {
  const element = badge("현재 위치", "#1d4ed8");
  element.classList.add("route-user-point");
  const dot = document.createElement("span"); dot.className = "route-user-dot"; element.prepend(dot);
  if (fix.heading !== null) {
    const arrow = document.createElement("span");
    arrow.textContent = "▲";
    arrow.className = "route-heading";
    arrow.style.transform = `rotate(${fix.heading}deg)`;
    element.prepend(arrow);
  }
  return element;
}

let sdkPromise: Promise<void> | null = null;
function loadKakao(key: string): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("지도 로딩 시간 초과")), 10_000);
    const ready = () => {
      if (!window.kakao?.maps) { window.clearTimeout(timer); reject(new Error("지도 로딩 실패")); return; }
      window.kakao.maps.load(() => { window.clearTimeout(timer); resolve(); });
    };
    if (window.kakao?.maps) { ready(); return; }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.onload = ready;
    script.onerror = () => { window.clearTimeout(timer); script.remove(); reject(new Error("지도 연결 실패")); };
    document.head.appendChild(script);
  }).catch((error) => { sdkPromise = null; throw error; });
  return sdkPromise;
}

export async function createMap(container: HTMLDivElement, center: Coordinate, events: MapEvents): Promise<MapAdapter> {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY?.trim();
  if (key) {
    try { await loadKakao(key); return createKakaoMap(container, center, events); }
    catch { container.replaceChildren(); }
  }
  return createLeafletMap(container, center, events);
}

function createKakaoMap(container: HTMLDivElement, center: Coordinate, events: MapEvents): MapAdapter {
  const maps = window.kakao!.maps;
  const point = (value: Coordinate) => new maps.LatLng(value.lat, value.lng);
  const map = new maps.Map(container, { center: point(center), level: 5 });
  let routeLayers: { setMap(map: kakao.maps.Map | null): void }[] = [];
  let user: kakao.maps.CustomOverlay | null = null;
  let userVisible = false;
  let userHeading: number | null | undefined;
  let accuracy: kakao.maps.Circle | null = null;
  let destination: kakao.maps.CustomOverlay | null = null;
  let checkpoint: kakao.maps.CustomOverlay | null = null;
  const pick = (event: { latLng: kakao.maps.LatLng }) => events.onPick?.({ lat: event.latLng.getLat(), lng: event.latLng.getLng() });
  maps.event.addListener(map, "dragstart", events.onDrag);
  maps.event.addListener(map, "click", pick);
  return {
    provider: "Kakao",
    draw(paths) {
      routeLayers.forEach((layer) => layer.setMap(null));
      routeLayers = [];
      paths.forEach((path) => {
        if (path.points.length < 2) return;
        const options = { map, path: path.points.map(point), strokeWeight: 7, strokeOpacity: 1, strokeStyle: path.approximate ? "shortdash" : "solid" };
        routeLayers.push(new maps.Polyline({ ...options, strokeColor: "#ffffff", strokeWeight: 11 }));
        routeLayers.push(new maps.Polyline({ ...options, strokeColor: path.traveled ? "#a8b4c4" : MODE_COLORS[path.mode] }));
        if (!path.traveled && path.mode !== "WALK" && path.label) routeLayers.push(new maps.CustomOverlay({
          map, position: point(path.points[0]), content: badge(path.label, MODE_COLORS[path.mode]), yAnchor: 1.8, zIndex: 2,
        }));
      });
    },
    position(fix) {
      if (!fix) { user?.setMap(null); accuracy?.setMap(null); userVisible = false; return; }
      if (!user) user = new maps.CustomOverlay({ map, position: point(fix), content: userBadge(fix), yAnchor: 1.2, zIndex: 5 });
      if (!userVisible) user.setMap(map);
      user.setPosition(point(fix));
      if (userHeading !== fix.heading) user.setContent(userBadge(fix));
      userHeading = fix.heading;
      if (!accuracy) accuracy = new maps.Circle({ map, center: point(fix), radius: fix.accuracy, strokeWeight: 1, strokeColor: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.12 });
      if (!userVisible) accuracy.setMap(map);
      accuracy.setPosition(point(fix)); accuracy.setRadius(fix.accuracy); userVisible = true;
    },
    destination(value) {
      if (!value) { destination?.setMap(null); return; }
      if (!destination) destination = new maps.CustomOverlay({ map, position: point(value), content: badge("목적지", "#dc2626"), yAnchor: 1.3, zIndex: 4 });
      destination.setPosition(point(value)); destination.setMap(map);
    },
    checkpoint(value, label) {
      if (!value) { checkpoint?.setMap(null); return; }
      if (!checkpoint) checkpoint = new maps.CustomOverlay({ map, position: point(value), content: badge(label, "#7c3aed"), yAnchor: 1.4, zIndex: 6 });
      checkpoint.setPosition(point(value)); checkpoint.setContent(badge(label, "#7c3aed")); checkpoint.setMap(map);
    },
    fit(points) {
      if (!points.length) return;
      const bounds = new maps.LatLngBounds(); points.forEach((value) => bounds.extend(point(value)));
      map.setBounds(bounds, 70, 50, 70, 50);
    },
    follow(value, zoomIn = false) { if (zoomIn) map.setLevel(4); map.panTo(point(value)); },
    resize() { map.relayout(); },
    destroy() {
      maps.event.removeListener(map, "dragstart", events.onDrag); maps.event.removeListener(map, "click", pick);
      routeLayers.forEach((layer) => layer.setMap(null)); user?.setMap(null); accuracy?.setMap(null); destination?.setMap(null); checkpoint?.setMap(null);
      container.replaceChildren();
    },
  };
}

async function createLeafletMap(container: HTMLDivElement, center: Coordinate, events: MapEvents): Promise<MapAdapter> {
  const L = await import("leaflet");
  const ll = (point: Coordinate): [number, number] => [point.lat, point.lng];
  const map = L.map(container, { zoomControl: false }).setView(ll(center), 15);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).on("tileerror", events.onTileError).addTo(map);
  const routeLayers = L.layerGroup().addTo(map);
  let user: import("leaflet").Marker | null = null;
  let userHeading: number | null | undefined;
  let accuracy: import("leaflet").Circle | null = null;
  let destination: import("leaflet").Marker | null = null;
  let checkpoint: import("leaflet").Marker | null = null;
  const icon = (html: HTMLElement) => L.divIcon({ html, className: "route-map-icon", iconSize: [0, 0] });
  map.on("dragstart", events.onDrag);
  map.on("click", (event) => events.onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng }));
  return {
    provider: "OpenStreetMap",
    draw(paths) {
      routeLayers.clearLayers();
      paths.forEach((path) => {
        if (path.points.length < 2) return;
        const points = path.points.map(ll);
        const options = { weight: 7, opacity: 1, dashArray: path.approximate ? "9 9" : undefined, lineCap: "round" as const };
        L.polyline(points, { ...options, color: "white", weight: 11 }).addTo(routeLayers);
        L.polyline(points, { ...options, color: path.traveled ? "#a8b4c4" : MODE_COLORS[path.mode] }).addTo(routeLayers);
        if (!path.traveled && path.mode !== "WALK" && path.label) L.marker(points[0], {
          icon: icon(badge(path.label, MODE_COLORS[path.mode])), interactive: false,
        }).addTo(routeLayers);
      });
    },
    position(fix) {
      if (!fix) { user?.remove(); accuracy?.remove(); return; }
      if (!user) user = L.marker(ll(fix), { icon: icon(userBadge(fix)), zIndexOffset: 1000, title: "현재 위치" });
      user.setLatLng(ll(fix)).addTo(map);
      if (userHeading !== fix.heading) user.setIcon(icon(userBadge(fix)));
      userHeading = fix.heading;
      if (!accuracy) accuracy = L.circle(ll(fix), { radius: fix.accuracy, weight: 1, color: "#3b82f6", fillOpacity: 0.12 });
      accuracy.setLatLng(ll(fix)).setRadius(fix.accuracy).addTo(map);
    },
    destination(value) {
      if (!value) { destination?.remove(); return; }
      if (!destination) destination = L.marker(ll(value), { icon: icon(badge("목적지", "#dc2626")), title: "목적지", zIndexOffset: 900 });
      destination.setLatLng(ll(value)).addTo(map);
    },
    checkpoint(value, label) {
      if (!value) { checkpoint?.remove(); return; }
      if (!checkpoint) checkpoint = L.marker(ll(value), { icon: icon(badge(label, "#7c3aed")), zIndexOffset: 1200 });
      checkpoint.setLatLng(ll(value)).setIcon(icon(badge(label, "#7c3aed"))).addTo(map);
    },
    fit(points) { if (points.length) map.fitBounds(L.latLngBounds(points.map(ll)), { padding: [60, 65], maxZoom: 17 }); },
    follow(value, zoomIn = false) { if (zoomIn) map.setView(ll(value), 16); else map.panTo(ll(value), { animate: true, duration: 0.5 }); },
    resize() { map.invalidateSize({ pan: false }); },
    destroy() { map.remove(); },
  };
}
