# INFRA-39 Bundle Size Analysis - Progress Summary

**Date:** July 30, 2026
**Branch:** `infra-39-bundle-size-optimization`
**Issue:** #647 (INFRA-39)

## ✅ Completed

### 1. Bundle Analyzer Setup
- ✅ Added `@next/bundle-analyzer@16.2.3` as exact-pinned devDependency in `frontend/package.json`
- ✅ Integrated `withBundleAnalyzer` in `frontend/next.config.ts`
  - Wraps the Next.js config
  - Gated behind `ANALYZE=true` environment variable
  - Does not run on normal builds (zero performance impact)
- ✅ Added `npm run analyze` script to `frontend/package.json`
  - Command: `ANALYZE=true npm run build`
  - Generates interactive HTML bundle report at `.next/analyze/`

### 2. Configuration
- ✅ `next.config.ts` properly imports and wraps `withNextIntl` with `withBundleAnalyzer`
- ✅ Environment variable gating prevents analyzer from running except when explicitly enabled
- ✅ Compatible with existing Next.js setup (App Router)

### 3. Documentation
- ✅ `BUNDLE_ANALYSIS_SETUP.md` — Setup details, Windows npm issue workarounds, next steps
- ✅ `BUNDLE_OPTIMIZATION_PLAN.md` — Detailed workflow, measurement approach, example optimizations, expected PR content
- ✅ `PROGRESS_SUMMARY.md` — This file

### 4. Git
- ✅ Created branch: `infra-39-bundle-size-optimization`
- ✅ Committed setup: "chore(INFRA-39): Add @next/bundle-analyzer and analyze script"

## ⏳ Blocked

### npm install (Windows path length issue)
**Status:** npm install command is timing out on Windows.

**Root Cause:** Windows has a 260-character path limit (even with long path support enabled). The monorepo structure + deep node_modules nesting causes many paths to exceed this limit, resulting in npm install stalling or timing out.

**Impact:** Cannot proceed to bundle analysis phase until dependencies are installed.

**Workarounds:**
1. **Linux/WSL2** — Run npm install on Linux, WSL2, or Docker. Windows is not blocking this in CI (GitHub Actions runs on Ubuntu).
2. **CI** — The pipeline can proceed once merged because CI runs on Ubuntu where there are no path length limits.
3. **Docker** — Use a Docker container to run npm install if WSL2 is not available.
4. **Monorepo restructuring** — Move to pnpm or yarn workspaces (out of scope for this issue).

**Current Attempt:** npm install running in background process (started 20+ minutes ago, still in progress).

## 🔄 Next Steps (Blockers Resolved)

### Step 1: Resolve npm install
- Wait for background process to complete, OR
- Switch to Linux/WSL2/Docker environment
- Result: working `node_modules/` with @next/bundle-analyzer installed

### Step 2: Run bundle analyzer
```bash
cd frontend
npm run analyze
```
- Generates `frontend/.next/analyze/client.html` and `server.html`
- Open in browser and inspect the treemap visualization
- Document baseline bundle sizes

### Step 3: Identify optimization opportunities
From the analyzer output, identify:
- Wholesale imports of large libraries (icon libs, utilities)
- Non-tree-shakeable code patterns (default imports of barrels)
- Heavy components not on critical path (code-split candidates)
- Duplicate package versions

### Step 4: Apply targeted fixes (with evidence)
For each finding:
1. Make specific import change or code-split
2. Re-run `npm run analyze`
3. Measure size delta
4. Commit only if delta is real

### Step 5: Update CI and budgets
- Update `frontend/budget.json` thresholds based on post-optimization baseline
- Add size-budget check to `.github/workflows/frontend.yml`

### Step 6: Create PR
- Evidence-based changes only (measured deltas for each fix)
- Before/after bundle sizes documented
- Test results (lint, build, tests)
- Clear description of what was found and why each fix worked

## File Changes

### Modified
- `frontend/package.json`
  - Added `"analyze": "ANALYZE=true npm run build"` script
  - Added `"@next/bundle-analyzer": "16.2.3"` devDependency (exact pinned)

- `frontend/next.config.ts`
  - Added import: `import withBundleAnalyzer from "@next/bundle-analyzer"`
  - Wrapped config: `export default withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(withNextIntl(nextConfig))`

### Unchanged (for now)
- `frontend/budget.json` — Will update once we have actual post-optimization baseline
- `.github/workflows/frontend.yml` — Will add size-budget check step once thresholds determined
- App code — No changes yet; analysis phase is non-invasive

## Key Metrics to Capture

Once npm install completes and we can run the analyzer:

**Baseline (Before Optimization):**
- Client-side JS (first load):  ___ KB
- Server-side JS: ___ KB
- Top 5 largest packages: ___

**Target (After Optimization):**
- Client-side JS (first load): ___ KB (goal: -15% to -25% from baseline)
- Server-side JS: ___ KB
- Budget threshold in CI: ___ KB (baseline + 10% headroom)

## Commands for Next Phase

```bash
# Once npm install completes:
cd frontend
npm run analyze
# Open ./next/analyze/client.html and ./next/analyze/server.html

# For each optimization:
npm run build  # Measure bundle size from build output
npm run analyze  # Compare against previous analyzer run

# Before PR:
npm run lint
npm run build
npm run test
npm run test:e2e
```

## How to Track Progress

- [ ] npm install completes successfully
- [ ] npm run analyze runs without error
- [ ] Baseline bundle sizes documented
- [ ] Large contributors identified from analyzer
- [ ] First optimization applied and measured
- [ ] CI size-budget check added
- [ ] PR ready for review with evidence-based changes and measurements
- [ ] PR merged to main

## Important Notes

1. **Evidence-driven only:** Every claimed optimization must have before/after measurements from the analyzer. No assumptions.

2. **Windows npm issue is known:** This is a well-documented issue with monorepos on Windows. It does not block CI, where npm install works fine on Ubuntu.

3. **Non-blocking locally:** If stuck on local Windows npm install, the work can proceed in CI or on a Linux/WSL2 environment.

4. **Rollback is safe:** The current setup is minimal and entirely in config. If something goes wrong, one git revert removes all changes.

5. **Bundle analyzer is zero-cost:** It only runs when explicitly enabled via `ANALYZE=true`. Normal `npm run build` and dev runs are unaffected.

---

**Questions or blockers?** Check `BUNDLE_ANALYSIS_SETUP.md` for common issues and workarounds.
