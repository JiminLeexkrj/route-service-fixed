import { NextRequest, NextResponse } from "next/server";

import { parseRouteQuery, QueryValidationError } from "@/lib/http/query";
import { getRouteCandidates } from "@/lib/routes/service";
import { RouteSearchError, safeProviderMessage } from "@/lib/routes/errors";
import type { ApiErrorResponse, RoutesResponse } from "@/lib/routes/types";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(
  request: NextRequest,
): Promise<NextResponse<RoutesResponse | ApiErrorResponse>> {
  try {
    const query = parseRouteQuery(request.nextUrl.searchParams);
    const result = await getRouteCandidates(query);

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof QueryValidationError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_QUERY",
            message: error.message,
            details: error.details,
          },
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: error instanceof RouteSearchError ? error.code : "ROUTE_PROVIDER_FAILED",
          message:
            error instanceof Error
              ? safeProviderMessage(error.message)
              : "경로 provider 호출에 실패했습니다.",
          ...(error instanceof RouteSearchError ? { details: error.details } : {}),
        },
      },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
