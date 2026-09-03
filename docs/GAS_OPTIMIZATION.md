# Gas Optimization Guide

Practical guidance for writing **gas-efficient contract interactions** against the StellarWork
escrow contract (`contracts/escrow`) — both from Rust contract code and from the Next.js frontend
(`frontend/lib/contract.ts`).

Soroban does not have an "EVM gas" unit. A transaction is metered across four independent
resource dimensions, and the fee is the sum of their costs. Throughout this guide "gas" is used
informally to mean **total metered resource cost**.

> Related reading: [PERFORMANCE.md](./PERFORMANCE.md) (broader performance guide),
> [../contracts/BENCHMARK_GUIDE.md](../contracts/BENCHMARK_GUIDE.md) (how benchmarks are run),
> [../contracts/BENCHMARK_RESULTS.md](../contracts/BENCHMARK_RESULTS.md) (measured baselines).

## Table of Contents

- [How Soroban Meters Cost](#how-soroban-meters-cost)
- [Cost of Common Operations](#cost-of-common-operations)
- [Before/After Optimization Examples](#beforeafter-optimization-examples)
- [Profiling and Measurement Guide](#profiling-and-measurement-guide)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
- [Frontend Interaction Checklist](#frontend-interaction-checklist)
- [Official Soroban Documentation](#official-soroban-documentation)

## How Soroban Meters Cost

| Dimension | What it measures | Network limit (per tx) | Notes |
|---|---|---|---|
| CPU instructions | Wasm instructions executed | 100,000,000 | Dominant driver of the resource fee |
| Ledger read bytes | Entries + bytes read from state | 200 entries / 133 KB | Every `storage().get()` counts |
| Ledger write bytes | Entries + bytes written to state | 50 entries / 66 KB | ~2× the cost of an equivalent read |
| Transaction size | Signed XDR size | 71,680 bytes | Arguments and auth entries count |

On top of the resource fee, every transaction pays:

- **Inclusion fee** — the classic `BASE_FEE` (100 stroops) bid, per operation.
- **Rent (TTL) fee** — charged when an entry is created or its TTL extended. Long bumps cost more.

Two consequences matter more than anything else in this repository:

1. **Read-only calls are free.** A simulated call (`simulateTransaction`) is never submitted, so it
   costs zero stroops. Only state-changing calls pay a fee.
2. **Entry count matters as much as byte count.** Ten 40-byte reads cost far more than one
   400-byte read, because each entry carries a fixed base cost.

## Cost of Common Operations

### Primitive operations

Approximate CPU cost of the building blocks used in `contracts/escrow/src/lib.rs`:

| Operation | Approx. CPU instructions | Comment |
|---|---|---|
| Local variable / arithmetic | < 100 | Effectively free — always prefer caching |
| `e.storage().instance().get()` | ~4,000 | Instance map is loaded once per invocation, then cached in-host |
| `e.storage().persistent().get()` | ~6,250 | Separate ledger entry — each key is a distinct read |
| `e.storage().persistent().set()` | ~12,000 | ~2× a read, plus rent |
| `extend_ttl()` | ~5,000 | Plus a rent fee proportional to the bump amount |
| `require_auth()` | ~1,500 | Plus transaction-size cost for the auth entry |
| `e.events().publish()` | ~1,000 | Cheap; topics are cheaper than large data payloads |
| Cross-contract call (`token::Client::transfer`) | ~200,000 | The single most expensive thing an escrow call does |
| `BytesN<32>` compare / hash | ~1,000 | Much cheaper than `String` handling |

### Escrow contract entry points

Measured baselines (see [BENCHMARK_RESULTS.md](../contracts/BENCHMARK_RESULTS.md)); costs are
**not** sensitive to the job amount, because `i128` is a fixed-width value.

| Function | CPU | Reads (B) | Writes (B) | Dominant cost |
|---|---|---|---|---|
| `approve_work` | ~620,000 | 320 | 400 | Token transfer OUT + fee accounting |
| `post_job` | ~450,000 | 200 | 300 | Token transfer IN + job creation |
| `submit_work` | ~420,000 | 260 | 290 | Job read/write + SLA checks |
| `accept_job` | ~380,000 | 250 | 280 | Job read/write only |
| `get_job` (read-only) | ~30,000 | 120 | 0 | Free — simulation only |
| `get_jobs_batch(start, 20)` | ~180,000 | ~2,400 | 0 | Free — one RPC round-trip for 20 jobs |

**Rule of thumb:** a write path costs roughly `200k × (number of token transfers) + 12k × (writes)
+ 6k × (persistent reads) + fixed overhead`. Removing one redundant persistent read/write pair
saves about 18k instructions — small individually, but it compounds inside loops.

## Before/After Optimization Examples

### 1. Re-reading a job instead of reusing it

The mutation paths in the escrow contract read a job once and reuse the in-memory struct.

```rust
// BEFORE — three persistent reads of the same entry (~18,750 CPU)
let job = get_job_or_panic(&e, job_id);
require_status(&e, job_id, JobStatus::InProgress);      // reads Job again
let client = get_job_or_panic(&e, job_id).client;       // reads Job a third time
```

```rust
// AFTER — one read, reuse the struct (~6,250 CPU)
let job = get_job_or_panic(&e, job_id);
if job.status != JobStatus::InProgress {
    panic_with_error!(&e, Error::InvalidStatus);
}
let client = job.client.clone();
```

**Saving:** ~12,500 CPU instructions and 2 ledger-entry reads per call.

### 2. Hoisting instance config out of a loop

```rust
// BEFORE — fee config re-read on every iteration of a 20-item batch
for job_id in job_ids.iter() {
    let fee_bps = get_fee_bps(&e);           // 20 instance reads
    settle(&e, job_id, fee_bps);
}
```

```rust
// AFTER — read once, reuse (the pattern used by batch_resolve_disputes)
let fee_bps = get_fee_bps(&e);               // 1 instance read
for job_id in job_ids.iter() {
    settle(&e, job_id, fee_bps);
}
```

**Saving:** ~76,000 CPU instructions on a 20-item batch.

### 3. Ordering access checks so the cheap/likely case short-circuits

```rust
// BEFORE — always pays for both lookups
let whitelisted = e.storage().persistent().get(&DataKey::Whitelisted(a.clone())).unwrap_or(false);
let blacklisted = e.storage().persistent().get(&DataKey::Blacklisted(a.clone())).unwrap_or(false);
if blacklisted { panic_with_error!(e, Error::BlacklistedUser); }
if !whitelisted { panic_with_error!(e, Error::NotWhitelisted); }
```

```rust
// AFTER — blacklist first, whitelist read only when whitelist mode is on
if e.storage().persistent().get(&DataKey::Blacklisted(a.clone())).unwrap_or(false) {
    panic_with_error!(e, Error::BlacklistedUser);
}
let whitelist_mode: bool = e.storage().instance().get(&DataKey::WhitelistMode).unwrap_or(false);
if whitelist_mode && !e.storage().persistent().get(&DataKey::Whitelisted(a.clone())).unwrap_or(false) {
    panic_with_error!(e, Error::NotWhitelisted);
}
```

**Saving:** ~6,250 CPU instructions on the common (whitelist-disabled) path — this is the shape of
`require_active_access` in `lib.rs`.

### 4. Storing hashes as `BytesN<32>`, not `String`

```rust
// BEFORE
pub desc_hash: String,   // variable length, expensive to compare and store
```

```rust
// AFTER
pub desc_hash: BytesN<32>,  // fixed 32 bytes, cheap compare, smaller entry
```

**Saving:** smaller ledger entries (lower write bytes **and** lower rent) plus cheaper comparisons.
Store large payloads off-chain (IPFS) and keep only the hash on-chain — that is exactly why
`post_job` takes `desc_hash` plus a `descriptionPayloadLen`.

### 5. TTL bumps proportional to the entry's remaining usefulness

```rust
// BEFORE — every job bumped for 30 days, forever
e.storage().persistent().extend_ttl(&DataKey::Job(id), THRESHOLD, 518_400);
```

```rust
// AFTER — archival statuses get a 7-day bump (bump_job_ttl in lib.rs)
let bump = match job.status {
    JobStatus::Completed | JobStatus::Cancelled => ARCHIVAL_JOB_BUMP_AMOUNT, // 120_960
    _ => ACTIVE_JOB_BUMP_AMOUNT,                                             // 518_400
};
e.storage().persistent().extend_ttl(&DataKey::Job(id), ACTIVE_JOB_LIFETIME_THRESHOLD, bump);
```

**Saving:** ~4× less rent on terminal-state jobs, which are the majority of entries over time.

### 6. Frontend: N read calls collapsed into one batch call

```ts
// BEFORE — N simulations, N RPC round-trips
const jobs = [];
for (let id = 1; id <= 20; id++) {
  jobs.push(await getJob(String(id)));
}
```

```ts
// AFTER — one simulation, one round-trip
import { getJobsBatch } from "@/lib/contract";

const jobs = await getJobsBatch("1", 20);
```

**Saving:** no stroops (reads are simulated), but ~20× fewer RPC round-trips and far lower
latency and rate-limit pressure. The same applies to `batch_resolve_disputes` on the **write**
side — where it *does* save real fees by amortising per-transaction overhead across 20 disputes.

### 7. Frontend: never hardcode a resource fee

```ts
// BEFORE — hand-rolled fee, either overpays or fails with txInsufficientFee
const tx = new TransactionBuilder(account, { fee: "1000000", networkPassphrase })
  .addOperation(contract.call(method, ...args))
  .setTimeout(60)
  .build();
await server.sendTransaction(await sign(tx.toXDR()));
```

```ts
// AFTER — simulate, then let the SDK attach the exact metered resource fee
const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
  .addOperation(contract.call(method, ...args))
  .setTimeout(60)
  .build();

const simulation = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(simulation)) throw new Error(simulation.error);

const assembled = rpc.assembleTransaction(tx, simulation).build();
const prepared = await server.prepareTransaction(assembled); // exact footprint + fee
```

This is the pattern already implemented in `frontend/lib/stellar.ts`
(`submitWriteContract`) — copy it rather than building transactions by hand.

## Profiling and Measurement Guide

### 1. Rust unit-test budget profiling (fastest feedback loop)

Soroban's test host meters every invocation. Reset the budget immediately before the call you
care about so setup cost is excluded:

```rust
#[test]
fn profile_approve_work() {
    let (env, admin, client, freelancer, token, contract_id) = setup();
    let escrow = EscrowContractClient::new(&env, &contract_id);
    let job_id = escrow.post_job(/* ... */);
    escrow.accept_job(&freelancer, &job_id);
    escrow.submit_work(&freelancer, &job_id);

    env.budget().reset_unlimited();      // exclude all setup above
    escrow.approve_work(&client, &job_id);

    println!("cpu  = {}", env.budget().cpu_instruction_cost());
    println!("mem  = {}", env.budget().memory_bytes_cost());
    env.budget().print();                 // full per-cost-type breakdown
}
```

Run it with output visible:

```bash
cd contracts/escrow
cargo test profile_approve_work -- --nocapture
```

### 2. Repository benchmark suite

```bash
cd contracts/escrow
cargo test --lib benchmarks -- --ignored --nocapture     # all core functions
cargo test --lib benchmarks benchmark_comprehensive_report -- --nocapture
```

See [RUNNING_BENCHMARKS.md](../contracts/RUNNING_BENCHMARKS.md) for the full workflow, and
record new numbers in [BENCHMARK_RESULTS.md](../contracts/BENCHMARK_RESULTS.md) so regressions
are reviewable in a diff.

### 3. WASM-level footprint via the CLI

```bash
# Build optimized wasm (smaller wasm = cheaper upload + faster instantiation)
stellar contract build
stellar contract optimize --wasm target/wasm32-unknown-unknown/release/escrow.wasm

# Dry-run any invocation and read the metered cost from the simulation
stellar contract invoke \
  --id "$CONTRACT_ID" --source-account "$ACCOUNT" --network testnet \
  --send=no --verbose \
  -- approve_work --caller "$CLIENT" --job_id 1
```

`--send=no` simulates only: it prints CPU instructions, read/write bytes and the estimated
resource fee without spending anything. The repo wrapper
[`contracts/benchmark.sh`](../contracts/benchmark.sh) loops this over every entry point.

### 4. Simulation-based profiling from the frontend

```ts
const sim = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationSuccess(sim)) {
  console.log("resource fee (stroops):", sim.minResourceFee);
  console.log("cpu instructions:", sim.transactionData.build().resources().instructions());
}
```

Log `minResourceFee` in staging before shipping any new write path; a sudden jump is the
earliest signal of a gas regression.

### 5. On-chain, after the fact

Horizon reports the actual charge as `fee_charged`. `frontend/lib/horizon-transactions.ts`
already exposes it (`feeCharged`, `feeToXlm()`) and the transaction-history CSV export includes a
`Fee (XLM)` column — use that export to track real-world costs per operation type over time.

### Recommended workflow

1. Write the feature.
2. Add a `--nocapture` budget test and record the baseline.
3. Optimize; re-run and compare.
4. Update `BENCHMARK_RESULTS.md` in the same PR.
5. Watch `minResourceFee` in staging after deploy.

## Anti-Patterns to Avoid

| # | Anti-pattern | Why it costs | Do this instead |
|---|---|---|---|
| 1 | Re-reading the same storage key several times in one call | ~6,250 CPU per redundant read | Read once into a local, reuse it |
| 2 | Unbounded loops over `jobs_count` | Cost grows with state; eventually exceeds the 100M CPU limit and the call becomes permanently unusable | Take `start`/`limit` and paginate (`get_jobs_batch`) |
| 3 | One ledger entry per list item (`DataKey::Tier(0..n)`) | N base-cost entries + N rent charges | Store the whole list in one entry (`Vec` under a single key) |
| 4 | Storing descriptions/URIs/JSON on-chain | Write bytes + perpetual rent | Store off-chain (IPFS), keep a `BytesN<32>` hash |
| 5 | `String` for identifiers or hashes | Variable-length, expensive compare and storage | `BytesN<32>` or `Symbol` |
| 6 | Calling `bump_instance_ttl()` from read-only getters | Turns a free read into a paid write | Bump only on state-changing paths |
| 7 | Maximum TTL bumps on everything | Rent scales with the bump amount | Tier bumps by status (active vs archival) |
| 8 | Emitting events with large data payloads | Payload counts toward transaction size and CPU | Emit IDs/topics; clients fetch details via a read call |
| 9 | Hardcoding `fee` instead of simulating | Overpay, or fail with `txInsufficientFee` and pay twice | `simulateTransaction` → `assembleTransaction` → `prepareTransaction` |
| 10 | Submitting a read as a real transaction | Pays a fee for data you can simulate for free | Pass `{ readOnly: true }` to `callContract` |
| 11 | Polling a getter on every render / every keystroke | RPC floods, rate limits, wasted latency | Cache with React Query; debounce inputs |
| 12 | Firing N single-item writes in a row | N × per-transaction overhead | Use a batch entry point (`batch_resolve_disputes`) |
| 13 | Blind retries after a failure | Each retry pays a full fee | Simulate first; retry only on transient RPC errors (see `contract-retry.ts`) |
| 14 | Multiple sequential cross-contract token transfers | ~200k CPU each — the biggest single cost | Net the amounts and transfer once where semantics allow |
| 15 | `panic!()`/`unwrap()` instead of `panic_with_error!` | Costlier trap path and no typed error for clients | Return contract `Error` variants |
| 16 | Validating input only on-chain | A rejected transaction still costs a fee | Validate in the UI first; keep the on-chain check as the guard |

## Frontend Interaction Checklist

Before merging any new contract call in `frontend/lib/contract.ts`:

- [ ] Read-only? Pass `{ readOnly: true }` so it is simulated, never submitted.
- [ ] Fetching a list? Use a batch entry point instead of a loop of single reads.
- [ ] Write path? Built via `callContract` so simulate → assemble → prepare runs (never a manual `fee`).
- [ ] Inputs validated client-side so avoidable reverts do not cost the user a fee.
- [ ] Result cached/deduplicated so the same value is not fetched repeatedly per render.
- [ ] `minResourceFee` logged and eyeballed in staging.
- [ ] Benchmarks updated if the contract side changed.

## Official Soroban Documentation

- [Fees and metering](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering) — resource dimensions, network limits, fee formula
- [State archival and rent (TTL)](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival) — TTL, rent fees, restoring entries
- [Persistent, instance and temporary storage](https://developers.stellar.org/docs/build/guides/storage/choosing-the-right-storage) — picking the cheapest durability
- [Contract storage best practices](https://developers.stellar.org/docs/build/guides/storage) — key design and bumping patterns
- [Debugging and testing budget usage](https://developers.stellar.org/docs/build/guides/testing) — `env.budget()` in unit tests
- [Optimizing builds](https://developers.stellar.org/docs/build/guides/cli/contract-optimize) — `stellar contract optimize`
- [Soroban RPC `simulateTransaction`](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/simulateTransaction) — reading `minResourceFee` before submitting
- [JS SDK `assembleTransaction`](https://stellar.github.io/js-stellar-sdk/module-rpc.html) — attaching the simulated footprint and fee
