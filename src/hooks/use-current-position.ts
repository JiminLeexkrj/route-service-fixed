"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getCurrentPosition,
  watchCurrentPosition,
} from "@/lib/location/geolocation";
import type { Coordinate } from "@/lib/routes/types";

type UseCurrentPositionOptions = {
  watch?: boolean;
  autoStart?: boolean;
};

export function useCurrentPosition({
  watch = false,
  autoStart = true,
}: UseCurrentPositionOptions = {}) {
  const [position, setPosition] = useState<Coordinate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(autoStart);

  const requestPosition = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const coordinate = await getCurrentPosition();
      setPosition(coordinate);
      return coordinate;
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "현재 위치를 가져오지 못했습니다.";
      setError(message);
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoStart) return;

    if (!watch) {
      void requestPosition().catch(() => undefined);
      return;
    }

    setIsLoading(true);
    const stopWatching = watchCurrentPosition(
      (coordinate) => {
        setPosition(coordinate);
        setError(null);
        setIsLoading(false);
      },
      (watchError) => {
        setError(watchError.message || "현재 위치 추적에 실패했습니다.");
        setIsLoading(false);
      },
    );

    return stopWatching;
  }, [autoStart, requestPosition, watch]);

  return {
    position,
    error,
    isLoading,
    requestPosition,
    setPosition,
  };
}

