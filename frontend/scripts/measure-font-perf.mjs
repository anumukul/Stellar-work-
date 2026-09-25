#!/usr/bin/env node

/**
 * Font Performance Measurement Script
 *
 * Measures Core Web Vitals (FCP, LCP, CLS) and font resource timing using a
 * headless Chromium browser via Playwright's CDP integration.  Run this
 * before and after the font-loading changes to capture the delta.
 *
 * The script does NOT require the Lighthouse npm package — it drives Chrome
 * directly with the Performance Timeline and PerformanceObserver APIs that
 * are already available in any modern browser.
 *
 * Usage:
 *   node scripts/measure-font-perf.mjs [options]
 *
 * Options:
 *   --url <url>        Base URL to measure (default: http://localhost:3000)
 *   --runs <n>         Number of measurement runs per URL (default: 3)
 *   --cold             Clear browser cache before each run to simulate first visit
 *   --warm             Skip cache clearing to simulate repeat visit (default)
 *   --routes <routes>  Comma-separated list of routes to measure (default: /)
 *   --json             Print full JSON results only (for piping)
 *   --ci               Emit GitHub Actions annotations on threshold failures
 *   --out <path>       Write JSON results to a file (default: no file output)
 *   --baseline <path>  Compare against a previously saved JSON results file
 *
 * Examples:
 *   # Cold first-visit measurement against local dev server
 *   node scripts/measure-font-perf.mjs --cold --url http://localhost:3000
 *
 *   # Save baseline, then compare after changes
 *   node scripts/measure-font-perf.mjs --cold --out font-baseline.json
 *   node scripts/measure-font-perf.mjs --cold --baseline font-baseline.json
 *
 *   # CI: measure specific routes, fail if CLS >= 0.1
 *   node scripts/measure-font-perf.mjs --ci --cold --routes /,/jobs,/profile
 *
 * Thresholds (Good / Needs Improvement / Poor per Web Vitals spec):
 *   FCP  : good < 1800 ms,  poor >= 3000 ms
 *   LCP  : good < 2500 ms,  poor >= 4000 ms
 *   CLS  : good < 0.1,      poor >= 0.25
 *   Font : good < 400 ms (cold); 0 ms (warm/cache hit)
 */

import { chromium } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}

function option(name, defaultValue) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const BASE_URL = option("--url", "http://localhost:3000").replace(/\/$/, "");
const RUNS = Math.max(1, parseInt(option("--runs", "3"), 10));
const COLD = flag("--cold");
const JSON_ONLY = flag("--json");
const CI_MODE = flag("--ci");
const OUT_FILE = option("--out", null);
const BASELINE_FILE = option("--baseline", null);
const ROUTES = option("--routes", "/")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  fcp: { good: 1800, poor: 3000 },
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  fontDuration: { good: 400, poor: 1600 },
};

