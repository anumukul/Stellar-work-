# StellarWork

StellarWork is an open-source decentralized freelance marketplace on Stellar. Payments are held in Soroban escrow and released by state transitions, not platform custody logic.

## Repository Layout

```
stellarwork
├── contracts/escrow
├── frontend
└── docs
```

## Local Setup

### Using Docker (Recommended)

You can spin up the frontend development environment with a single command (requires Docker installed):

```bash
cd frontend
cp .env.example .env.local
cd ..
docker compose up
```

Open [http://localhost:3000](http://localhost:3000). File changes in `frontend/` will trigger hot-reload inside the container automatically.

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
```

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
- On-chain job storage and count queries
- Platform fee accounting (2.5%)
- Contract unit tests for core paths
- Core pages: `/`, `/post-job`, `/job/[id]`

For a command-only deployment reference, see `docs/testnet-deployment-guide.md`.


## License

MIT (`LICENSE`).
