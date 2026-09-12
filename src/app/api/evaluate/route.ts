import { NextRequest, NextResponse } from "next/server";

import { isCoordinate } from "@/lib/routes/geometry";
import { evaluateTrip } from "@/lib/algorithm/evaluateTrip";
import type { SwitchHistory } from "@/lib/algorithm/types";
import { getRouteCandidates } from "@/lib/routes/service";
import { RouteSearchError, safeProviderMessage } from "@/lib/routes/errors";
import type { Coordinate, RouteDataMode } from "@/lib/routes/types";
import type { UserPreferences } from "@/types/trip";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

type EvaluateRequestBody = {
  origin: Coordinate;
  destination: Coordinate;
  deadline: number;
  preferences: UserPreferences;
  mode?: RouteDataMode;
  demoElapsedSeconds?: number;
  history?: SwitchHistory;
};

function validateBody(body: unknown): EvaluateRequestBody {
  const input = body as Partial<EvaluateRequestBody> | null;
  if (
    !input ||
    !isCoordinate(input.origin) ||
    !isCoordinate(input.destination) ||
    typeof input.deadline !== "number" || !Number.isFinite(input.deadline) ||
    !input.preferences || typeof input.preferences.canRun !== "boolean" || typeof input.preferences.allowTaxi !== "boolean" ||
    !Number.isFinite(input.preferences.walkingDistanceMeters) || input.preferences.walkingDistanceMeters < 0 || input.preferences.walkingDistanceMeters > 20000
  ) {
    throw new Error("origin, destination, deadline, preferences가 필요합니다.");
  }

  return {
    origin: input.origin,
    destination: input.destination,
    deadline: input.deadline,
    preferences: { canRun: input.preferences.canRun, allowTaxi: input.preferences.allowTaxi, walkingDistanceMeters: input.preferences.walkingDistanceMeters },
    mode: input.mode,
    demoElapsedSeconds: input.demoElapsedSeconds,
    history: input.history,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = validateBody(await request.json());
    const now = Date.now();

    const routesResponse = await getRouteCandidates({
      origin: body.origin,
      destination: body.destination,
      mode: body.mode,
      demoElapsedSeconds: body.demoElapsedSeconds,
      allowTaxi: body.preferences.allowTaxi,
      walkingDistanceMeters: body.preferences.walkingDistanceMeters,
    });

    const evaluation = evaluateTrip({
      now,
      deadline: body.deadline,
      rawRoutes: routesResponse.routes,
      preferences: body.preferences,
      dataMode: routesResponse.source === "mock" ? "DEMO" : "LIVE",
      history: body.history ?? { candidateStreak: 0 },
    });

    return NextResponse.json(
      {
        evaluation,
        routeSource: routesResponse.source,
        warnings: routesResponse.warnings ?? (routesResponse.fallbackReason ? [routesResponse.fallbackReason] : undefined),
        demo: routesResponse.demo,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: error instanceof RouteSearchError ? error.code : "EVALUATE_FAILED",
          message:
            error instanceof Error ? safeProviderMessage(error.message) : "평가에 실패했습니다.",
          ...(error instanceof RouteSearchError ? { details: error.details } : {}),
        },
      },
      { status: error instanceof RouteSearchError ? error.status : 400, headers: NO_STORE_HEADERS },
    );
  }
}
