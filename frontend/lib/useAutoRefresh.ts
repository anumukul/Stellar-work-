"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAutoRefreshOptions {
  /** Milliseconds between automatic fetches. Default: 30 000. */
  interval?: number;
  /** Pause polling while the browser tab is hidden. Default: true. */
  pauseWhenHidden?: boolean;
  /** Master switch; set to false to disable all polling. Default: true. */
  enabled?: boolean;
}

export interface UseAutoRefreshResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
  /** Trigger an immediate fetch without waiting for the next interval. */
  refresh: () => void;
}

/**
 * Polls `fetchFn` on a configurable interval and pauses automatically
 * when the browser tab is hidden (#444 — auto-refresh with polling).
 */
export function useAutoRefresh<T>(
  fetchFn: () => Promise<T>,
  options: UseAutoRefreshOptions = {},
): UseAutoRefreshResult<T> {
  const { interval = 30_000, pauseWhenHidden = true, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Keep fetchFn stable so effects don't re-run when it's recreated each render
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const inFlight = useRef(false);

  const doFetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFnRef.current();
      setData(result);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!enabled) return;
    void doFetch();
  }, [enabled, doFetch]);

  // Interval polling
  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) return;
      void doFetch();
    }, interval);

    return () => clearInterval(id);
  }, [enabled, interval, pauseWhenHidden, doFetch]);

  // Re-fetch immediately when a hidden tab becomes visible
  useEffect(() => {
    if (!enabled || !pauseWhenHidden || typeof document === "undefined") return;

    const onVisibilityChange = () => {
      if (!document.hidden) void doFetch();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled, pauseWhenHidden, doFetch]);

  return { data, loading, error, lastRefreshed, refresh: doFetch };
}
