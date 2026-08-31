#!/usr/bin/env node

/**
 * Bundle Size Analysis Script
 *
 * Reads the Next.js build output (.next/build-manifest.json and .next/routes-manifest.json)
 * and checks bundle sizes against per-route budgets defined in budget.json.
 *
 * Outputs:
 *   - Per-route size breakdown
 *   - Budget pass/fail for each route
 *   - A JSON report at .next/bundle-size-report.json for CI consumption
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs [--json] [--ci]
 *
 * Flags:
 *   --json   Print only JSON output (for piping to other tools)
 *   --ci     Output GitHub Actions annotations on failures
 */

import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const ciMode = args.includes("--ci");

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...msg) {
  if (!jsonOnly) console.log(...msg);
}

function warn(...msg) {
  if (!jsonOnly) console.warn(...msg);
}

async function fileSize(filePath) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

function toKB(bytes) {
  return Math.round(bytes / 1024);
}

function matchRoute(routePath, budgetPath) {
  // Exact match
  if (routePath === budgetPath) return true;
  // Dynamic segment match: /job/[id] matches /job/123
  const routeParts = routePath.split("/");
  const budgetParts = budgetPath.split("/");
  if (routeParts.length !== budgetParts.length) return false;
  return budgetParts.every(
    (part, i) => part.startsWith("[") || part === routeParts[i]
  );
}

// ── Load manifests ───────────────────────────────────────────────────────────

const buildManifestPath = path.join(root, ".next", "build-manifest.json");
const appPathsManifestPath = path.join(
  root,
  ".next",
  "server",
  "app-paths-manifest.json"
);
const budgetPath = path.join(root, "budget.json");

let buildManifest;
try {
  buildManifest = JSON.parse(await readFile(buildManifestPath, "utf8"));
} catch {
  log(
    "⚠️  build-manifest.json not found. Run `npm run build` first."
  );
  if (ciMode) {
    console.log(
      "::notice title=Bundle Size::build-manifest.json not found; bundle size check skipped"
    );
  }
  process.exit(0);
}

let budgets;
try {
  budgets = JSON.parse(await readFile(budgetPath, "utf8"));
} catch {
  log("⚠️  budget.json not found. Using default 500 KB global budget.");
  budgets = [
    {
      path: "/*",
      resourceSizes: [{ resourceType: "script", budget: 500 }],
    },
  ];
}

// ── Compute main bundle size (shared across all routes) ──────────────────────

const rootMainFiles = buildManifest.rootMainFiles ?? [];
let sharedBundleBytes = 0;
for (const file of rootMainFiles) {
  sharedBundleBytes += await fileSize(path.join(root, ".next", file));
}

// ── Compute per-page sizes ───────────────────────────────────────────────────

const pages = buildManifest.pages ?? {};
const routeReport = [];

for (const [pagePath, pageFiles] of Object.entries(pages)) {
  // Skip internal Next.js pages
  if (pagePath.startsWith("/_")) continue;

  let pageBytes = 0;
  for (const file of pageFiles) {
    pageBytes += await fileSize(path.join(root, ".next", file));
  }

  const totalBytes = sharedBundleBytes + pageBytes;
  const totalKB = toKB(totalBytes);
  const sharedKB = toKB(sharedBundleBytes);
  const pageKB = toKB(pageBytes);

  // Find matching budget (most specific first, then fall back to wildcard)
  let matchedBudget = null;
  let matchedBudgetPath = null;
  for (const b of budgets) {
    if (b.path !== "/*" && matchRoute(pagePath, b.path)) {
      matchedBudget = b;
      matchedBudgetPath = b.path;
      break;
    }
  }
  if (!matchedBudget) {
    matchedBudget = budgets.find((b) => b.path === "/*");
    matchedBudgetPath = "/*";
  }

  const scriptBudget = matchedBudget?.resourceSizes?.find(
    (r) => r.resourceType === "script"
  );
  const totalBudget = matchedBudget?.resourceSizes?.find(
    (r) => r.resourceType === "total"
  );

  const scriptLimit = scriptBudget?.budget ?? 500;
  const totalLimit = totalBudget?.budget ?? 1000;

  const scriptPass = totalKB <= scriptLimit;
  const overBudgetKB = scriptPass ? 0 : totalKB - scriptLimit;

  routeReport.push({
    route: pagePath,
    budgetPath: matchedBudgetPath,
    sharedKB,
    pageKB,
    totalKB,
    scriptBudgetKB: scriptLimit,
    totalBudgetKB: totalLimit,
    pass: scriptPass,
    overBudgetKB,
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────

const totalRoutes = routeReport.length;
const failedRoutes = routeReport.filter((r) => !r.pass);
const passedRoutes = routeReport.filter((r) => r.pass);

const report = {
  timestamp: new Date().toISOString(),
  sharedBundleKB: toKB(sharedBundleBytes),
  sharedBundleFiles: rootMainFiles.length,
  routes: routeReport,
  summary: {
    totalRoutes,
    passed: passedRoutes.length,
    failed: failedRoutes.length,
    overallPass: failedRoutes.length === 0,
  },
};

// ── Output ───────────────────────────────────────────────────────────────────

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  log("\n📦 Bundle Size Report");
  log("═".repeat(70));
  log(
    `Shared bundle: ${report.sharedBundleKB} KB (${rootMainFiles.length} chunks)`
  );
  log("─".repeat(70));
  log(
    "Route".padEnd(30) +
      "Page KB".padStart(10) +
      "Total KB".padStart(10) +
      "Budget KB".padStart(10) +
      "Status".padStart(10)
  );
  log("─".repeat(70));

  for (const r of routeReport) {
    const status = r.pass ? "✅ PASS" : `❌ +${r.overBudgetKB} KB`;
    log(
      r.route.padEnd(30) +
        String(r.pageKB).padStart(10) +
        String(r.totalKB).padStart(10) +
        String(r.scriptBudgetKB).padStart(10) +
        status.padStart(10)
    );
  }

  log("─".repeat(70));
  log(
    `\nResult: ${passedRoutes.length}/${totalRoutes} routes within budget`
  );

  if (failedRoutes.length > 0) {
    log(`\n❌ ${failedRoutes.length} route(s) exceeded their budget:`);
    for (const r of failedRoutes) {
      log(
        `  • ${r.route}: ${r.totalKB} KB (budget: ${r.scriptBudgetKB} KB, over by ${r.overBudgetKB} KB)`
      );
    }
  } else {
    log("\n✅ All routes are within their size budgets.");
  }
}

// ── CI annotations ───────────────────────────────────────────────────────────

if (ciMode) {
  for (const r of failedRoutes) {
    console.log(
      `::error title=Bundle Budget Exceeded::Route ${r.route} is ${r.totalKB} KB, exceeding the ${r.scriptBudgetKB} KB budget by ${r.overBudgetKB} KB`
    );
  }
  if (failedRoutes.length === 0) {
    console.log(
      `::notice title=Bundle Size::All ${totalRoutes} routes are within their size budgets. Shared bundle: ${report.sharedBundleKB} KB`
    );
  }
}

// ── Write report JSON ────────────────────────────────────────────────────────

const reportDir = path.join(root, ".next", "analyze");
try {
  await mkdir(reportDir, { recursive: true });
} catch {
  // directory may already exist
}
await writeFile(
  path.join(reportDir, "bundle-size-report.json"),
  JSON.stringify(report, null, 2)
);
log(`\n📄 Report saved to .next/analyze/bundle-size-report.json`);

// ── Exit code ────────────────────────────────────────────────────────────────

if (failedRoutes.length > 0) {
  process.exit(1);
}
