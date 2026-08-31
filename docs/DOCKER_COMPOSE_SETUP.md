# Docker Compose Local Development Environment

This guide covers setting up and using the Docker Compose environment for full-stack StellarWork development — a one-command local dev environment with Stellar Quickstart testnet, Next.js frontend with hot reload, and a Soroban contract builder.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [What's Included](#whats-included)
- [Service Details](#service-details)
- [Accessing Services](#accessing-services)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Tearing Down](#tearing-down)
- [Advanced Configuration](#advanced-configuration)

## Prerequisites

- **Docker Desktop** or Docker Engine (version 20.10+)
  - [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Docker Compose** (typically included with Docker Desktop, or version 2.0+)
- **Git** (for cloning the repository)
- Approximately **2 GB disk space** for images, volumes, and build artifacts

### Verify Installation

```bash
docker --version
docker compose version
```

Both commands should return version information. If not, install/update Docker.

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/Stellar-work-.git
cd Stellar-work-
```

### 2. Start All Services

```bash
docker compose up
```

This single command:
- Pulls/builds all required Docker images
- Starts a Stellar quickstart testnet container
- Starts the Next.js frontend dev server with hot reload
- Starts the Soroban contract builder service
- Connects all services on an internal Docker network

The first startup takes 30–60 seconds as the Stellar testnet initializes. You'll see output like:

```
stellar       | INFO: Horizon listening on 0.0.0.0:8000
stellar       | INFO: Soroban RPC ready
frontend      | > next dev
frontend      | - ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

### 3. Access the Services

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Stellar Horizon API**: [http://localhost:8000](http://localhost:8000)
- **Stellar RPC (Soroban)**: [http://localhost:8000/soroban/rpc](http://localhost:8000/soroban/rpc) or similar (check Stellar docs for current endpoint)

### 4. Make Code Changes

Edit frontend code in `frontend/` or contract code in `contracts/`. Changes are immediately reflected:
- **Frontend**: Browser auto-refreshes via Next.js hot reload
- **Contracts**: Rebuild manually via `docker compose exec` (see [Common Tasks](#common-tasks))

### 5. Stop Services

Press **Ctrl+C** in the terminal running `docker compose up`, or in another terminal:

```bash
docker compose down
```

This stops and removes containers but **preserves volumes** (including Stellar testnet state and Cargo cache).

---

## What's Included

### Three Core Services

1. **stellar** – Stellar Quickstart (testnet mode)
   - Runs local Stellar blockchain with Soroban RPC support
   - Port: 8000 (Horizon API + Soroban RPC)
   - Persistent volume: `stellar-data`

2. **frontend** – Next.js Development Server
   - Serves StellarWork frontend with hot reload
   - Port: 3000
   - Volumes: Live source mount (`./frontend`) + excluded `node_modules` and `.next`

3. **contract-builder** – Rust/Soroban Build Environment
   - Provides Rust toolchain and Soroban CLI for contract builds
   - On-demand service (optional profile)
   - Volumes: Cargo cache + build artifacts cache

### Networks and Volumes

- **Network**: `stellarwork-network` (internal Docker bridge)
  - Services communicate via service names (e.g., `stellar:8000`)
  - Not exposed to the host unless explicitly port-mapped

- **Volumes**:
  - `stellar-data`: Persists testnet state (accounts, contracts, ledger history)
  - `cargo-cache`: Caches Cargo registry for faster dependency resolution
  - `cargo-build-cache`: Caches compiled Rust artifacts

---

## Service Details

### Stellar Service

**Image**: `stellar/quickstart:soroban-dev`

The official Stellar Quickstart image provides:
- Stellar Core (blockchain node)
- Horizon (REST API for querying blockchain state)
- Soroban RPC (JSON-RPC endpoint for smart contracts)
- Friendbot (faucet for funding test accounts)

**Network Mode**: `--local` (standalone testnet, no external network access)

**Health Check**: Uses HTTP `curl` against the Horizon health endpoint with:
- Interval: 5 seconds
- Timeout: 3 seconds
- Retries: 10 (total ~50 seconds startup window)
- Start period: 20 seconds before health checks begin

The health check ensures the frontend doesn't start until Stellar RPC is genuinely ready to accept requests. Without this, the frontend may crash on startup if it tries to connect to an unprepared RPC endpoint.

**Ports**:
- `8000`: Horizon API and Soroban RPC endpoint

**Persistent State**:
- Volume: `stellar-data:/opt/stellar`
- Testnet state (accounts, transactions, ledgers) is preserved across restarts
- To reset the testnet, run: `docker volume rm stellarwork-stellar-data` or `docker compose down -v`

### Frontend Service

**Image**: Built from `./frontend/Dockerfile` (multi-stage Node.js builder)

**Dev Server**: `npm run dev` (Next.js dev server with hot reload)

**Ports**:
- `3000`: Frontend development server

**Environment Variables**:
- `NEXT_PUBLIC_SOROBAN_RPC=http://stellar:8000`: Points to local Stellar RPC via Docker service name
- `NEXT_PUBLIC_NETWORK=standalone`: Network identifier for the frontend
- `NODE_ENV=development`: Enables Next.js dev features
- `WATCHPACK_POLLING=true` / `CHOKIDAR_USEPOLLING=true`: File watching for container environments

**Volumes**:
- `./frontend:/app`: Host source directory mounted in container
- `/app/node_modules`: Named volume (anonymous in compose) — prevents host `node_modules` from shadowing container's installed dependencies
- `/app/.next`: Excludes Next.js build cache from host mount

**Key Pattern**: The `node_modules` and `.next` exclusions are critical. Without them:
- The container's installed packages are overwritten by (missing) host node_modules
- Next.js cache conflicts cause build errors
- Hot reload stops working

**Depends On**: `stellar` with `condition: service_healthy` — frontend waits for Stellar's health check to pass before starting.

### Contract Builder Service

**Image**: `rust:latest` (official Rust image with wasm32 target)

**Purpose**: Provides the Rust/Cargo/Soroban toolchain for building WebAssembly contracts.

**Volumes**:
- `./contracts:/workspace/contracts`: Source directory
- `cargo-cache:/usr/local/cargo/registry`: Dependency cache (speeds up builds)
- `cargo-build-cache:/workspace/contracts/escrow/target`: Build artifact cache

**Command**: `tail -f /dev/null` (keeps container running indefinitely)

This is an on-demand service. Instead of running continuously, you:
1. Keep it running in the background: `docker compose up` (includes all services)
2. Run builds via `docker compose exec`: See [Common Tasks](#common-tasks)

**Profile**: Listed in `profiles: [builder]` in compose file — optional. To explicitly include it:

```bash
docker compose --profile builder up
```

---

## Accessing Services

### From Host Machine

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | StellarWork application |
| Stellar Horizon | http://localhost:8000 | Query blockchain state, submit transactions |
| Stellar RPC | http://localhost:8000/rpc (check Stellar docs) | Soroban smart contract RPC |

### From Inside Docker Network

Services can reference each other by name:
- Frontend connects to Stellar RPC at `http://stellar:8000` (not `localhost:8000`)
- Contract builder can invoke Stellar at `http://stellar:8000`

This is automatically configured in the frontend via `NEXT_PUBLIC_SOROBAN_RPC=http://stellar:8000`.

### Fund Test Accounts

The Stellar quickstart container includes Friendbot, a faucet for funding test accounts on standalone/testnet networks.

```bash
# Fund a test Stellar account (G...) with initial balance
curl http://localhost:8000/friendbot?addr=GABC...XYZ

# Response includes funded account details
```

---

## Common Tasks

### 1. Build and Compile Contracts

#### Option A: Interactive Build

```bash
# Start all services (including optional contract-builder)
docker compose up

# In another terminal, run a contract build
docker compose exec contract-builder bash -c "cd contracts/escrow && soroban contract build"

# Output: /workspace/contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm
```

#### Option B: One-Off Build (without keeping container running)

```bash
docker compose run --rm contract-builder bash -c "cd contracts/escrow && soroban contract build"
```

The `--rm` flag removes the container after the build completes.

### 2. Run Contract Tests

```bash
docker compose exec contract-builder bash -c "cd contracts/escrow && cargo test"
```

### 3. Run Frontend Tests

```bash
docker compose exec frontend npm run test

# Or with coverage
docker compose exec frontend npm run test:coverage
```

### 4. Rebuild Frontend Docker Image

If you update `frontend/Dockerfile` or dependencies:

```bash
docker compose build frontend
```

Then restart:

```bash
docker compose up frontend
```

### 5. View Service Logs

```bash
# All services
docker compose logs

# Specific service
docker compose logs stellar
docker compose logs frontend
docker compose logs contract-builder

# Follow logs in real-time
docker compose logs -f

# Last 50 lines
docker compose logs --tail=50
```

### 6. Inspect Container State

```bash
# List running containers
docker compose ps

# Execute shell in a container
docker compose exec frontend bash
docker compose exec contract-builder bash

# Inspect network
docker network inspect stellarwork-network
```

### 7. Install New Frontend Dependencies

```bash
# Install a new npm package
docker compose exec frontend npm install <package-name>

# Or add to package.json and sync
docker compose exec frontend npm install
```

### 8. Deploy Contract to Local Testnet

Once the contract is built, deploy it using Soroban CLI (must be installed on host or run in contract-builder):

```bash
docker compose exec contract-builder bash -c "
  cd /workspace && \
  soroban config network add local --rpc-url http://stellar:8000 --network-passphrase 'Standalone Network ; February 2017' && \
  soroban contract deploy \
    --wasm /workspace/contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm \
    --source-account <ADMIN_SECRET> \
    --rpc-url http://stellar:8000 \
    --network-passphrase 'Standalone Network ; February 2017'
"
```

Replace `<ADMIN_SECRET>` with an actual Stellar secret key (e.g., from a funded test account).

---

## Troubleshooting

### Frontend Won't Start / Connection Refused

**Symptom**: Frontend logs show connection errors like `Error: getaddrinfo ENOTFOUND stellar` or `Error: connect ECONNREFUSED 127.0.0.1:8000`

**Causes**:
1. Stellar service failed to start or didn't reach healthy state
2. Frontend started before Stellar RPC was ready (health check not working)
3. Network misconfiguration

**Solution**:
```bash
# Check service status
docker compose ps

# View Stellar logs
docker compose logs stellar

# Restart all services
docker compose down
docker compose up
```

### Stellar Service Doesn't Initialize / Stuck

**Symptom**: Stellar logs show errors or it doesn't reach the "RPC ready" state

**Causes**:
1. Port 8000 already in use on host
2. Insufficient memory for running processes
3. Corrupted persistent volume

**Solution**:

```bash
# Check if port 8000 is in use (Windows)
netstat -ano | findstr :8000

# If in use, either:
# a) Free the port
# b) Change STELLAR_RPC_PORT in .env

# Reset the Stellar volume
docker compose down -v  # Removes all volumes

# Rebuild from scratch
docker compose up
```

### Node Modules Errors / Missing Dependencies

**Symptom**: Frontend crashes with "Cannot find module" errors, or old package versions after updating `package.json`

**Causes**:
1. Host `node_modules` directory is interfering with container's modules
2. `node_modules` volume mount isn't properly isolated

**Solution**:
```bash
# Restart frontend to ensure volume mount is correct
docker compose restart frontend

# Or fully rebuild
docker compose down
docker compose up --build frontend
```

**Prevention**: Never try to edit `node_modules` on the host. All dependency management must happen inside the container via `docker compose exec frontend npm install`.

### Hot Reload Not Working

**Symptom**: Editing frontend files doesn't trigger browser refresh

**Causes**:
1. File watching disabled or not configured properly
2. Source mount not properly shared with Docker
3. `node_modules` or `.next` volume interfering

**Solution**:
```bash
# Verify file watching environment variables are set
docker compose exec frontend env | grep -E "CHOKIDAR|WATCHPACK"

# Restart file watching
docker compose restart frontend

# Check logs
docker compose logs -f frontend
```

**Note**: Some systems (especially Windows with WSL2) may need `CHOKIDAR_USEPOLLING=true` (already set in defaults).

### Cargo Build Fails / Dependencies Not Found

**Symptom**: `docker compose exec contract-builder cargo build` fails with "failed to resolve" or network errors

**Causes**:
1. Network connectivity inside Docker
2. Cargo registry cache stale or corrupted
3. Rust toolchain missing wasm32-unknown-unknown target

**Solution**:
```bash
# Verify connectivity and registry
docker compose exec contract-builder cargo search soroban-sdk

# Add wasm32 target (if using custom Rust image)
docker compose exec contract-builder rustup target add wasm32-unknown-unknown

# Clear cache and rebuild
docker compose exec contract-builder cargo clean
docker compose exec contract-builder cargo build --target wasm32-unknown-unknown
```

### Port Already in Use

**Symptom**: `docker compose up` fails with "port is already allocated"

**Solution**:
```bash
# Option 1: Free the port on host
# Windows: Find process using port 3000 or 8000 and terminate it

# Option 2: Use different ports in .env
# Create .env or .env.local with:
FRONTEND_PORT=3001
STELLAR_RPC_PORT=8001

# Option 3: Find and stop conflicting container
docker ps  # Identify container using the port
docker stop <container-id>
```

### Docker Compose Command Not Found

**Symptom**: `docker compose up` returns "command not found"

**Solution**: You may have an older Docker version or Docker Compose installed as a separate tool.

```bash
# Check version
docker compose version  # Should be v2.0+

# If not found, try the older syntax
docker-compose up  # With hyphen instead of space

# Or update Docker Desktop to the latest version
```

---

## Tearing Down

### Stop Services (Preserve State)

```bash
docker compose down
```

Containers are removed, but volumes (Stellar testnet state, Cargo cache) are preserved.

### Full Cleanup (Remove Everything)

```bash
docker compose down -v
```

The `-v` flag removes all volumes, including:
- `stellar-data`: Stellar testnet ledger history
- `cargo-cache`: Cargo dependency cache
- `cargo-build-cache`: Compiled Rust artifacts

**Warning**: This deletes all testnet state. On next startup, a fresh testnet is initialized.

### Remove Specific Volume

```bash
# Reset only Stellar testnet
docker volume rm stellarwork-stellar-data

# Reset only Cargo cache
docker volume rm stellarwork-cargo-cache
```

### Remove All StellarWork Containers and Images

```bash
# Remove stopped containers
docker container prune -f --filter "label=com.docker.compose.project=stellar-work"

# Remove all images related to this project (optional, frees disk space)
docker rmi stellar/quickstart:soroban-dev
docker rmi <frontend-image-id>
docker rmi rust:latest
```

---

## Advanced Configuration

### Custom Environment Variables

Create a `.env.local` file in the project root to override defaults:

```bash
# .env.local
STELLAR_NETWORK_FLAG=--testnet
STELLAR_QUICKSTART_IMAGE=stellar/quickstart:soroban-dev@sha256:6c1438d2e8e59c763bb6d7609e25e0f2cb1e7ff02d7cff7de9be5ca1bb6c3f43
FRONTEND_PORT=3001
NEXT_PUBLIC_CONTRACT_ID=C123...ABC
RUST_IMAGE=rust:1.81-slim-bookworm
```

Compose automatically loads `.env.local` if it exists.

### Switch to Stellar Testnet

To connect to the public Stellar testnet instead of a local standalone network:

1. Edit `.env.local`:
   ```
   STELLAR_NETWORK_FLAG=--testnet
   NEXT_PUBLIC_SOROBAN_RPC=https://soroban-testnet.stellar.org
   NEXT_PUBLIC_NETWORK=testnet
   NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
   ```

2. Restart:
   ```bash
   docker compose down
   docker compose up
   ```

**Note**: Testnet mode requires internet connectivity and uses real testnet RPC endpoints. Friendbot may have rate limits.

### Use Custom Rust Version for Contracts

```bash
# .env.local
RUST_IMAGE=rust:1.81-slim-bookworm
```

Or use a Soroban-specific image if available:

```bash
RUST_IMAGE=soroban-dev:latest
```

### Enable Service Logging

To see detailed logs from all services:

```bash
docker compose logs -f
```

For specific service:

```bash
docker compose logs -f stellar
docker compose logs -f frontend
docker compose logs -f contract-builder
```

### Rebuild Images

After updating Dockerfile or dependencies:

```bash
# Rebuild frontend image
docker compose build --no-cache frontend

# Rebuild all images
docker compose build --no-cache

# Rebuild and start
docker compose up --build
```

---

## Performance Tips

1. **Enable Docker Resource Allocation**: Allocate sufficient CPU and memory to Docker Desktop (typically 4+ CPUs, 4+ GB RAM for comfortable development)

2. **Use Named Volumes**: Cargo cache and build cache are stored in named volumes for performance. Don't switch them to host mounts unless necessary.

3. **Exclude Large Directories**: Frontend `node_modules` and `.next` are properly excluded from host mounts to avoid slow syncing.

4. **Restart Between Major Changes**: After adding dependencies or changing Dockerfiles, rebuild: `docker compose down && docker compose up --build`

---

## Next Steps

- **Deploy Contracts**: See [CONTRACT.md](./contract-reference.md) for contract deployment workflow
- **Configure Frontend**: Set `NEXT_PUBLIC_CONTRACT_ID` and `NEXT_PUBLIC_ADMIN_ADDRESS` in `.env.local` after deploying a contract
- **Run Tests**: `docker compose exec frontend npm run test` and `docker compose exec contract-builder cargo test`
- **Production Deployment**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup with Kubernetes/Helm

---

## References

- [Stellar Quickstart GitHub](https://github.com/stellar/quickstart)
- [Stellar Developers Documentation](https://developers.stellar.org/)
- [Soroban Smart Contracts](https://developers.stellar.org/docs/learn/smart-contracts)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
