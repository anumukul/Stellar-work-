# Local Development Setup Guide for Stellar Network with Soroban

This is the local development setup guide for Stellar network with Soroban.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Stellar CLI Setup](#stellar-cli-setup)
3. [Quickstart Container](#quickstart-container)
4. [Contract Deployment](#contract-deployment)
5. [Frontend Configuration](#frontend-configuration)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker** (optional, for containerized development)
- **Node.js 18+** (`node -v` should show 18.x or higher)
- **Rust/Cargo** (for building Soroban contracts)
- **Soroban CLI** (for contract deployment)

### Install Soroban CLI

```bash
# macOS (using Homebrew)
brew install soroban

# Linux
curl -sSf https://release.soroban.stellar.org/soroban-latest-x86_64-unknown-linux-gnu.tar.gz | tar xz
sudo mv soroban /usr/local/bin/

# Windows (using Scoop)
scoop install soroban
```

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

---

## Stellar CLI Setup

### 1. Generate Identity

Create a local identity for testing:

```bash
soroban config identity generate local-dev
soroban config identity address local-dev
```

### 2. Fund Your Account

Use Stellar Friendbot to fund your testnet account:

```bash
# Visit: https://laboratory.stellar.org/#account-creator?network=testnet
# Or use the CLI (requires network access)
```

### 3. Configure Network

Add the testnet network configuration:

```bash
soroban config network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

---

## Quickstart Container

For a consistent development environment, use the provided Docker setup.

### Dockerfile

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Soroban CLI
RUN curl -sSf https://release.soroban.stellar.org/soroban-latest-x86_64-unknown-linux-gnu.tar.gz | tar xz \
    && mv soroban /usr/local/bin/

# Install wasm32 target
RUN rustup target add wasm32-unknown-unknown

# Copy project files
WORKDIR /stellar-work
COPY . .

# Install frontend dependencies
WORKDIR /stellar-work/frontend
RUN npm install

# Default command
CMD ["npm", "run", "dev"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  stellar-dev:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - .:/stellar-work
    environment:
      - NODE_ENV=development
    command: npm run dev
```

### Build and Run

```bash
# Build the image
docker build -t stellar-dev .

# Run the container
docker-compose up
```

---

## Contract Deployment

### 1. Build Contract

```bash
cd contracts/escrow
cargo test  # Ensure all tests pass
soroban contract build
```

The compiled WASM file will be at:
```
target/wasm32-unknown-unknown/release/escrow.wasm
```

### 2. Deploy Contract

```bash
# Get your admin address
ADMIN_ADDRESS=$(soroban config identity address local-dev)

# Deploy the contract
CONTRACT_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source local-dev \
  --network testnet \
  --save)

echo "Contract ID: $CONTRACT_ID"
```

### 3. Initialize Contract

```bash
# Get native token address (XLM)
NATIVE_TOKEN=$(soroban contract invoke \
  --id 0 \
  --network testnet \
  -- token::contract_id_address)

# Initialize the contract
soroban contract invoke \
  --id $CONTRACT_ID \
  --source local-dev \
  --network testnet \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --native_token $NATIVE_TOKEN
```

---

## Frontend Configuration

### 1. Create Environment File

```bash
cd frontend
cp .env.example .env.local
```

### 2. Configure Variables

Edit `.env.local` with your deployment values:

```bash
NEXT_PUBLIC_CONTRACT_ID=<YOUR_CONTRACT_ID>
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC=https://soroban-testnet.stellar.org
NEXT_PUBLIC_ADMIN_ADDRESS=<YOUR_ADMIN_ADDRESS>
```

### 3. Start Development Server

```bash
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

---

## Verification

### Smoke Test Contract

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_job_count
```

Expected output: `0`

### Test Job Creation

```bash
# Generate a test client address
CLIENT=$(soroban config identity generate test-client)

# Fund the client
# Visit: https://laboratory.stellar.org/#account-creator?network=testnet

# Post a test job
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source local-dev \
  --network testnet \
  -- post_job \
  --client <CLIENT_ADDRESS> \
  --amount 100000000 \
  --desc_hash 0000000000000000000000000000000000000000000000000000000000000000 \
  --description_payload_len 0 \
  --deadline 10000000 \
  --token_address <NATIVE_TOKEN>
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `contract not found` | Verify `NEXT_PUBLIC_CONTRACT_ID` matches the deployed contract |
| `HostError: Error(Contract, #...)` | Check contract initialization and network |
| `Account not found` | Ensure the account is funded on the correct network |
| RPC connection failed | Verify `NEXT_PUBLIC_SOROBAN_RPC` endpoint is accessible |
| `already initialized` | Contract was already initialized; check storage |

### Useful Commands

```bash
# Check contract info
soroban contract info --id <CONTRACT_ID> --network testnet

# View contract events
soroban contract events --id <CONTRACT_ID> --network testnet

# Check account balance
soroban config identity address local-dev
```

---

## Next Steps

- Review the [contract documentation](../CONTRACT.md) for API reference
- Check [environments.md](../environments.md) for environment variable details
- Follow the [testnet deployment guide](./testnet-deployment-guide.md) for production deployment