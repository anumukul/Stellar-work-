"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { flushMetrics, reportSample } from "@/lib/metrics-client";

/**
 * Collects Core Web Vitals with native PerformanceObserver (no extra
 * dependency) and forwards them to /api/metrics for Prometheus/Grafana.
 * Renders nothing.
 */
export default function MetricsReporter() {
  const pathname = usePathname();

  // Page views — one per client-side navigation.
  useEffect(() => {
    reportSample({ type: "page_view", path: pathname });
  }, [pathname]);

  useEffect(() => {
    reportSample({ type: "session_ping" });
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        reportSample({ type: "session_ping" });
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;

    const path = pathname;
    const observers: PerformanceObserver[] = [];

    const observe = (type: string, callback: (list: PerformanceObserverEntryList) => void) => {
      try {
        const observer = new PerformanceObserver(callback);
        observer.observe({ type, buffered: true });
        observers.push(observer);
      } catch {
        // Entry type unsupported in this browser — skip that vital.
      }
    };

    // TTFB from the navigation entry.
    const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (navigation) {
      reportSample({ type: "web_vital", metric: "ttfb", value: navigation.responseStart, path });
    }

    observe("paint", (list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          reportSample({ type: "web_vital", metric: "fcp", value: entry.startTime, path });
        }
      }
    });

    // LCP fires repeatedly; the last value before unload is the real one.
    let lcp = 0;
    observe("largest-contentful-paint", (list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) lcp = last.startTime;
    });

    let cls = 0;
    observe("layout-shift", (list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
        if (entry.hadRecentInput) continue;
        cls += entry.value ?? 0;
      }
    });

    let inp = 0;
    observe("event", (list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { interactionId?: number }>) {
        if (!entry.interactionId) continue;
        inp = Math.max(inp, entry.duration);
      }
    });

    const finalize = () => {
      if (lcp > 0) reportSample({ type: "web_vital", metric: "lcp", value: lcp, path });
      if (inp > 0) reportSample({ type: "web_vital", metric: "inp", value: inp, path });
      if (cls > 0) reportSample({ type: "cls", value: cls, path });
      lcp = 0;
      inp = 0;
      cls = 0;
      flushMetrics();
    };

    // "hidden" is the only reliable end-of-session signal on mobile.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") finalize();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const observer of observers) observer.disconnect();
      finalize();
    };
  }, [pathname]);

  return null;
}
