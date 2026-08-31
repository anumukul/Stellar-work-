# Frontend Deployment & Hosting Guide

How to build and host the StellarWork Next.js frontend on common platforms.

> Related docs:
> - [DEPLOY.md](./DEPLOY.md) — Vercel CI/CD, GitHub Actions secrets, preview deployments
> - [DEPLOYMENT.md](./DEPLOYMENT.md) — full production stack (contracts + frontend + DNS)
> - [environments.md](./environments.md) — environment variable reference
> - `frontend/.env.example` — copyable env template

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Production environment configuration](#2-production-environment-configuration)
3. [Local production build](#3-local-production-build)
4. [Deploy to Vercel](#4-deploy-to-vercel)
5. [Deploy to Netlify](#5-deploy-to-netlify)
6. [Deploy with Docker](#6-deploy-with-docker)
7. [Post-deploy verification](#7-post-deploy-verification)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 LTS | Required by Next.js 16 |
| npm | ≥ 10 | Bundled with Node.js |
| Git | ≥ 2.40 | For cloning / CI |
| Deployed escrow contract | — | You need a `C…` contract ID before going live |

Optional tooling:

```bash
npm install -g vercel      # Vercel CLI
npm install -g netlify-cli # Netlify CLI
```

---

## 2. Production environment configuration

All browser-facing config uses the `NEXT_PUBLIC_` prefix and is **inlined at build time**. Changing a value after deploy requires a rebuild/redeploy.

### Required variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_CONTRACT_ID` | `C…` | Deployed escrow contract ID |
| `NEXT_PUBLIC_NETWORK` | `mainnet` or `testnet` | Network passphrase + explorer defaults |
| `NEXT_PUBLIC_SOROBAN_RPC` | `https://soroban-rpc.stellar.org` | Soroban RPC endpoint |

### Recommended variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_ADMIN_ADDRESS` | Restricts Admin UI to this `G…` wallet |
| `NEXT_PUBLIC_NATIVE_TOKEN` | Default XLM token contract for post-job |
| `NEXT_PUBLIC_BASE_URL` | Canonical site URL for SEO / Open Graph |

### Optional variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_IPFS_GATEWAY_URL` | IPFS gateway (default `https://dweb.link/ipfs/`) |
| `NEXT_PUBLIC_WEB3_STORAGE_TOKEN` | Enables IPFS uploads for job descriptions |
| `NEXT_PUBLIC_CONTRACT_ID_TESTNET` / `_MAINNET` / `_FUTURENET` | Per-network overrides |
| `NEXT_PUBLIC_SOROBAN_RPC_TESTNET` / `_MAINNET` / `_FUTURENET` | Per-network RPC overrides |

### Local setup

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your values
```

> Never commit `.env.local` or secrets. Anything prefixed `NEXT_PUBLIC_` is visible in the browser bundle — do not put private keys there.

### Suggested values by environment

| Variable | Preview / staging | Production |
|----------|-------------------|------------|
| `NEXT_PUBLIC_NETWORK` | `testnet` | `mainnet` |
| `NEXT_PUBLIC_CONTRACT_ID` | Testnet contract | Mainnet contract |
| `NEXT_PUBLIC_SOROBAN_RPC` | `https://soroban-testnet.stellar.org` | Mainnet RPC of your choice |

---

## 3. Local production build

Use this to validate a release before hosting it anywhere:

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
npm run start
```

The app listens on [http://localhost:3000](http://localhost:3000) by default.

Useful checks before shipping:

- Connect Freighter on the configured network
- Open `/`, `/dashboard`, and a job detail page
- Confirm the Admin link only appears for `NEXT_PUBLIC_ADMIN_ADDRESS`

---

## 4. Deploy to Vercel

Vercel is the recommended host. Prefer the GitHub Actions workflows documented in [DEPLOY.md](./DEPLOY.md) for production and PR previews.

### Dashboard setup (quick path)

1. Go to [vercel.com/new](https://vercel.com/new) and import this repository.
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Next.js** (auto-detected).
4. Add the production environment variables from [§2](#2-production-environment-configuration).
5. Deploy.

### CLI deploy

```bash
cd frontend
npx vercel link
npx vercel env pull .env.local   # optional: sync remote env locally
npx vercel --prod
```

### Build settings

| Setting | Value |
|---------|-------|
| Root Directory | `frontend` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output | Next.js (default) |

`frontend/vercel.json` already sets long-lived cache headers for `_next/static/**`.

---

## 5. Deploy to Netlify

Netlify supports Next.js App Router via the official Next.js runtime plugin.

### Dashboard setup

1. Create a new site from this Git repository in the Netlify dashboard.
2. Set **Base directory** to `frontend`.
3. Set **Build command** to `npm run build`.
4. Leave **Publish directory** empty when using the Next.js runtime (Netlify manages the output).
5. Under **Plugins**, ensure [@netlify/plugin-nextjs](https://www.npmjs.com/package/@netlify/plugin-nextjs) is enabled (Netlify usually auto-detects Next.js).
6. Add the same `NEXT_PUBLIC_*` variables under **Site configuration → Environment variables**.
7. Trigger a deploy.

### `netlify.toml` (optional, repo-local)

If you prefer config-as-code, add this at the repository root (or keep a copy in `frontend/` and point Netlify at that base directory):

```toml
[build]
  base = "frontend"
  command = "npm run build"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

### CLI deploy

```bash
cd frontend
npm ci
npm run build
npx netlify deploy --prod
```

### Notes specific to Netlify

- `NEXT_PUBLIC_*` values must be present at **build** time, same as Vercel.
- For preview branches, scope env vars so previews stay on **testnet**.
- Custom domains and HTTPS are managed in **Domain management**.

---

## 6. Deploy with Docker

The production image is defined in `frontend/Dockerfile` (multi-stage, non-root user, telemetry disabled).

### Build and run a production container

From the repository root:

```bash
docker build -t stellarwork-frontend ./frontend
```

Pass build-time public env vars with `--build-arg` **or** bake them into the image via an env file used during `npm run build`. Because Next.js inlines `NEXT_PUBLIC_*` at build time, the cleanest production pattern is:

```bash
# Example: build with production public config available to Next.js
docker build \
  --build-arg NEXT_PUBLIC_NETWORK=mainnet \
  --build-arg NEXT_PUBLIC_CONTRACT_ID=C... \
  --build-arg NEXT_PUBLIC_SOROBAN_RPC=https://soroban-rpc.stellar.org \
  -t stellarwork-frontend \
  ./frontend
```

If you use build args, extend `frontend/Dockerfile` so the builder stage receives them:

```dockerfile
# In the builder stage (illustrative — add next to the existing Dockerfile)
ARG NEXT_PUBLIC_NETWORK
ARG NEXT_PUBLIC_CONTRACT_ID
ARG NEXT_PUBLIC_SOROBAN_RPC
ENV NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK
ENV NEXT_PUBLIC_CONTRACT_ID=$NEXT_PUBLIC_CONTRACT_ID
ENV NEXT_PUBLIC_SOROBAN_RPC=$NEXT_PUBLIC_SOROBAN_RPC
```

Run the image:

```bash
docker run --rm -p 3000:3000 stellarwork-frontend
```

Open [http://localhost:3000](http://localhost:3000).

### Docker Compose

`docker-compose.yml` at the repo root is oriented toward **local development** (`npm run dev`, hot reload, contract builder). For production hosting, prefer the standalone `frontend/Dockerfile` build above (or a dedicated compose override that builds the `runner` stage and does not mount source volumes).

Development (unchanged):

```bash
docker compose up --build frontend
```

---

## 7. Post-deploy verification

After any host goes live:

1. **Health** — home page returns HTTP 200 and renders job listings (or the empty state).
2. **Network** — Freighter network matches `NEXT_PUBLIC_NETWORK`.
3. **Contract** — accepting/posting a job against the configured contract succeeds on testnet/staging.
4. **Admin** — Admin nav is hidden for non-admin wallets when `NEXT_PUBLIC_ADMIN_ADDRESS` is set.
5. **Assets** — static assets under `/_next/static/` load with long cache headers (Vercel) or CDN defaults (Netlify/Docker reverse proxy).
6. **SEO** — Open Graph tags use the expected `NEXT_PUBLIC_BASE_URL` when configured.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| App loads but contract calls fail | Wrong `NEXT_PUBLIC_CONTRACT_ID` / network / RPC | Fix env vars and **redeploy** (rebuild required) |
| “Wrong network” wallet errors | Freighter network ≠ `NEXT_PUBLIC_NETWORK` | Switch Freighter or change env |
| Build fails on host | Node < 20, or lint/type errors | Use Node 20+, run `npm run lint` / `typecheck` locally |
| Env changes ignored | `NEXT_PUBLIC_*` baked at build time | Trigger a fresh build after changing vars |
| Docker container exits immediately | Build failed or `npm start` missing `.next` | Rebuild image; confirm builder stage ran `npm run build` |
| Netlify 404 on client routes | Next.js plugin missing | Enable `@netlify/plugin-nextjs` |

For wallet / transaction errors after a successful deploy, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
