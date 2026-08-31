# Production Deployment Guide

End-to-end guide for deploying StellarWork to production: Soroban contract deployment, Vercel frontend deployment, DNS/SSL configuration, and post-deployment verification.

> For Testnet-only deployment see [testnet-deployment-guide.md](./testnet-deployment-guide.md).
> For Vercel-specific CI/CD setup see [DEPLOY.md](./DEPLOY.md).
> For frontend hosting across Vercel, Netlify, and Docker see [FRONTEND_DEPLOYMENT.md](./FRONTEND_DEPLOYMENT.md).
> For environment variables reference see [environments.md](./environments.md).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Contract Deployment](#2-contract-deployment)
3. [Frontend Deployment](#3-frontend-deployment)
4. [DNS and SSL Configuration](#4-dns-and-ssl-configuration)
5. [Post-Deployment Verification](#5-post-deployment-verification)
6. [Rollback Procedures](#6-rollback-procedures)

---

## 1. Prerequisites

### Tools

| Tool | Version | Install |
|------|---------|---------|
| Rust + Cargo | stable ≥ 1.74 | `rustup update stable` |
| `wasm32-unknown-unknown` target | — | `rustup target add wasm32-unknown-unknown` |
| Soroban CLI | ≥ 21.0 | `cargo install --locked soroban-cli` |
| Node.js | ≥ 20 LTS | [nodejs.org](https://nodejs.org) |
| npm | ≥ 10 | Bundled with Node.js |
| Vercel CLI (optional) | latest | `npm install -g vercel` |
| Git | ≥ 2.40 | System package manager |

Verify your setup:

```bash
cargo --version
soroban --version
node --version
npm --version
```

### Accounts and Secrets

Before starting, have the following ready and stored securely:

| Item | Notes |
|------|-------|
| **Admin Stellar account** | Funded mainnet account. This address becomes the contract admin. |
| **Admin secret key** | Never committed to version control. Use a hardware wallet or secrets manager in production. |
| **Vercel account** | Project created, linked to your GitHub repository. |
| **Domain name** | DNS managed via Cloudflare, AWS Route 53, or similar. |
| **IPFS storage token** | Optional. From [web3.storage](https://web3.storage) if you want on-chain IPFS uploads. |

> **Security note:** Treat the admin secret key with the same care as a production database root password. Rotate it immediately if exposed. The admin key controls fee withdrawals, dispute resolution, and contract upgrades.

### Mainnet Soroban RPC

Use one of:

| Provider | Endpoint |
|----------|----------|
| Stellar Foundation (public) | `https://soroban-rpc.stellar.org` |
| Blockdaemon | Contact provider for endpoint |
| Self-hosted Horizon + RPC | See [Stellar docs](https://developers.stellar.org/docs/run-api-server) |

The public Stellar Foundation RPC is suitable for production traffic at launch. As volume grows, consider a dedicated node or a provider SLA.

---

## 2. Contract Deployment

### 2.1 Configure Soroban Identity

Create a named identity for the admin key. In production, prefer a hardware-backed approach; the CLI identity is convenient for initial deployment.

```bash
# Option A — import existing keypair
soroban config identity add stellarwork-prod \
  --secret-key <YOUR_ADMIN_SECRET_KEY>

# Option B — generate new keypair (save the output securely)
soroban config identity generate stellarwork-prod
soroban config identity show stellarwork-prod   # prints secret key — save it now
soroban config identity address stellarwork-prod # prints public key
```

Add the mainnet network to the CLI:

```bash
soroban config network add mainnet \
  --rpc-url https://soroban-rpc.stellar.org \
  --network-passphrase "Public Global Stellar Network ; September 2015"
```

Verify the admin account is funded (minimum 10 XLM recommended):

```bash
soroban config identity fund stellarwork-prod --network mainnet
# Or fund manually via Stellar wallet
```

### 2.2 Build the Contract

Always run tests before building a production artifact:

```bash
cd contracts/escrow
cargo test
```

Build the optimised WASM artifact:

```bash
soroban contract build
```

Expected output file:

```
target/wasm32-unknown-unknown/release/escrow.wasm
```

Record the SHA-256 hash of the WASM — you will need it to verify the on-chain deployment and for future upgrade proposals:

```bash
# Linux / macOS
sha256sum target/wasm32-unknown-unknown/release/escrow.wasm

# Windows PowerShell
Get-FileHash target/wasm32-unknown-unknown/release/escrow.wasm -Algorithm SHA256
```

### 2.3 Deploy the Contract

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source stellarwork-prod \
  --network mainnet
```

The command prints a contract ID (e.g. `CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`).

**Save this contract ID.** It is required for initialization, the frontend environment, and all future admin operations. There is no way to recover it from the WASM alone.

```bash
# Recommended: store it as a shell variable for the remaining steps
export CONTRACT_ID=<CONTRACT_ID>
export ADMIN_ADDRESS=$(soroban config identity address stellarwork-prod)
```

### 2.4 Determine the Native Token Address

On mainnet, the native XLM token contract address is:

```
CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Verify it is correct for your network using the Stellar Laboratory or:

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  --source stellarwork-prod \
  -- get_native_token
```

> If the contract has not been initialized yet, this will fail. Use the known address above for initialization.

### 2.5 Initialize the Contract

`initialize` must be called **exactly once**. It sets the admin address and the native token, creates the job counter, and sets the default fee (2.5% = 250 basis points).

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source stellarwork-prod \
  --network mainnet \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --native_token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

If `initialize` is called a second time it panics with `Error(Contract, #10)` — this is expected and harmless.

### 2.6 Add Allowed Tokens (Optional)

The native XLM token is automatically allowed during initialization. To add additional tokens (e.g., USDC):

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source stellarwork-prod \
  --network mainnet \
  -- add_allowed_token \
  --token <TOKEN_CONTRACT_ADDRESS>
```

### 2.7 Verify Initialization

Run smoke-check reads — these require no signature and cost no fees:

```bash
# Should return 0 (no jobs yet)
soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- get_job_count

# Should return the admin address
soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- get_admin

# Should return 250 (default 2.5% fee in basis points)
soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- get_fee_bps

# Should return contract version 1
soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- get_contract_version
```

### 2.8 Record Deployment Artifacts

Store all of the following in your secrets manager or team password vault:

| Artifact | Where to store |
|----------|----------------|
| Contract ID | Secrets manager + frontend env vars |
| Admin public key | Secrets manager + `NEXT_PUBLIC_ADMIN_ADDRESS` |
| Admin secret key | Secrets manager only — never in env vars |
| WASM SHA-256 hash | Deployment log + secrets manager |
| Deployment timestamp | Deployment log |
| Network (mainnet/testnet) | Deployment log |

---

## 3. Frontend Deployment

### 3.1 Environment Variables

Set the following in Vercel Dashboard → Your Project → Settings → Environment Variables, scoped to **Production**:

| Variable | Value | Required |
|----------|-------|----------|
| `NEXT_PUBLIC_CONTRACT_ID` | The contract ID from step 2.3 | Yes |
| `NEXT_PUBLIC_NETWORK` | `mainnet` | Yes |
| `NEXT_PUBLIC_SOROBAN_RPC` | `https://soroban-rpc.stellar.org` | Yes |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | Admin public key from step 2.1 | Recommended |
| `NEXT_PUBLIC_NATIVE_TOKEN` | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | Recommended |
| `NEXT_PUBLIC_IPFS_GATEWAY_URL` | `https://dweb.link/ipfs/` | No |
| `NEXT_PUBLIC_WEB3_STORAGE_TOKEN` | Your web3.storage token | No |

> Never set `NEXT_PUBLIC_` variables that contain secret values — anything prefixed `NEXT_PUBLIC_` is embedded into the browser bundle and publicly visible.

### 3.2 Build Verification (Local)

Before triggering a production deployment, verify the build succeeds locally with production environment values:

```bash
cd frontend
cp .env.example .env.local
# Fill in production values in .env.local

npm install
npm run typecheck
npm run lint
npm run build
```

A successful build produces a `.next/` directory. Warnings are acceptable; errors must be resolved.

### 3.3 Deploy via Vercel (Recommended)

Deployments trigger automatically on push to `main` via `.github/workflows/deploy-production.yml`. The workflow:

1. Lints and type-checks the frontend.
2. Runs `npm run build` with the Vercel environment variables injected.
3. Deploys to Vercel production on success.

To trigger manually from the Vercel dashboard:
1. Vercel Dashboard → Your Project → Deployments.
2. Click **Redeploy** on any recent deployment, or push a new commit to `main`.

To deploy from the CLI:

```bash
cd frontend
vercel --prod
```

### 3.4 Self-Hosted Deployment (Optional)

If not using Vercel, you can deploy the Next.js app on any Node.js host:

```bash
cd frontend
npm install --omit=dev
npm run build
npm run start   # or use pm2 / systemd for process management
```

For Docker:

```bash
# From the repository root
docker compose up --build frontend
```

The Dockerfile in `frontend/` is optimised for production — it uses a multi-stage build, runs as a non-root user, and disables Next.js telemetry.

**Process manager example (pm2):**

```bash
npm install -g pm2
pm2 start "npm run start" --name stellarwork-frontend --cwd /path/to/frontend
pm2 save
pm2 startup
```

### 3.5 Build Optimisation Notes

- The Next.js App Router performs static generation where possible. Pages that call `useWallet()` or read environment variables at request time are rendered client-side.
- `NEXT_PUBLIC_*` values are inlined at build time. A build with incorrect values must be rebuilt — updating env vars in Vercel and redeploying is sufficient.
- Enable Vercel Edge Network caching for static assets. `frontend/vercel.json` already sets `Cache-Control: immutable` for `_next/static/**`.

---

## 4. DNS and SSL Configuration

### 4.1 Adding a Custom Domain on Vercel

1. Vercel Dashboard → Your Project → Settings → Domains.
2. Click **Add Domain**, enter your domain (e.g. `stellarwork.app`).
3. Vercel displays the required DNS records.

### 4.2 Required DNS Records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| `A` | `@` (root) | `76.76.21.21` (Vercel IP) | 3600 |
| `CNAME` | `www` | `cname.vercel-dns.com.` | 3600 |

For apex domains on Cloudflare, use an `A` record with Cloudflare proxy **disabled** (grey cloud) to let Vercel provision the SSL certificate correctly. Once the certificate is issued, you may re-enable the proxy.

### 4.3 SSL Certificate

Vercel automatically provisions a TLS certificate from Let's Encrypt once the DNS records propagate (usually within 5 minutes). No manual action is required.

If you are self-hosting, provision a certificate via [Certbot](https://certbot.eff.org/):

```bash
# nginx example
certbot --nginx -d stellarwork.app -d www.stellarwork.app
```

Enable automatic renewal:

```bash
systemctl enable --now certbot.timer
```

### 4.4 Security Headers

`frontend/vercel.json` already configures the following headers for all routes:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

For self-hosted nginx, add to your server block:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

---

## 5. Post-Deployment Verification

Run this checklist after every production deployment before announcing availability.

### 5.1 Contract Verification

```bash
# Confirm contract is live and initialized
soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- get_job_count

soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- get_admin

soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- get_fee_bps
```

Expected: job count = 0, admin = your admin address, fee_bps = 250.

### 5.2 Frontend Smoke Test

| Step | Expected result |
|------|----------------|
| Open `https://stellarwork.app` | Home page loads, no console errors |
| Check network badge in nav | Displays "Mainnet" |
| Click "Connect Wallet" | Freighter popup appears |
| Approve Freighter connection | Connected address appears in nav |
| Open `/post-job` | Post Job form loads |
| Open `/dashboard` | Dashboard loads (empty if no jobs yet) |
| Open `/admin` | Admin panel loads for admin wallet; redirect/unauthorized for others |
| Open a job URL (if jobs exist) | Job detail page renders correctly |

### 5.3 End-to-End Flow Verification

For a new deployment, perform a full escrow cycle on a small amount:

1. Post a job (10 XLM) with a test client wallet.
2. Accept the job with a test freelancer wallet.
3. Submit work from the freelancer wallet.
4. Approve work from the client wallet.
5. Confirm the freelancer received ~9.75 XLM (10 XLM minus 2.5% fee).
6. Confirm 0.25 XLM is visible in the Admin panel under "Platform Fees".
7. Withdraw fees from the admin panel.
8. Confirm admin wallet received 0.25 XLM.

### 5.4 Vercel Deployment Status

- Vercel Dashboard → Your Project → Deployments: status shows **Ready**.
- The domain resolves to the latest deployment.
- No build errors in the deployment log.

---

## 6. Rollback Procedures

### 6.1 Frontend Rollback

Vercel keeps all previous deployments. To roll back:

1. Vercel Dashboard → Your Project → Deployments.
2. Find the last known-good deployment.
3. Click the three-dot menu → **Promote to Production**.

This is instantaneous — no rebuild is required.

Via CLI:

```bash
vercel rollback [deployment-url]
```

### 6.2 Contract Rollback

The escrow contract stores live financial state. A "rollback" means deploying a fixed version and proposing an upgrade — there is no instant revert.

See [OPS_RUNBOOK.md — Emergency Contract Upgrade](./OPS_RUNBOOK.md#4-emergency-contract-upgrade) for the full upgrade procedure.

If the current contract version is behaving incorrectly but funds are safe, the immediate mitigation is to remove the frontend's `NEXT_PUBLIC_CONTRACT_ID` from Vercel env vars and redeploy — this takes the UI offline while the contract issue is resolved, preventing further user interactions without touching on-chain state.

### 6.3 Full Rollback Checklist

See [release-checklist.md — Rollback Checklist](./release-checklist.md#rollback-checklist-failed-release) for the complete step-by-step.

---

*Related: [OPS_RUNBOOK.md](./OPS_RUNBOOK.md) · [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) · [environments.md](./environments.md) · [DEPLOY.md](./DEPLOY.md)*
