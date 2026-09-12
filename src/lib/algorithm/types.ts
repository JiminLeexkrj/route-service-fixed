import type { Coordinate, MapPath, RawRoute, RouteSegment, SegmentMode, TravelMode } from "@/lib/routes/types";
import type { RiskLevel, UserPreferences } from "@/types/trip";

// RawRoute의 SegmentMode(WALK|BUS|SUBWAY|CAR)와 달리 RUN/TAXI를 분리한다 (문서 §4).
export type AlgoSegmentMode = SegmentMode | "TAXI";

export type TimeDistribution = {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  variance: number;
  confidence: number;
};

export type RealtimeRouteSegment = Omit<RouteSegment, "mode" | "durationMinutes"> & {
  id: string;
  mode: AlgoSegmentMode;
  from: string;
  to: string;
  routeName?: string;
  travelTime: TimeDistribution;
  distanceMeters?: number;
  boardProbability: number;
  transferSuccessProbability: number;
  realtimeConfidence: number;
  isRoadDependent: boolean;
  walkingDurationMinutes?: number;
  savedMinutes?: number;
};

export type RoutePolicy = {
  id: string;
  label: string;
  sourceRouteId: string;
  mode: TravelMode;
  polyline?: Coordinate[];
  mapPaths?: MapPath[];
  segments: RealtimeRouteSegment[];
  extraCost: number;
  walkingMinutes: number;
  walkingMeters: number;
  transferCount: number;
  usesTaxi: boolean;
  fallbackPolicyId?: string;
};

export type PolicyForecast = {
  arrivalP10: number;
  arrivalP50: number;
  arrivalP90: number;
  onTimeProbability: number;
  expectedLateMinutes: number;
  severeLateProbability: number;
  strandingProbability: number;
  forecastConfidence: number;
};

export type PolicyEvaluation = {
  policy: RoutePolicy;
  forecast: PolicyForecast;
  riskLevel: RiskLevel;
  rejectedReasons: string[];
};

export type Action = {
  type: "KEEP" | "SWITCH" | "PREPARE_TAXI" | "WALK_FASTER";
  description: string;
};

export type Recommendation = {
  policyId: string;
  action: Action;
  reason: string;
  executeBy: number;
  expectedArrivalP50: number;
  expectedArrivalP90: number;
  onTimeProbability: number;
  confidence: number;
  fallbackAction?: Action;
  reevaluateInSeconds: number;
};

export type DataMode = "LIVE" | "PARTIAL_LIVE" | "SCHEDULE_ONLY" | "DEMO";

export type TripEvaluation = {
  history?: SwitchHistory;
  evaluatedAt: number;
  deadline: number;
  dataMode: DataMode;
  currentPolicyId?: string;
  recommendedPolicyId: string;
  shouldSwitch: boolean;
  switchReason?: string;
  recommendation: Recommendation;
  policies: PolicyEvaluation[];
};

export type SwitchHistory = {
  currentPolicyId?: string;
  candidatePolicyId?: string;
  candidateStreak: number;
  lastSwitchAt?: number;
};

export type EvaluationInput = {
  now: number;
  deadline: number;
  rawRoutes: RawRoute[];
  preferences: UserPreferences;
  dataMode: DataMode;
  history: SwitchHistory;
};
