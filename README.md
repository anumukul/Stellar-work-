# StellarWork

[![Production Deployment](https://img.shields.io/github/actions/workflow/status/your-org/Stellar-work-/deploy-production.yml?branch=main&label=production&logo=vercel)](https://github.com/your-org/Stellar-work-/actions/workflows/deploy-production.yml)
[![Preview Deployments](https://img.shields.io/github/actions/workflow/status/your-org/Stellar-work-/deploy-preview.yml?label=preview&logo=vercel)](https://github.com/your-org/Stellar-work-/actions/workflows/deploy-preview.yml)
[![CI](https://img.shields.io/github/actions/workflow/status/your-org/Stellar-work-/ci.yml?label=ci&logo=github)](https://github.com/your-org/Stellar-work-/actions/workflows/ci.yml)
[![Frontend CI](https://img.shields.io/github/actions/workflow/status/your-org/Stellar-work-/frontend.yml?label=frontend+ci&logo=github)](https://github.com/your-org/Stellar-work-/actions/workflows/frontend.yml)
[![Contract CI](https://img.shields.io/github/actions/workflow/status/your-org/Stellar-work-/contract.yml?label=contract+ci&logo=rust)](https://github.com/your-org/Stellar-work-/actions/workflows/contract.yml)
[![Lighthouse](https://img.shields.io/badge/performance-≥90-brightgreen?logo=lighthouse&label=lighthouse)](https://github.com/your-org/Stellar-work-/actions/workflows/lighthouse.yml)
[![Code Coverage](https://img.shields.io/codecov/c/github/your-org/Stellar-work-?logo=codecov)](https://codecov.io/gh/your-org/Stellar-work-)

StellarWork is an open-source decentralized freelance marketplace on Stellar. Payments are held in Soroban escrow and released by state transitions, not platform custody logic.

## Repository Layout

```
stellarwork
├── contracts/escrow
├── frontend
└── docs
```

## Local DevNet (Isolated Testing)

For fully isolated contract testing without relying on public testnets, use the devnet scripts:

```bash
# 1. Set up a local Soroban devnet (requires Docker)
./scripts/setup-devnet.sh

# 2. Reset the devnet state when needed
./scripts/reset-devnet.sh

# 3. Run tests against the local devnet
./scripts/run-tests-local.sh
```

The setup script:
- Starts a Stellar Quickstart container with a standalone network
- Funds a test admin account
- Deploys and initializes the escrow contract
- Saves configuration to `.env.dev`

## Local Setup

### Using Docker Compose (Recommended) ⭐

Spin up the complete development environment with one command:

```bash
docker compose up
```

This starts:
- **stellar** — Local Stellar testnet with Soroban RPC at [http://localhost:8000](http://localhost:8000)
- **frontend** — Next.js dev server at [http://localhost:3000](http://localhost:3000) with hot-reload (files are live-synced)
- **contract-builder** — Rust + Soroban CLI environment for building/testing contracts

**First run?** The Stellar testnet takes 20–30 seconds to initialize. Once ready, the frontend automatically connects to it via the Docker internal network.

#### Common Docker Compose Tasks

```bash
# View service status
docker compose ps

# View logs (all services or specific service)
docker compose logs
docker compose logs stellar
docker compose logs frontend

# Build and deploy contracts
docker compose exec contract-builder bash -c "cd contracts/escrow && soroban contract build"

# Run contract tests
docker compose exec contract-builder cargo test --manifest-path contracts/escrow/Cargo.toml

# Run frontend tests
docker compose exec frontend npm run test

# Stop services (preserve state)
docker compose down

# Stop and remove volumes (fresh start next time)
docker compose down -v
```

For detailed setup/troubleshooting/advanced configuration, see [Docker Compose Setup Guide](docs/DOCKER_COMPOSE_SETUP.md).

#### Quick Makefile Commands

Common Docker Compose operations are available via Makefile:

```bash
make up      # docker compose up
make down    # docker compose down
make logs    # docker compose logs -f
make test-contract   # docker compose exec contract-builder cargo test
make test-frontend   # docker compose exec frontend npm run test
```

### Manual Setup

#### 1) Contract

```bash
cd contracts/escrow
cargo test
```

### 2) Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3) Pre-commit Hooks (Optional)

To automate quality checks, see the [pre-commit setup guide](CONTRIBUTING.md#pre-commit-hooks-optional) in the contribution docs.

## Deploy Contract to Stellar Testnet (Step-by-Step)

This walkthrough takes you from build to frontend integration with copy-pasteable commands.

### 1) Prerequisites

- Install Soroban CLI ([docs](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)).
- Have a funded Stellar Testnet account.
- Configure a Soroban identity:

```bash
soroban config identity generate stellarwork-admin
soroban config identity address stellarwork-admin
```

- Add Testnet network (if not already configured):

```bash
soroban config network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

### 2) Build the Escrow Contract

```bash
cd contracts/escrow
cargo test
soroban contract build
```

Expected wasm output:

```bash
target/wasm32-unknown-unknown/release/escrow.wasm
```

### 3) Deploy to Testnet

```bash
cd contracts/escrow
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source stellarwork-admin \
  --network testnet
```

Save the returned contract ID (for example `CC...`).

### 4) Initialize Contract State

`initialize(admin, native_token)` must be called once.

1. Determine your admin address:

```bash
soroban config identity address stellarwork-admin
```

2. Choose a native token contract address on testnet (or your token contract).
3. Invoke initialize:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source stellarwork-admin \
  --network testnet \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --native_token <NATIVE_TOKEN_CONTRACT_ADDRESS>
```

### 5) Configure Frontend Environment

```bash
cd frontend
cp .env.example .env.local
```

Set at minimum:

```bash
NEXT_PUBLIC_CONTRACT_ID=<CONTRACT_ID>
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC=https://soroban-testnet.stellar.org
```

See `docs/environments.md` for the complete environment variable reference, defaults, and Testnet/Mainnet notes.

Then run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6) Verify Deployment

Read methods should return values without requiring a signed transaction:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_job_count
```

### Troubleshooting

- **`HostError: Error(Contract, #...)` on write calls**: check caller authorization and method preconditions.
- **`NEXT_PUBLIC_CONTRACT_ID is not configured`**: confirm `frontend/.env.local` and restart `npm run dev`.
- **`contract not found` / RPC errors**: verify `--network testnet` and correct contract ID.
- **Initialize appears to do nothing**: this contract ignores repeated `initialize` calls after first setup.
- **Insufficient balance on deploy/invoke**: fund the identity from Stellar Friendbot and retry.

## Current Feature Set

- Core escrow lifecycle (`post_job`, `accept_job`, `submit_work`, `approve_work`, `cancel_job`)
- Freelancer-initiated job cancellation with penalty (`freelancer_cancel_job`)
- On-chain job storage and count queries
- Multi-token support with admin-managed whitelist (`add_allowed_token`, `remove_allowed_token`)
- IPFS-based job description storage via web3.storage (with localStorage fallback)
- Platform fee accounting (2.5%)
- Dispute resolution with flexible client/freelancer splits
- Contract upgrade mechanism with 24-hour timelock
- Contract unit tests for core paths
- Core pages: `/`, `/post-job`, `/job/[id]`, `/dashboard`, `/admin`, `/disputes`, `/profile/[address]`

## Environment Configuration

Copy `frontend/.env.example` to `frontend/.env.local` and set the required variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_CONTRACT_ID` | Yes | — | Deployed escrow contract ID |
| `NEXT_PUBLIC_NETWORK` | No | `testnet` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_SOROBAN_RPC` | No | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `NEXT_PUBLIC_NATIVE_TOKEN` | No | — | Default token address for post-job form |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | No | — | Admin wallet for UI access control |
| `NEXT_PUBLIC_IPFS_GATEWAY_URL` | No | `https://dweb.link/ipfs/` | IPFS gateway for descriptions |
| `NEXT_PUBLIC_WEB3_STORAGE_TOKEN` | No | — | Web3.storage token for IPFS uploads |

The frontend validates configuration at runtime via `lib/config.ts`. Missing required variables produce clear error messages. See `docs/environments.md` for the full reference including Testnet/Mainnet notes.

## Vercel Deployment

The frontend is deployed to Vercel automatically:

- **Production** — every push to `main` that changes `frontend/**` triggers a production deployment.
- **Preview** — every pull request gets a unique preview URL, posted as a comment by the GitHub Actions bot.

See [docs/DEPLOY.md](docs/DEPLOY.md) for the Vercel CI/CD setup guide (creating the Vercel project, required GitHub secrets, environment variable configuration, and troubleshooting).

For hosting the frontend on Vercel, Netlify, or Docker (plus production env configuration), see [docs/FRONTEND_DEPLOYMENT.md](docs/FRONTEND_DEPLOYMENT.md).
For a command-only deployment reference, see `docs/testnet-deployment-guide.md`.
For environment configuration, see `docs/environments.md`.
For API reference, see `docs/CONTRACT.md`.
For frontend architecture, see `docs/FRONTEND_ARCHITECTURE.md`.
For third-party integration, see `docs/INTEGRATION.md`.

For the full documentation index, see [docs/README.md](docs/README.md).

## Translation Status

StellarWork supports multiple languages. Community contributions to add or maintain translations are welcome — see [docs/TRANSLATING.md](docs/TRANSLATING.md) for a step-by-step guide.

| Locale | Language | Status | Maintainer |
|--------|----------|--------|------------|
| `en` | English | ✅ Complete (reference) | Core team |
| `es` | Spanish | ✅ Complete | Community |

To add a new language, follow the [translation guide](docs/TRANSLATING.md).

## Production Operations

For deploying and operating StellarWork in production, start with these three documents:

| Document | Purpose |
|----------|---------|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Step-by-step production deployment: contract build/deploy/initialize, Vercel frontend, DNS/SSL, post-deploy verification |
| [docs/OPS_RUNBOOK.md](docs/OPS_RUNBOOK.md) | Ongoing operations: monitoring signals, backup procedures, incident response, contract upgrades, regular maintenance |
| [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) | Pre-launch checklist with sign-off table — complete before going live |

## Video Tutorials

Step-by-step video walkthroughs for the most common workflows. Videos are recorded on Stellar testnet — no real funds are used.

| # | Title | Audience | Status |
|---|-------|----------|--------|
| 01 | Getting Started: Connecting Your Wallet | All | Planned |
| 02 | Posting Your First Job | Clients | Planned |
| 03 | Finding and Accepting Jobs as a Freelancer | Freelancers | Planned |
| 04 | Completing a Job and Getting Paid | Freelancers | Planned |
| 05 | Managing Disputes | All | Planned |

> When videos are published, replace "Planned" with a link to the video (e.g., `[Watch →](https://youtube.com/...)`).

For recording setup, script templates, format guidelines, and closed captioning standards, see [docs/VIDEO_TUTORIALS.md](docs/VIDEO_TUTORIALS.md).

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
All contributors are expected to uphold our community standards.

## License

MIT (`LICENSE`).
