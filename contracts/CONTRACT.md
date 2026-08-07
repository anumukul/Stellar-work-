# Escrow Contract — Deployment, Gas & Fee Reference

## Deployment Workflow

Automated deployment scripts are available in the `scripts/` directory.

### Quick Deploy

```bash
./scripts/deploy.sh testnet --admin <ADMIN_ADDRESS> --native-token <TOKEN_ADDRESS>
```

### Step-by-Step Deployment

#### 1. Deploy Contract

```bash
./scripts/deploy.sh <testnet|futurenet|mainnet>
```

This script:
- Configures the Soroban network if not already registered
- Builds the contract WASM via `soroban contract build`
- Deploys to the target network and returns the contract ID
- Saves the contract address to `contract-addresses.json`
- Generates `.env.<network>` with the contract ID and RPC URL

#### 2. Initialize Contract

```bash
./scripts/init.sh <network> --contract-id <ID> --admin <ADMIN_ADDRESS> --native-token <TOKEN_ADDRESS>
```

Required parameters:
- `--contract-id`: The contract ID returned from deployment
- `--admin`: Admin wallet address (G...)
- `--native-token`: Native token contract address

Optional:
- `--source`: Soroban identity (default: `stellarwork-admin`)

#### 3. Configure Frontend

```bash
cp .env.<network> frontend/.env.local
```

Or set the environment variables manually:

```bash
NEXT_PUBLIC_CONTRACT_ID=<CONTRACT_ID>
NEXT_PUBLIC_NETWORK=<testnet|futurenet|mainnet>
NEXT_PUBLIC_SOROBAN_RPC=<RPC_URL>
```

### Contract Upgrade

To upgrade the contract WASM on an existing deployment:

```bash
./scripts/upgrade.sh <network> <contract-id>
```

This installs the new WASM, obtains its hash, and invokes the contract's
`upgrade` function with the new hash. The contract must support the upgrade
interface.

### Contract Addresses

Deployed contract addresses are tracked in `contract-addresses.json` at the
repository root. Each network entry stores:

- `contractId` — The deployed contract address
- `wasmHash` — The installed WASM hash (set after upgrade)
- `admin` — Admin wallet address
- `nativeToken` — Native token contract address
- `rpcUrl` — RPC endpoint for the network
- `passphrase` — Network passphrase
- `horizonUrl` — Horizon API endpoint
- `explorerUrl` — StellarExpert explorer base URL

### Network Configuration

| Network | RPC URL | Passphrase |
|---------|---------|------------|
| testnet | `https://soroban-testnet.stellar.org` | `Test SDF Network ; September 2015` |
| futurenet | `https://rpc-futurenet.stellar.org` | `Test SDF Future Network ; October 2022` |
| mainnet | `https://mainnet.sorobanrpc.com` | `Public Global Stellar Network ; September 2015` |

## Contract Size

Run `soroban contract build && du -h target/wasm32-unknown-unknown/release/escrow.wasm` to get current size.

## Function Gas Costs (approximate, in stroops)

Values are estimates from local `soroban contract invoke` dry-runs against a standalone network. Production costs vary.

| Function | Storage Reads | Storage Writes | Notes |
|---|---|---|---|
| `initialize` | 0 | 8 (instance) + 1 (persistent) | One-time setup |
| `post_job` | 5-8 | 3 (persistent) + 1 (instance) | Includes token transfer |
| `accept_job` | 3 | 1 (persistent) | Updates job status |
| `submit_work` | 3 | 1 (persistent) | Updates job status |
| `approve_work` | 5 | 3 (persistent) | Includes token payout |
| `reject_work` | 3 | 1 (persistent) | Updates job + revision count |
| `cancel_job` | 3 | 1 (persistent) | Includes token refund |
| `freelancer_cancel_job` | 3 | 1 (persistent) | Includes token refund |
| `enforce_deadline` | 3 | 1 (persistent) | Time-sensitive check |
| `raise_dispute` | 4 | 2 (persistent) | Collects dispute fee |
| `resolve_dispute` | 5 | 4 (persistent) | Complex split logic |
| `get_job` | 1 | 0 | Read-only |
| `get_jobs_batch` | n | 0 | n = batch size |
| `get_fee_bps` | 1 | 0 | Read-only |
| `update_fee` | 1 | 1 (instance) | Admin only |
| `withdraw_fees` | 2 | 1 (persistent) | Admin only |

## Storage Layout

### Instance Storage (shared, small)

| Key | Type | Purpose |
|---|---|---|
| `Admin` | Address | Contract administrator |
| `NativeToken` | Address | Native token for fees |
| `JobsCount` | u64 | Total jobs created |
| `FeeBps` | i128 | Default platform fee |
| `FeeTierCount` | u32 | Number of fee tiers |
| `FeeTier(i)` | FeeTier | Per-tier configuration |
| `DescriptionPayloadMaxBytes` | u32 | Max description size |

### Persistent Storage (per-entry TTL)

| Key | Type | Purpose |
|---|---|---|
| `Job(id)` | Job | Per-job state |
| `TokenFees(token)` | i128 | Accumulated fees per token |
| `AllowedToken(token)` | bool | Token whitelist |
| `AllJobIds` | Vec<u64> | List of all job IDs |
| `DescriptionCidMapping(hash)` | String | IPFS CID lookup |
| `Blacklisted(addr)` | bool | Access control |
| `Whitelisted(addr)` | bool | Access control |
| `ReferralCode(code)` | Address | Referral mapping |
| `ReferralEarnings(addr)` | i128 | Referral balance |
| `ClientReferrer(addr)` | Address | Client → referrer |
| `ReferralBonusPaid(addr)` | bool | One-time bonus flag |

## TTL Bump Strategy

| Category | Threshold | Bump Amount |
|---|---|---|
| Instance | 17,280 ledgers (~24h) | 518,400 ledgers (~30d) |
| Active Jobs | 17,280 ledgers | 518,400 ledgers |
| Completed/Cancelled Jobs | N/A | 120,960 ledgers (~7d) |

## Optimization Notes

1. **Storage reads are the primary cost driver.** Each persistent storage read costs ~6,250 CPU instructions. Minimize calls to `e.storage().persistent().get()` in hot paths.

2. **`AllJobIds` indexing.** The contract maintains `AllJobIds` for admin queries alongside sequential IDs (1..n). Consider using only `AllJobIds` for iteration to reduce storage assumption coupling.

3. **Token transfers** (via the token contract's `transfer` call) are the most expensive operation. Batched payouts should use a single transfer where possible.

4. **Fee tier lookups** iterate through all tiers on every fee calculation. When no tiers are configured, the function returns immediately using the default fee — this is already optimized.

5. **Access control checks** (`require_active_access`) perform up to 2-3 storage reads per invocation (blacklist + whitelist mode + whitelist entry). PERF-01 short-circuits whitelist persistent reads when whitelist mode is off, and mutation helpers reuse a single job load for status checks.

6. **PERF-01 batch reads.** Prefer `get_jobs_batch` for list views and `get_job_requiring_status` in write paths so job data and status are not fetched separately.

## Benchmarking

Run the benchmark script:

```bash
./contracts/benchmark.sh
```

This builds the contract in release mode and simulates each function, reporting storage bytes read/written and estimated CPU cost.
