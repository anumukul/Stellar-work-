# Docker Compose Quick Start

Get StellarWork running locally in 60 seconds.

## Prerequisites

- Docker Desktop or Docker Engine (v20.10+)
- Docker Compose (v2.0+)

Check: `docker --version` and `docker compose version`

## One-Command Startup

```bash
cd Stellar-work-
docker compose up
```

**First run takes 30–60 seconds** as Stellar initializes.

Once ready, you'll see:
```
stellar   | INFO: Horizon listening on 0.0.0.0:8000
frontend  | ready started server on 0.0.0.0:3000
```

## Access Services

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | StellarWork app (hot-reload enabled) |
| Stellar RPC | http://localhost:8000 | Local testnet RPC endpoint |

## Common Tasks

```bash
# View logs
docker compose logs -f stellar
docker compose logs -f frontend

# Run contract tests
docker compose exec contract-builder cargo test --manifest-path contracts/escrow/Cargo.toml

# Run frontend tests
docker compose exec frontend npm run test

# Build a contract
docker compose exec contract-builder bash -c "cd contracts/escrow && soroban contract build"

# Stop (keep state)
docker compose down

# Stop and delete state (fresh start)
docker compose down -v
```

## Using Make

```bash
make up                  # Start all services
make down                # Stop services
make logs                # View all logs
make test-contract       # Run contract tests
make test-frontend       # Run frontend tests
```

## Code Changes

- **Frontend**: Edit `frontend/` → browser auto-refreshes
- **Contracts**: Edit `contracts/` → rebuild manually via `docker compose exec contract-builder ...`

## Full Guide

See [DOCKER_COMPOSE_SETUP.md](DOCKER_COMPOSE_SETUP.md) for:
- Detailed configuration options
- Troubleshooting common issues
- Advanced usage patterns
- Per-service documentation

## Troubleshooting

**Frontend won't connect to Stellar?**
```bash
docker compose logs stellar
```
Look for errors. Usually means Stellar hasn't finished initializing — wait 30 seconds and check again.

**Port already in use?**
```bash
# Change ports in .env.local
FRONTEND_PORT=3001
STELLAR_RPC_PORT=8001
```

**Want a fresh start?**
```bash
docker compose down -v  # Removes all data
docker compose up       # Starts fresh
```

**Need to deploy a contract?**
See `scripts/deploy.sh` (requires Soroban CLI installed on host) or use the contract-builder service within Docker.
