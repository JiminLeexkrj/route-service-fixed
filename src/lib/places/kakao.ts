import { isCoordinate } from "@/lib/routes/geometry";
import type { Coordinate, PlaceResult } from "@/lib/routes/types";

type LocalDocument = {
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  road_address?: { address_name?: string; building_name?: string } | null;
  x?: string;
  y?: string;
};

export async function searchKakaoPlaces(keyword: string, origin?: Coordinate): Promise<PlaceResult[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("장소 검색 연결이 설정되지 않았습니다. 지도에서 목적지를 선택하거나 위도, 경도를 입력해 주세요.");
  }

  async function search(kind: "keyword" | "address") {
    const params = new URLSearchParams({ query: keyword, size: "10" });
    // 동명 장소를 거리순으로 자동 선택하지 않고 관련도순 후보를 제공합니다.
    if (kind === "keyword" && origin) {
      params.set("x", String(origin.lng));
      params.set("y", String(origin.lat));
    }
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/${kind}.json?${params}`, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) {
      throw new Error(`장소 검색 서비스에 연결하지 못했습니다 (${response.status}). 잠시 후 다시 검색하거나 지도에서 선택해 주세요.`);
    }
    const data = await response.json() as { documents?: LocalDocument[] };
    return (data.documents ?? []).flatMap((doc): PlaceResult[] => {
      if (!doc.x?.trim() || !doc.y?.trim()) return [];
      const point = { lat: Number(doc.y), lng: Number(doc.x) };
      if (!isCoordinate(point)) return [];
      const address = doc.road_address_name || doc.road_address?.address_name || doc.address_name || keyword;
      return [{ ...point, name: doc.place_name || doc.road_address?.building_name || address, address }];
    });
  }

  const results = await Promise.allSettled([search("keyword"), search("address")]);
  const places = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!places.length) {
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
  const unique = new Map<string, PlaceResult>();
  for (const place of places) {
    const key = `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, place);
  }
  return [...unique.values()].slice(0, 10);
}
