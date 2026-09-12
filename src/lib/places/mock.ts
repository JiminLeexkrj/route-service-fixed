import type { PlaceResult } from "@/lib/routes/types";

const MOCK_PLACES: PlaceResult[] = [
  {
    name: "서울역",
    address: "서울특별시 용산구 한강대로 405",
    lat: 37.5546788,
    lng: 126.9706069,
  },
  {
    name: "고려대학교 서울캠퍼스",
    address: "서울특별시 성북구 안암로 145",
    lat: 37.5893876,
    lng: 127.0324773,
  },
  {
    name: "강남역",
    address: "서울특별시 강남구 강남대로 396",
    lat: 37.497952,
    lng: 127.027619,
  },
  {
    name: "서울시청",
    address: "서울특별시 중구 세종대로 110",
    lat: 37.5666103,
    lng: 126.9783882,
  },
];

export function searchMockPlaces(keyword: string): PlaceResult[] {
  const normalized = keyword.replaceAll(" ", "").toLowerCase();

  return MOCK_PLACES.filter((place) => {
    const searchable = `${place.name}${place.address}`
      .replaceAll(" ", "")
      .toLowerCase();
    return searchable.includes(normalized) || normalized.includes(place.name.replaceAll(" ", "").toLowerCase());
  }).slice(0, 5);
}

