"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { flushMetrics, reportSample } from "@/lib/metrics-client";

/**
 * Collects Core Web Vitals with native PerformanceObserver (no extra
 * dependency) and forwards them to /api/metrics for Prometheus/Grafana.
 * Also captures font resource timing to measure the effect of the
 * preloading and display strategy changes.
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

  // ── Font resource timing ──────────────────────────────────────────────────
  // Reports how long each woff2 file took to fetch and whether it was a cache
  // hit.  This lets us verify the display:"optional" + preload strategy is
  // working: on first visit fonts should take some ms; on repeat visits
  // durationMs should be ~0 and cached should be true.
  //
  // We read buffered entries at mount time (fonts are usually already fetched
  // by then because of the preload link) and also subscribe to any stragglers
  // via PerformanceObserver.  The Set deduplicates in case both paths fire for
  // the same URL.
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;

    const path = pathname;
    const reported = new Set<string>();

    function reportFontEntry(entry: PerformanceResourceTiming) {
      // Only woff2 files that Next.js self-hosts (URL contains /static/media/)
      if (!entry.name.includes(".woff2")) return;
      if (reported.has(entry.name)) return;
      reported.add(entry.name);

      const durationMs = Math.round(entry.responseEnd - entry.startTime);
      // transferSize is 0 for disk-cache and memory-cache hits.
      const cached = entry.transferSize === 0;
      // Use only the filename part of the URL to avoid storing full paths.
      const name = entry.name.split("/").pop() ?? entry.name;

      reportSample({ type: "font_timing", name, durationMs, cached, path });
    }

    // Read any already-buffered resource entries (covers fonts fetched before
    // this component mounted, which is the common case with preload).
    for (const entry of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      reportFontEntry(entry);
    }

    // Also observe any fonts that finish loading after mount (rare, but
    // happens on very slow connections or when the optional period expires
    // before the woff2 arrives and the browser retries for next navigation).
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
          reportFontEntry(entry);
        }
      });
      observer.observe({ type: "resource", buffered: false });
    } catch {
      // PerformanceObserver with type "resource" not supported — ignore.
    }

    return () => {
      observer?.disconnect();
    };
  // Only run on initial page load — font timing is a per-load metric.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core Web Vitals ───────────────────────────────────────────────────────
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
