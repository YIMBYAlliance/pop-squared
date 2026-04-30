"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DataSource, PopulationResult } from "@/lib/types";

interface UsePopulationParams {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  exponent: number;
  dataSource?: DataSource;
}

interface UsePopulationReturn {
  result: PopulationResult | null;
  loading: boolean;
  error: string | null;
}

export function usePopulation({
  lat,
  lng,
  radiusKm,
  exponent,
  dataSource,
}: UsePopulationParams): UsePopulationReturn {
  const [result, setResult] = useState<PopulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPopulation = useCallback(async () => {
    if (lat === null || lng === null) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/population", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, radiusKm, exponent, dataSource }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data: PopulationResult = await res.json();
      setResult(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [lat, lng, radiusKm, exponent, dataSource]);

  useEffect(() => {
    fetchPopulation();
    return () => abortRef.current?.abort();
  }, [fetchPopulation]);

  return { result, loading, error };
}