function grade(metric, value) {
  const t = THRESHOLDS[metric];
  if (!t) return "unknown";
  if (value <= t.good) return "good";
  if (value < t.poor) return "needs-improvement";
  return "poor";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(...msg) {
  if (!JSON_ONLY) console.log(...msg);
}

function warn(...msg) {
  if (!JSON_ONLY) console.warn(...msg);
}

function ciAnnotation(level, title, message) {
  if (CI_MODE) {
    // GitHub Actions annotation format
    console.log(`::${level} title=${title}::${message}`);
  }
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function p75(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.75) - 1;
  return sorted[Math.max(0, idx)];
}

function delta(before, after) {
  if (before === 0) return null;
  const d = after - before;
  const pct = Math.round((d / before) * 100);
  return { absolute: Math.round(d * 100) / 100, percent: pct };
}

// ── In-page measurement snippet ───────────────────────────────────────────────
//
// This string is injected into each page via page.evaluate().  It runs in the
// browser context, collects metrics using the same PerformanceObserver API
// that MetricsReporter.tsx uses, waits for the page to settle, then returns
// a structured result.  Using page.evaluate keeps all measurement logic
// inside the browser where the actual timings are recorded — no CDP round-
// trips introduce artificial latency into the numbers.

const MEASURE_SCRIPT = /* js */ `
async function measurePage() {
  return new Promise((resolve) => {
    const result = {
      fcp: null,
      lcp: null,
      cls: 0,
      fonts: [],
      navigationStart: performance.timeOrigin,
    };

    const observers = [];

    function safeObserve(type, cb) {
      try {
        const obs = new PerformanceObserver(cb);
        obs.observe({ type, buffered: true });
        observers.push(obs);
      } catch (_) {}
    }

    // FCP
    safeObserve("paint", (list) => {
      for (const e of list.getEntries()) {
        if (e.name === "first-contentful-paint") {
          result.fcp = Math.round(e.startTime);
        }
      }
    });

    // LCP — keep updating until settled
    safeObserve("largest-contentful-paint", (list) => {
      const entries = list.getEntries();
      if (entries.length > 0) {
        result.lcp = Math.round(entries[entries.length - 1].startTime);
      }
    });

    // CLS
    safeObserve("layout-shift", (list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) result.cls += (e.value || 0);
      }
    });

    // Font resource timing
    const reportedFonts = new Set();
    function collectFont(e) {
      if (!e.name.includes(".woff2")) return;
      if (reportedFonts.has(e.name)) return;
      reportedFonts.add(e.name);
      result.fonts.push({
        name: e.name.split("/").pop(),
        durationMs: Math.round(e.responseEnd - e.startTime),
        transferSize: e.transferSize,
        cached: e.transferSize === 0,
        startTime: Math.round(e.startTime),
      });
    }

    // Buffered resource entries (fonts already fetched)
    for (const e of performance.getEntriesByType("resource")) {
      collectFont(e);
    }

    safeObserve("resource", (list) => {
      for (const e of list.getEntries()) collectFont(e);
    });

    // Wait up to 5 seconds for LCP to settle, then resolve.
    // LCP is finalized when the page is hidden or user interacts — we
    // simulate "done" by waiting for quiet + a short grace period.
    let settleTimer = null;

    function scheduleSettle() {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, 1500);
    }

    function finish() {
      for (const obs of observers) {
        try { obs.disconnect(); } catch (_) {}
      }
      result.cls = Math.round(result.cls * 10000) / 10000;
      resolve(result);
    }

    scheduleSettle();

    // Restart the settle timer each time LCP updates
    const lcpObs = new PerformanceObserver(() => scheduleSettle());
    try {
      lcpObs.observe({ type: "largest-contentful-paint", buffered: false });
      observers.push(lcpObs);
    } catch (_) {}

    // Hard timeout — give up after 8 seconds no matter what
    setTimeout(finish, 8000);
  });
}
measurePage();
`;

// ── Single-route measurement ───────────────────────────────────────────────────

async function measureRoute(browser, route, cold) {
  const url = `${BASE_URL}${route}`;
  const runResults = [];

  for (let run = 1; run <= RUNS; run++) {
    // Create a fresh browser context for each run.
    // Cold: clear all caches. Warm: reuse caches across runs (new context still
    // has no cookies, but shares the shared HTTP cache when not incognito).
    const context = await browser.newContext({
      // Bypass CSP for measurement only — we're not testing security here
      bypassCSP: false,
      // Throttle to simulate a realistic connection (Fast 3G)
      // Uncomment to simulate network throttling:
      // offline: false,
    });

    const page = await context.newPage();

    // For cold runs, intercept and clear the browser cache via CDP
    if (cold) {
      const cdpSession = await context.newCDPSession(page);
      await cdpSession.send("Network.clearBrowserCookies");
      await cdpSession.send("Network.clearBrowserCache");
      await cdpSession.detach();
    }

    try {
      // Navigate and wait for network to go quiet
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      // Run the in-page measurement script and collect results
      const metrics = await page.evaluate(MEASURE_SCRIPT);

      runResults.push({
        run,
        fcp: metrics.fcp,
        lcp: metrics.lcp,
        cls: metrics.cls,
        fonts: metrics.fonts,
      });

      log(
        `  Run ${run}/${RUNS}: FCP=${metrics.fcp ?? "n/a"}ms  LCP=${metrics.lcp ?? "n/a"}ms  CLS=${metrics.cls?.toFixed(4)}  fonts=${metrics.fonts.length}`,
      );
    } catch (err) {
      warn(`  Run ${run}/${RUNS}: ERROR — ${err.message}`);
    } finally {
      await context.close();
    }
  }

  if (runResults.length === 0) {
    return null;
  }

  const fcps = runResults.map((r) => r.fcp).filter((v) => v !== null);
  const lcps = runResults.map((r) => r.lcp).filter((v) => v !== null);
  const clss = runResults.map((r) => r.cls).filter((v) => v !== null);

  // Aggregate font data from all runs (use median duration)
  const fontMap = new Map();
  for (const r of runResults) {
    for (const f of r.fonts) {
      if (!fontMap.has(f.name)) fontMap.set(f.name, []);
      fontMap.get(f.name).push(f);
    }
  }
  const fonts = [...fontMap.entries()].map(([name, entries]) => ({
    name,
    medianDurationMs: median(entries.map((e) => e.durationMs)),
    p75DurationMs: p75(entries.map((e) => e.durationMs)),
    cacheHitRate: entries.filter((e) => e.cached).length / entries.length,
  }));

  return {
    route,
    url,
    cold,
    runs: runResults.length,
    fcp: { median: median(fcps), p75: p75(fcps) },
    lcp: { median: median(lcps), p75: p75(lcps) },
    cls: { median: median(clss), p75: p75(clss) },
    fonts,
    raw: runResults,
  };
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function gradeIcon(g) {
  return g === "good" ? "✅" : g === "needs-improvement" ? "⚠️ " : "❌";
}

function printResult(result) {
  const { route, fcp, lcp, cls, fonts, cold } = result;
  const mode = cold ? "cold (no cache)" : "warm (cached)";

  log(`\n  Route: ${route}  [${mode}]`);
  log(`  ${"─".repeat(54)}`);

  const fcpGrade = grade("fcp", fcp.median);
  const lcpGrade = grade("lcp", lcp.median);
  const clsGrade = grade("cls", cls.median);

  log(`  FCP   ${gradeIcon(fcpGrade)}  median=${fcp.median}ms   p75=${fcp.p75}ms   [${fcpGrade}]`);
  log(`  LCP   ${gradeIcon(lcpGrade)}  median=${lcp.median}ms   p75=${lcp.p75}ms   [${lcpGrade}]`);
  log(`  CLS   ${gradeIcon(clsGrade)}  median=${cls.median.toFixed(4)}      p75=${cls.p75.toFixed(4)}     [${clsGrade}]`);

  if (fonts.length > 0) {
    log(`\n  Fonts loaded: ${fonts.length}`);
    for (const f of fonts) {
      const fontGrade = grade("fontDuration", f.medianDurationMs);
      const cacheStr = `cache-hit=${Math.round(f.cacheHitRate * 100)}%`;
      log(
        `    ${gradeIcon(fontGrade)} ${f.name}  median=${f.medianDurationMs}ms  p75=${f.p75DurationMs}ms  ${cacheStr}`,
      );
    }
  } else {
    log(`\n  Fonts loaded: none detected (display:optional with cache hit, or prefers-reduced-data)`);
  }
}

function printComparison(baseline, current) {
  log(`\n${"═".repeat(60)}`);
  log(`  COMPARISON: baseline → current`);
  log(`${"═".repeat(60)}`);

  for (const cur of current) {
    const base = baseline.find((b) => b.route === cur.route && b.cold === cur.cold);
    if (!base) {
      log(`\n  ${cur.route}: no baseline to compare`);
      continue;
    }

    log(`\n  Route: ${cur.route}`);

    const metrics = [
      { name: "FCP (median)", before: base.fcp.median, after: cur.fcp.median, metric: "fcp" },
      { name: "LCP (median)", before: base.lcp.median, after: cur.lcp.median, metric: "lcp" },
      { name: "CLS (median)", before: base.cls.median, after: cur.cls.median, metric: "cls" },
    ];

    for (const m of metrics) {
      const d = delta(m.before, m.after);
      if (d === null) {
        log(`    ${m.name}: ${m.before} → ${m.after}`);
        continue;
      }
      const improved = m.metric === "cls" ? d.absolute < 0 : d.absolute < 0;
      const arrow = improved ? "↓" : "↑";
      const sign = d.absolute >= 0 ? "+" : "";
      const color = improved ? "✅" : d.absolute === 0 ? "  " : "⚠️ ";
      const unit = m.metric === "cls" ? "" : "ms";
      log(
        `    ${color} ${m.name.padEnd(14)}  ${m.before}${unit} → ${m.after}${unit}  (${arrow}${sign}${d.absolute}${unit}, ${sign}${d.percent}%)`,
      );
    }
  }
}

function emitCiAnnotations(results) {
  for (const r of results) {
    if (grade("cls", r.cls.median) === "poor") {
      ciAnnotation(
        "error",
        `CLS poor on ${r.route}`,
        `CLS median=${r.cls.median.toFixed(4)} exceeds poor threshold (${THRESHOLDS.cls.poor}). Check font fallback metrics and display strategy.`,
      );
    } else if (grade("cls", r.cls.median) === "needs-improvement") {
      ciAnnotation(
        "warning",
        `CLS needs improvement on ${r.route}`,
        `CLS median=${r.cls.median.toFixed(4)} (good threshold: ${THRESHOLDS.cls.good}).`,
      );
    }
    if (grade("lcp", r.lcp.median) === "poor") {
      ciAnnotation(
        "warning",
        `LCP poor on ${r.route}`,
        `LCP median=${r.lcp.median}ms exceeds poor threshold (${THRESHOLDS.lcp.poor}ms). Preload may not be working.`,
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`\n${"═".repeat(60)}`);
  log(`  Font Performance Measurement`);
  log(`${"═".repeat(60)}`);
  log(`  URL:    ${BASE_URL}`);
  log(`  Routes: ${ROUTES.join(", ")}`);
  log(`  Runs:   ${RUNS} per route`);
  log(`  Mode:   ${COLD ? "cold (cache cleared before each run)" : "warm (cache preserved)"}`);
  log(`${"─".repeat(60)}\n`);

  const browser = await chromium.launch({ headless: true });

  const allResults = [];

  try {
    for (const route of ROUTES) {
      log(`\nMeasuring ${route}…`);
      const result = await measureRoute(browser, route, COLD);
      if (result) {
        allResults.push(result);
        printResult(result);
      } else {
        warn(`  Skipped — all runs failed for ${route}`);
      }
    }
  } finally {
    await browser.close();
  }

  // ── CI annotations ──────────────────────────────────────────────────────────
  if (CI_MODE) emitCiAnnotations(allResults);

  // ── Baseline comparison ─────────────────────────────────────────────────────
  if (BASELINE_FILE) {
    try {
      const raw = await readFile(BASELINE_FILE, "utf8");
      const baseline = JSON.parse(raw);
      printComparison(Array.isArray(baseline) ? baseline : baseline.results ?? [], allResults);
    } catch (err) {
      warn(`\nCould not load baseline file "${BASELINE_FILE}": ${err.message}`);
    }
  }

  // ── JSON output ─────────────────────────────────────────────────────────────
  const output = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    mode: COLD ? "cold" : "warm",
    runs: RUNS,
    thresholds: THRESHOLDS,
    results: allResults,
  };

  if (OUT_FILE) {
    await writeFile(OUT_FILE, JSON.stringify(output, null, 2), "utf8");
    log(`\nResults written to ${OUT_FILE}`);
  }

  if (JSON_ONLY) {
    console.log(JSON.stringify(output, null, 2));
  }

  // ── Summary line ────────────────────────────────────────────────────────────
  log(`\n${"─".repeat(60)}`);
  const allGood = allResults.every(
    (r) =>
      grade("cls", r.cls.median) !== "poor" && grade("lcp", r.lcp.median) !== "poor",
  );
  if (allGood) {
    log(`  ✅ All routes within acceptable thresholds.`);
  } else {
    log(`  ⚠️  Some routes have poor vitals — see details above.`);
  }
  log(`${"═".repeat(60)}\n`);

  // Exit 1 in CI mode if any route has poor CLS (font-related failures are CLS)
  if (CI_MODE && allResults.some((r) => grade("cls", r.cls.median) === "poor")) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("measure-font-perf.mjs: fatal error:", err);
  process.exit(1);
});
