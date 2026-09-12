import type { Coordinate, JourneySegment, LocationFix, MapPath, PlaceResult, TravelMode } from "@/lib/routes/types";

export type RiskLevel = "SAFE" | "CAUTION" | "DANGER" | "LATE";

export type RouteOption = {
  id: string;
  title: string;
  description: string;
  arrivalTime: string;
  durationMinutes: number;
  onTimeProbability: number;
  extraCost: number;
  recommended: boolean;
  mode?: TravelMode;
  polyline?: Coordinate[];
  mapPaths?: MapPath[];
  segments?: JourneySegment[];
  arrivalAt?: number;
  runningSavedMinutes?: number;
  constraintWarnings?: string[];
};

export type TripStatus = {
  currentTime: string;
  deadline: string;
  expectedArrival: string;
  onTimeProbability: number;
  riskLevel: RiskLevel;
  recommendedAction: string;
};

export type UserPreferences = {
  walkingDistanceMeters: number;
  canRun: boolean;
  allowTaxi: boolean;
};

export type CurrentLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

export type StartTripRequest = {
  destination: string;
  destinationPlace?: PlaceResult;
  deadline: string;
  useCurrentLocation: boolean;
  preferences: UserPreferences;
};

export type TrafficAlert = {
  id: string;
  title: string;
  detail: string;
  suggestion: string;
  previousArrival: string;
  newArrival: string;
  occurredAt: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
};

export type TripSnapshot = {
  tripId: string;
  originLabel: string;
  destination: string;
  status: TripStatus;
  routes: RouteOption[];
  alert: TrafficAlert | null;
  updatedAt: string;
  origin?: Coordinate;
  destinationCoordinate?: Coordinate;
  locationFix?: LocationFix;
  routeSource?: "live" | "mock";
  warnings?: string[];
  reevaluateInSeconds?: number;
  deadlineAt?: number;
  startedAt?: number;
  preferences?: UserPreferences;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  walkingDistanceMeters: 800,
  canRun: false,
  allowTaxi: true,
};
