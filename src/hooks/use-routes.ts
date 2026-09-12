"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getRoutes, refreshRoutes } from "@/lib/routes/client";
import type {
  Coordinate,
  RouteDataMode,
  RoutesResponse,
} from "@/lib/routes/types";

type UseRoutesOptions = {
  origin: Coordinate | null;
  destination: Coordinate | null;
  mode?: RouteDataMode;
  enabled?: boolean;
  refreshEveryMs?: number;
};

export function useRoutes({
  origin,
  destination,
  mode = "auto",
  enabled = true,
  refreshEveryMs = 0,
}: UseRoutesOptions) {
  const [data, setData] = useState<RoutesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const demoStartedAtRef = useRef(Date.now());
  const requestSequenceRef = useRef(0);

  const execute = useCallback(
    async (refresh: boolean) => {
      if (!origin || !destination) return null;

      const sequence = ++requestSequenceRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const demoElapsedSeconds = Math.floor(
          (Date.now() - demoStartedAtRef.current) / 1_000,
        );
        const result = refresh
          ? await refreshRoutes(origin, destination, {
              mode,
              demoElapsedSeconds,
            })
          : await getRoutes(origin, destination, {
              mode,
              demoElapsedSeconds,
            });

        if (sequence === requestSequenceRef.current) {
          setData(result);
        }
        return result;
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : "경로 조회에 실패했습니다.";
        if (sequence === requestSequenceRef.current) {
          setError(message);
        }
        return null;
      } finally {
        if (sequence === requestSequenceRef.current) {
          setIsLoading(false);
        }
      }
    },
    [destination, mode, origin],
  );

  const refresh = useCallback(() => execute(true), [execute]);

  useEffect(() => {
    demoStartedAtRef.current = Date.now();
    setData(null);
    if (enabled && origin && destination) {
      void execute(false);
    }
  }, [destination, enabled, execute, origin]);

  useEffect(() => {
    if (!enabled || !origin || !destination || refreshEveryMs <= 0) return;

    const intervalId = window.setInterval(() => {
      void refresh();
    }, refreshEveryMs);

    return () => window.clearInterval(intervalId);
  }, [destination, enabled, origin, refresh, refreshEveryMs]);

  return {
    data,
    routes: data?.routes ?? [],
    error,
    isLoading,
    refresh,
  };
}
