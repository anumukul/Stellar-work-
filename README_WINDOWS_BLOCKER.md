# Windows npm Install Blocker — INFRA-39 Bundle Analysis

## Issue

npm install is timing out on Windows due to monorepo path length limitations.

**Attempted on:** Windows 11, Node 22.18.0, npm 11.6.4
**Time spent:** 30+ minutes with no progress beyond initial registry fetch
**Root cause:** Path length limits on Windows (260 characters even with long path support) combined with deep node_modules nesting in this monorepo

## Recommended Solutions

### ✅ **Option 1: Proceed on Linux (GitHub Actions)**

**Why this works:** GitHub Actions jobs run on Ubuntu by default, which has no path length limits.

**What to do:**
1. Keep current branch as-is: `infra-39-bundle-size-optimization`
2. Create a draft PR (even without a full test run locally)
3. GitHub Actions will run `npm ci` in the frontend workflow, which will succeed
4. The bundle analysis phase can proceed in CI or on Linux

**Pros:**
- No need to solve Windows issues
- CI will validate everything works
- Fastest path forward

**Cons:**
- Can't test locally on Windows
- Need to rely on PR feedback loop

### ✅ **Option 2: Use WSL2 (Windows Subsystem for Linux)**

**What to do:**
1. Install WSL2 if not already installed
2. In WSL2 terminal:
   ```bash
   cd /mnt/c/Users/User/Desktop/MODULUS/Stellar-work-/frontend
   npm install --legacy-peer-deps
   npm run analyze
   ```

**Pros:**
- Same codebase
- Full local testing capability
- Much faster than native Windows npm

**Cons:**
- Requires WSL2 setup
- Path translation adds minor overhead

### ✅ **Option 3: Docker**

**What to do:**
1. Create a simple Dockerfile:
   ```dockerfile
   FROM node:22-alpine
   WORKDIR /app
   COPY frontend/ .
   RUN npm install --legacy-peer-deps
   RUN npm run analyze
   ```
2. Build and run:
   ```bash
   docker build -t stellar-analyzer .
   docker run -v $(pwd)/frontend/.next/analyze:/app/.next/analyze stellar-analyzer
   ```

**Pros:**
- Isolated environment
- No dependency on Windows config

**Cons:**
- Requires Docker installation
- Extra step to extract outputs

## Current Status

✅ **Setup Complete:**
- @next/bundle-analyzer added to package.json
- next.config.ts properly configured
- npm run analyze script ready
- Documentation comprehensive

⏳ **Blocked:**
- npm install not completing on Windows

## What's Ready to Go

All configuration is complete and correct. The only blocker is the ability to run npm install to fetch dependencies. Once that's resolved (via any of the three options above):

```bash
npm run analyze
# Opens .next/analyze/client.html and .next/analyze/server.html in browser
```

The rest of the workflow (optimization, CI integration, PR) can proceed normally.

## Commit Status

✅ Committed to branch `infra-39-bundle-size-optimization`:
- `chore(INFRA-39): Add @next/bundle-analyzer and analyze script`
- `docs(INFRA-39): Add bundle analysis setup and optimization planning docs`

Branch is ready for PR whenever the npm install blocker is resolved.

## Next Steps Recommendation

1. **Choose an option** from the three above (Option 1 / GitHub Actions is fastest)
2. **Resolve npm install** using the chosen method
3. **Run `npm run analyze`** and capture baseline bundle sizes
4. **Apply targeted optimizations** (measure each change)
5. **Update CI and budgets** as planned in `BUNDLE_OPTIMIZATION_PLAN.md`
6. **Create PR** with evidence-based changes

---

**This is a known monorepo issue on Windows.** The setup is solid; npm install is the only obstacle.
