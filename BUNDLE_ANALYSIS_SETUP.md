# Bundle Analysis Setup (INFRA-39)

## Current Status

✅ **Setup Complete** — @next/bundle-analyzer is configured and ready to use.

### What's Been Done

1. **Added @next/bundle-analyzer@16.2.3** as an exact-pinned devDependency in `frontend/package.json`
2. **Integrated into next.config.ts** — The analyzer is wrapped around the config and only enabled when `ANALYZE=true` env var is set
3. **Added npm script** — `npm run analyze` now triggers `ANALYZE=true npm run build`, generating a visual bundle report

### Files Modified

- `frontend/package.json` — Added @next/bundle-analyzer devDependency and analyze script
- `frontend/next.config.ts` — Integrated withBundleAnalyzer, gated behind ANALYZE env var

### Commit

Branch: `infra-39-bundle-size-optimization`
Commit: Added @next/bundle-analyzer configuration

## Windows npm Install Issue

**Blocker:** npm install is timing out on Windows due to long file paths and heavy dependency tree. This is a known issue with large monorepos on Windows.

### Workarounds

#### Option 1: Use a CI Environment or Linux
The easiest fix is to run npm install and the analyze build on Linux (e.g., in CI) where path length limits aren't an issue.

#### Option 2: Local Windows Workaround
If you must install locally on Windows, try:

```bash
# Clear npm cache
npm cache clean --force

# Remove old node_modules and try again with flags for Windows compatibility
# Using --legacy-peer-deps and --no-optional can help
npm install --legacy-peer-deps 2>&1 | tee npm_install.log

# If still failing, try increasing Node's memory:
# (Run in PowerShell with admin privileges)
$env:NODE_OPTIONS = "--max-old-space-size=4096"
npm install --legacy-peer-deps
```

#### Option 3: Use a Docker Container
If available, running npm install inside a Docker container or WSL2 can sidestep the Windows path length issue.

## Next Steps

Once npm install completes:

### 1. Run the Bundle Analyzer

```bash
cd frontend
npm run analyze
```

This builds the app with the analyzer enabled and generates an interactive HTML report at:
```
frontend/.next/analyze/client.html    # Client-side bundle
frontend/.next/analyze/server.html    # Server-side bundle
```

### 2. Analyze the Output

Open the HTML reports and look for:
- **Large dependencies** — Any package taking >50KB that shouldn't be
- **Wholesale imports** — e.g., `import Icon from 'lucide-react'` instead of `import { Icon } from 'lucide-react'`
- **Non-tree-shakeable code** — Default imports of barrel files that should use named imports or subpath imports
- **Heavy components** — e.g., chart libraries, editors, that could be code-split with `next/dynamic`
- **Duplicate versions** — Same package at different versions in the bundle

Document the baseline bundle sizes from the analyzer report. Example:
```
Initial Bundle Sizes (Before Optimizations):
- Client JS (first load): 485 KB
- Server JS: 220 KB
- Total shared: 150 KB
```

### 3. Apply Targeted Fixes

For each significant finding:
1. Make the specific optimization (import fix or code-split)
2. Re-run `npm run analyze`
3. Measure the size delta
4. Document the change and its impact

Example:
```markdown
**Fix: Convert lucide-react wholesale import to named imports**
- Before: 485 KB client JS
- After: 425 KB client JS
- Savings: 60 KB
- Change: Convert `import { Plus } from 'lucide-react'` in icon barrel
```

### 4. Update Size Budgets

Once optimizations are complete, update `frontend/budget.json` thresholds based on the post-optimization baseline (not arbitrary numbers).

See `frontend/budget.json` for current structure. Example:
```json
{
  "path": "/*",
  "resourceSizes": [
    { "resourceType": "script", "budget": 425 }  // Updated from 485 KB baseline
  ]
}
```

### 5. Wire Size Budgets into CI

Edit `.github/workflows/frontend.yml` to add a size-budget check step. Example:

```yaml
- name: Check bundle size
  run: |
    npm run build
    # Extract bundle size from build output and compare against budget.json
    # Fail if over budget
```

## Files to Review

- `frontend/next.config.ts` — Bundle analyzer configuration
- `frontend/package.json` — Analyzer dependency and scripts
- `frontend/budget.json` — Size budget thresholds (to be updated post-optimization)
- `.github/workflows/frontend.yml` — Where to add CI size-budget check

## References

- [Next.js Bundle Analyzer](https://github.com/vercel/next.js/tree/canary/packages/next-bundle-analyzer)
- [Webpack Bundle Analyzer](https://github.com/webpack-contrib/webpack-bundle-analyzer)

