# Bundle Optimization Plan (INFRA-39)

This document outlines the complete workflow for analyzing and optimizing the frontend bundle size, including the expected PR flow and measurement approach.

## Workflow Overview

```
1. Setup ✅ (DONE)
   └─ Add @next/bundle-analyzer + analyze script
   
2. Analyze 🔄 (IN PROGRESS - blocked on npm install)
   └─ Run npm run analyze
   └─ Document baseline bundle sizes
   
3. Optimize
   └─ For each large contributor found:
      - Apply specific fix (import change or code-split)
      - Re-run npm run analyze
      - Measure and document size delta
   
4. CI Integration
   └─ Update budget.json with post-optimization baselines
   └─ Add size-budget check to .github/workflows/frontend.yml
   
5. PR & Documentation
   └─ Create PR with evidence-based changes only
   └─ Include before/after measurements
```

## Current Status

**Branch:** `infra-39-bundle-size-optimization`

**Completed:**
- ✅ Added @next/bundle-analyzer@16.2.3 to devDependencies (exact pinned version)
- ✅ Integrated withBundleAnalyzer into next.config.ts (gated behind ANALYZE=true env var)
- ✅ Added `npm run analyze` script

**Blocked on:**
- ⏳ npm install (timing out on Windows; running in background or on Linux/CI recommended)

**Next Steps:**
1. Resolve npm install
2. Run `npm run analyze` and capture baseline bundle sizes
3. Identify large contributors from analyzer output
4. Apply targeted fixes with before/after measurements
5. Update CI and budgets
6. Create PR with complete documentation

## Measurement Approach

### Baseline Capture

Run after npm install completes:
```bash
cd frontend
npm run analyze
```

Open the generated HTML reports and note these metrics:
- **Client-side first-load JS** (main, _app, etc. - the critical initial bundle)
- **Server-side JS** (if applicable to your use case)
- **Per-route JS** (for any heavily-used routes)
- **Largest packages by size** (from the treemap visualization)

**Document this as "Before Optimization" baseline.**

Example output to capture:
```
Baseline Bundle Sizes (Before Optimization):
- Client-side JS (first load): 485 KB
- Per-route peak: 125 KB (admin section)
- Server-side JS: 220 KB

Top 5 Largest Dependencies:
1. @ledgerhq/hw-transport-webhid: 95 KB
2. @walletconnect/web3wallet: 78 KB
3. storybook (bundled in dev): 65 KB (should be devDependency only)
4. prosemirror-view: 52 KB
5. @tiptap/react: 48 KB
```

### Per-Fix Measurement

For each optimization:
1. Make the specific change to imports/code-splitting
2. Re-run `npm run analyze`
3. Capture the new size(s)
4. Calculate delta: `Before - After = Savings`
5. Document in the commit message or PR

**Only include fixes where actual savings are measurable.** If re-running the analyzer shows no change, don't commit that fix.

Example commit message:
```
fix: Convert lucide-react icons to named imports

- Analyzer baseline: 485 KB client JS
- After this change: 425 KB client JS
- Savings: 60 KB (12% reduction)

Previously imported entire lucide-react library on icon-heavy pages.
Changed to named imports in icon barrel exports, allowing tree-shaking
of unused icons. Verified with: npm run analyze
```

## Example Optimizations (Hypothetical)

These are *examples* of what might be found — **only apply if the analyzer shows real impact:**

### Example 1: Wholesale Library Import
**Finding:** Icon library imported entirely even though only 10% of icons used.
**Fix:** Change `import * from 'lucide-react'` to named imports of only used icons.
**Measurement:** 
- Before: 485 KB
- After: 430 KB
- Savings: 55 KB

### Example 2: Code-Splitting Heavy Component
**Finding:** Admin dashboard with heavy charts bundled on every page, but only visited by 5% of users.
**Fix:** Convert to `next/dynamic` with no SSR, lazy-load on demand.
**Measurement:**
- Before: 485 KB initial
- After: 420 KB initial + 65 KB lazy-loaded admin chunk
- Savings on critical path: 65 KB (but total adds 20 KB asset count)

### Example 3: Duplicate Dependency Versions
**Finding:** Two versions of ethers.js in bundle (6.x and 5.x transitive).
**Fix:** Deduplicate by pinning transitive dep or replacing with only v6.
**Measurement:**
- Before: 485 KB
- After: 465 KB
- Savings: 20 KB

## Files to Modify

### 1. `frontend/next.config.ts`
**Already done.** No further changes needed for analysis phase.

### 2. `frontend/package.json`
**Already done.** The `analyze` script is in place.

### 3. `frontend/budget.json`
**To be updated post-optimization.** Once we have a real baseline, update thresholds:

