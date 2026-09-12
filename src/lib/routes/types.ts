export type Coordinate = {
  lat: number;
  lng: number;
};

export type LocationFix = Coordinate & {
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
};

export type MapPath = {
  mode: SegmentMode;
  segmentIndex?: number;
  points: Coordinate[];
  /** 정류장 연결선/도보 연결선/데모는 실제 도로 형상이 아닙니다. */
  approximate?: boolean;
  label?: string;
};

export type TravelMode = "WALK" | "BUS" | "SUBWAY" | "EXPRESSBUS" | "TRAIN" | "AIRPLANE" | "FERRY" | "CAR" | "MIXED";

export type SegmentMode = Exclude<TravelMode, "MIXED"> | "RUN";

export type TransitStop = { id?: string; name: string; coordinate?: Coordinate };
export type TransitInfo = {
  provider?: "TMAP";
  service?: boolean;
  stationId?: string;
  endStationId?: string;
  cityCode?: number;
  stationProviderCode?: number;
  arsId?: string;
  localStationId?: string;
  lineId?: string;
  localLineId?: string;
  lineCode?: number;
  direction?: string;
  directionCode?: 1 | 2;
  nextStopName?: string;
  stationCount?: number;
  stops?: TransitStop[];
  fastTransfer?: string;
  startExit?: string;
  endExit?: string;
  intervalMinutes?: number;
  alternatives?: { name: string; id?: string }[];
};

export type PlaceResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export type RouteSegment = {
  mode: SegmentMode;
  from: string;
  to: string;
  durationMinutes: number;
  distanceMeters?: number;
  routeName?: string;
  fromCoordinate?: Coordinate;
  toCoordinate?: Coordinate;
  transit?: TransitInfo;
  steps?: WalkingStep[];
  /** 실내 환승 구간은 달리기 후보에서 제외합니다. */
  walkingEnvironment?: "OUTDOOR" | "INDOOR" | "UNKNOWN";
};

export type WalkingStep = { description: string; distanceMeters?: number; points: Coordinate[] };

export type JourneySegment = Omit<RouteSegment, "mode"> & {
  id: string;
  sourceIndex?: number;
  mode: SegmentMode | "TAXI";
  walkingDurationMinutes?: number;
  savedMinutes?: number;
};

export type RouteProvider = "TMAP_TRANSIT" | "TMAP_WALK" | "KAKAO_MOBILITY" | "MOCK";

export type RawRoute = {
  id: string;
  mode: TravelMode;
  durationMinutes: number;
  distanceMeters: number;
  estimatedArrivalTime: string;
  fare?: number;
  segments: RouteSegment[];

  /** 지도 표시용 확장 필드. 3번 개발자는 무시해도 됩니다. */
  polyline?: Coordinate[];
  mapPaths?: MapPath[];
  /** 데이터 출처를 추적하기 위한 확장 필드. */
  provider?: RouteProvider;
  /** 현재 교통정보가 반영된 데이터인지 나타냅니다. */
  isRealtime?: boolean;
  fetchedAt?: string;
};

export type RouteDataMode = "auto" | "live" | "demo";
export type RouteDataSource = "live" | "mock";

export type DemoScenario = "NORMAL" | "CONGESTED";

export type DemoMetadata = {
  scenario: DemoScenario;
  elapsedSeconds: number;
  congestionAtSeconds: number;
  message: string;
};

export type RoutesResponse = {
  routes: RawRoute[];
  generatedAt: string;
  source: RouteDataSource;
  providers: RouteProvider[];
  warnings?: string[];
  fallbackReason?: string;
  demo?: DemoMetadata;
};

export type PlacesResponse = {
  places: PlaceResult[];
  generatedAt: string;
  source: "live" | "mock";
  provider: "KAKAO_LOCAL" | "MOCK" | "COORDINATE";
  fallbackReason?: string;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
};