```json
[
  {
    "path": "/*",
    "resourceSizes": [
      { "resourceType": "script", "budget": 425 }  // UPDATE: based on actual post-optimization size + 10% headroom
    ]
    // ... keep timings as-is unless web vitals also need tuning
  }
]
```

### 4. `.github/workflows/frontend.yml`
**To be added.** After optimization, add a size-budget check step in the build job:

```yaml
  - name: Check bundle size
    run: |
      # Extract first load JS from build output
      BUNDLE_SIZE=$(npm run build 2>&1 | grep -oP "First Load JS:.*?\K[\d\.]+(?= KB)" | head -1)
      BUDGET=425  # from budget.json
      if (( $(echo "$BUNDLE_SIZE > $BUDGET" | bc -l) )); then
        echo "❌ Bundle size $BUNDLE_SIZE KB exceeds budget $BUDGET KB"
        exit 1
      else
        echo "✅ Bundle size $BUNDLE_SIZE KB is within budget $BUDGET KB"
      fi
```

## Expected PR Description

Once all optimizations are complete, the PR should include:

```markdown
## Summary
Fixed bundle size issues identified in INFRA-39 by applying evidence-based optimizations with measured impact.

## Related Issue
Fixes #647 (INFRA-39)

## Changes

### Setup (Already in this branch)
- Added @next/bundle-analyzer@16.2.3 as devDependency
- Integrated bundle analyzer into next.config.ts
- Added `npm run analyze` script to run bundle analysis

### Baseline (Before Optimizations)
- Client-side JS (first load): 485 KB
- Server-side JS: 220 KB
- Total resources: 755 KB

### Optimizations Applied

#### 1. Icon Library Import Fix
**File:** `app/components/IconBar.tsx`
- Changed wholesale import to named imports
- Before: 485 KB | After: 425 KB | Savings: 60 KB
- PR: Verified with `npm run analyze`

#### 2. Chart Library Code-Splitting
**File:** `app/components/AdminCharts.tsx`
- Added `next/dynamic` for lazy-loading analytics charts
- Before: 425 KB initial | After: 405 KB initial (70 KB lazy chunk)
- Net savings on critical path: 20 KB
- Verified: No SSR/hydration issues, charts still render correctly

#### 3. Remove Dev-Only Dependencies from Build
**File:** `frontend/package.json`
- Moved `storybook` from dependencies to devDependencies
- Before: 405 KB | After: 395 KB | Savings: 10 KB

### Final Sizes (After Optimizations)
- Client-side JS (first load): 395 KB (19% reduction from baseline)
- Server-side JS: 220 KB (unchanged)
- Total resources: 705 KB (7% reduction)

### CI Integration
- Updated `frontend/budget.json` with new thresholds (395 KB + 10% headroom = 435 KB budget)
- Added size-budget check to `.github/workflows/frontend.yml`
- Check fails if future builds exceed 435 KB on critical path

## How to Verify Locally

1. Install dependencies: `npm install` (may require Linux/WSL on Windows due to path length limits)
2. Generate bundle report: `npm run analyze`
3. Open `frontend/.next/analyze/client.html` to inspect the bundle visually
4. Run tests: `npm run lint && npm run build && npm run test`

## Testing
- ✅ All lint checks pass
- ✅ Build completes successfully
- ✅ Unit tests pass (vitest)
- ✅ E2E tests pass (playwright)
- ✅ No hydration issues from dynamic imports
- ✅ AdminCharts component still renders correctly when lazy-loaded

## Notes for Future Contributors

- Run `npm run analyze` locally before making large changes that might impact bundle size
- If adding new heavyweight dependencies, consider code-splitting if the component is not critical to first paint
- The `budget.json` file is enforced in CI — PRs exceeding the budget will fail
- To view the full bundle breakdown: `npm run analyze` and open the HTML report
```

## Rollback Plan

If npm install or the build fails at any point:

1. **Revert the commit:** `git revert HEAD`
2. **Or reset to main:** `git reset --hard origin/main`
3. **The bundle analyzer setup is minimal and non-destructive** — there are no imports in the app code yet, only in config

## Dependency on Infrastructure

- **CI:** The size-budget check will run on Linux (Ubuntu) where npm install should work fine
- **Local development:** Developers on non-Windows systems can run `npm run analyze` directly; Windows users may need to use WSL2 or Docker

## Additional Resources

- [Next.js Bundle Analyzer](https://nextjs.org/docs/app/building-your-application/optimizing/bundle-analyzer)
- [Webpack Bundle Analyzer Visualization](https://github.com/webpack-contrib/webpack-bundle-analyzer)
- [Code Splitting Guide](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading)
- [Tree-Shaking Best Practices](https://webpack.js.org/guides/tree-shaking/)
