# Signed Payload Format

Developer reference for every transaction payload the StellarWork frontend sends to a wallet for signing, the validation that runs before and after signing, and the origin/domain checks that guard against phishing.

---

## Table of contents

1. [Overview](#overview)
2. [Signing pipeline](#signing-pipeline)
3. [Origin and domain validation](#origin-and-domain-validation)
4. [Network mismatch rejection](#network-mismatch-rejection)
5. [Payload structures](#payload-structures)
   - [post\_job](#post_job)
   - [accept\_job](#accept_job)
   - [submit\_work](#submit_work)
   - [approve\_work](#approve_work)
   - [cancel\_job](#cancel_job)
   - [rate\_job](#rate_job)
   - [create\_job\_with\_milestones](#create_job_with_milestones)
   - [approve\_milestone / complete\_milestone](#approve_milestone--complete_milestone)
   - [store\_description\_cid](#store_description_cid)
6. [Post-sign verification](#post-sign-verification)
7. [PayloadScope UI type](#payloadscope-ui-type)
8. [Configuration reference](#configuration-reference)
9. [Adding a new contract method](#adding-a-new-contract-method)

---

## Overview

Every state-changing operation goes through a single signing gateway in
`frontend/lib/stellar.ts → submitWriteContract`. Before the XDR is handed to
the wallet the gateway:

1. **Validates the request origin** — ensures the page is served from a known
   StellarWork domain (or warns prominently if not).
2. **Checks the network** — hard-rejects if the app network differs from the
   wallet's reported network.
3. **Builds and simulates the transaction** — uses the Soroban RPC to preflight
   fees and confirm the contract call is valid.
4. **Captures a pre-sign intent snapshot** — records the expected source
   account, fee, operation count/types, and time-bounds.
5. **Sends the XDR to the wallet** (Freighter / WalletConnect / Ledger).
6. **Verifies the returned signed XDR** — compares it against the pre-sign
   intent; blocks submission on any structural mismatch.

No payload ever reaches the network without passing all six steps.

---

## Signing pipeline

```
UI page (e.g. post-job/page.tsx)
  │
  ├─ callContract(contractId, method, args)          lib/stellar.ts
  │     │
  │     └─ withContractRetry(submitWriteContract)    lib/contract-retry.ts
  │           │
  │           ├─ 1. guardSigningRequest()            lib/signing-origin-validator.ts
  │           │      origin check  →  WARN / REJECT
  │           │      network check →  REJECT on mismatch
  │           │
  │           ├─ 2. getPublicKey()                   Freighter extension
  │           ├─ 3. server.getAccount(source)        Soroban RPC
  │           ├─ 4. TransactionBuilder.build()
  │           ├─ 5. server.simulateTransaction()     Soroban RPC (preflight)
  │           ├─ 6. rpc.assembleTransaction()
  │           ├─ 7. server.prepareTransaction()
  │           │
  │           ├─ 8. capture TransactionIntent (pre-sign snapshot)
  │           │
  │           ├─ 9. signTransaction(xdr)             wallet signs
  │           │
  │           ├─ 10. TransactionVerifier.verify()    lib/transaction-verifier.ts
  │           │       throws on structural mismatch
  │           │
  │           └─ 11. server.sendTransaction()        Soroban RPC
  │                  poll until SUCCESS / FAILED
  │
  └─ returns TransactionResult { status, hash, data }
```

---

## Origin and domain validation

**File:** `frontend/lib/signing-origin-validator.ts`

### How the allowlist is built

At module load time `buildAllowlist()` constructs a `Set<string>` from three
sources (in order of precedence):

| Source | Example |
|---|---|
| Hard-coded well-known origins | `https://stellarwork.org`, `https://app.stellarwork.org` |
| `NEXT_PUBLIC_ALLOWED_ORIGINS` env var (comma-separated) | `https://preview-42.stellarwork.vercel.app` |
| `window.location.origin` at runtime | `http://localhost:3000` (dev) |

The runtime origin is always trusted so that same-origin requests — the normal
case for any legitimate deployment — are never flagged.

### Decision matrix

| Condition | Decision | Effect |
|---|---|---|
| Origin is in the allowlist | `ALLOWED` | Proceed silently |
| Origin is **not** in the allowlist | `WARN` | Log to console; show `SigningOriginWarning` boundary in UI; do **not** block |
| SSR / `window` unavailable | `REJECT` | Throw — signing must be browser-side only |

### API

```typescript
import {
  validateSigningOrigin,      // OriginValidationResult
  checkNetworkMismatch,       // NetworkMismatchResult
  guardSigningRequest,        // SigningGuardResult — combines both checks
  getCurrentOriginResult,     // convenience: validateSigningOrigin() for current page
  resetAllowlistCache,        // test helper — reset the cached allowlist
} from "@/lib/signing-origin-validator";
```

```typescript
// OriginValidationResult
{
  decision:         "ALLOWED" | "WARN" | "REJECT";
  origin:           string;        // e.g. "https://app.stellarwork.org"
  reason:           string;        // human-readable
  isPlatformOrigin: boolean;
}

// NetworkMismatchResult
{
  mismatch:      boolean;
  appNetwork:    StellarNetwork;   // "testnet" | "futurenet" | "mainnet"
  walletNetwork: StellarNetwork | null;
  message:       string;           // empty when mismatch is false
}

// SigningGuardResult
{
  allowed:       boolean;
  originResult:  OriginValidationResult;
  networkResult: NetworkMismatchResult;
  blockReason:   string;           // empty when allowed is true
}
```

All three functions are also re-exported from `@/lib/stellar` so components
only need a single import.

---

## Network mismatch rejection

`checkNetworkMismatch(appNetwork, walletNetwork)` compares:

- **App network** — `getActiveNetwork()` from `lib/stellar.ts`, which reads
  `localStorage["stellarwork:selected-network"]` (or the
  `NEXT_PUBLIC_NETWORK` env var as a fallback).
- **Wallet network** — `getWalletNetwork()` which calls
  `getNetwork()` from `@stellar/freighter-api` and normalises the result
  via `normalizeFreighterNetwork()`.

When the two differ, `guardSigningRequest` sets `allowed: false` and
`submitWriteContract` throws **before** any RPC call or wallet interaction:

```
Network mismatch: the app is set to Testnet but your wallet is connected to
Mainnet. Switch both to the same network before signing to avoid a failed
transaction.
```

The existing `WalletNetworkWarning` component surfaces the same state in the
persistent header bar, providing a second signal before the user even opens
a transaction form.

---

## Payload structures

All payloads are Soroban `xdr.ScVal[]` arrays built in `frontend/lib/contract.ts`.
Stroops are the smallest Stellar unit: 1 XLM = 10,000,000 stroops.

### post\_job

Posts a new job and escrows the specified amount.

```
callContract(contractId, "post_job", [
  client              address   — wallet G... address (signer / job creator)
  amount              i128      — escrow amount in stroops
  bonus_amount        i128      — optional early-completion bonus in stroops (0 = none)
  description_hash    bytes     — SHA-256 of the plain-text description (32 bytes)
  description_payload_len u32   — byte length of the plain-text description
  deadline            u64       — Unix timestamp in seconds (0 = no deadline)
  token_address       address   — Soroban token contract (C...) or native XLM
  title               bytes     — UTF-8 job title, right-padded to 64 bytes (BytesN<64>)
  category            symbol    — e.g. "development", "design", "writing"
])
```

Returns: `u64` job ID.

**What the user is signing:** an escrow lock of `amount` tokens from their
wallet into the contract. The tokens are not transferred to any counterparty
until the job is approved.

---

### accept\_job

Freelancer accepts an open job.

```
callContract(contractId, "accept_job", [
  freelancer   address   — freelancer G... address
  job_id       u64       — job identifier
])
```

Returns: void. No token transfer occurs at this step.

---

### submit\_work

Freelancer marks work as complete and ready for review.

```
callContract(contractId, "submit_work", [
  freelancer   address
  job_id       u64
])
```

Returns: void.

---

### approve\_work

Client approves the submitted work; escrow is released to the freelancer
(minus the platform fee).

```
callContract(contractId, "approve_work", [
  client   address
  job_id   u64
])
```

Returns: void. Triggers an on-chain token transfer from escrow to the
freelancer.

**What the user is signing:** authorisation for the contract to release the
escrowed tokens. The exact amounts were fixed at `post_job` time and are
visible in the job record.

---

### cancel\_job

Client cancels a job before a freelancer accepts it; escrowed tokens are
returned to the client.

```
callContract(contractId, "cancel_job", [
  client   address
  job_id   u64
])
```

Returns: void.

---

### rate\_job

Rates a completed job. Both parties may call this once.

```
callContract(contractId, "rate_job", [
  caller        address
  job_id        u64
  score         u32       — 1–5
  comment_hash  bytes     — SHA-256 of the comment text (32 bytes); all-zeros = no comment
])
```

Returns: void.

---

### create\_job\_with\_milestones

Posts a job whose total escrow is split across individually releasable
milestones.

```
callContract(contractId, "create_job_with_milestones", [
  client               address
  milestones           vec<MilestoneInput>
  description_hash     bytes    — 32 bytes
  description_payload_len u32
  deadline             u64
  token_address        address
  title                bytes    — 64 bytes padded
  category             symbol
  bonus_amount         i128
])
```

Each `MilestoneInput` is an `ScMap`:

```
{
  description_hash   bytes    — per-milestone 32-byte SHA-256
  amount             i128     — milestone amount in stroops
}
```

Returns: `u64` job ID.

---

### approve\_milestone / complete\_milestone

Release payment for a single milestone by index.

```
callContract(contractId, "approve_milestone", [
  client         address
  job_id         u64
  milestone_id   u32    — zero-based index
])

callContract(contractId, "complete_milestone", [
  client           address
  job_id           u64
  milestone_index  u32
])
```

Both return void and trigger a partial escrow release.

---

### store\_description\_cid

Stores the IPFS CID of a job description on-chain for immutable retrieval.
Called after `post_job` succeeds.

```
callContract(contractId, "store_description_cid", [
  caller           address
  description_hash bytes    — 32-byte SHA-256 (matches the post_job hash)
  cid              bytes    — UTF-8 IPFS CID as bytes
])
```

Returns: void. This call is best-effort — a failure here does not invalidate
the job.

---

## Post-sign verification

**File:** `frontend/lib/transaction-verifier.ts`

After the wallet returns a signed XDR envelope, `TransactionVerifier.verify()`
compares a `TransactionIntent` snapshot (captured immediately before signing)
against the parsed signed transaction.

### TransactionIntent fields

| Field | Check | Failure mode |
|---|---|---|
| `sourceAccount` | Exact string match (case-insensitive) | **Error** — blocks submission |
| `operationCount` | Exact integer match | **Error** — blocks submission |
| `operationTypes[]` | Ordered type-string match | **Error** — blocks submission |
| `fee` | Within ±10% of expected | **Warning** — logged, does not block |
| `timebounds` | Exact min/max match when present | **Warning** — logged, does not block |

Blocking errors throw with the message:

```
Transaction verification failed: <reason>. The signed transaction does not
match what the app requested. If this is unexpected, you may be using a
compromised wallet.
```

---

## PayloadScope UI type

**File:** `frontend/components/TransactionPreview.tsx`

`PayloadScope` is passed as a prop to `TransactionPreview` and renders a
"What you are signing" summary panel above the fee estimate. This gives users
a human-readable summary of the operation before the Freighter prompt appears.

```typescript
export interface PayloadScope {
  /** Short name of the operation, e.g. "Post job", "Accept job". */
  operation: string;
  /** Amount with symbol, e.g. "10 XLM". */
  amount?: string;
  /** Recipient address — client for post_job, freelancer for approve_work. */
  recipient?: string;
  /** Deadline date string, e.g. "2026-12-01". */
  deadline?: string;
  /** Job title. */
  jobTitle?: string;
  /** Contract method name, e.g. "post_job". */
  contractMethod?: string;
}
```

All fields are optional. Only fields with a value are rendered, so callers only
need to supply what is relevant for their operation.

### Example (post-job page)

```tsx
<TransactionPreview
  operation="Post job"
  details={`${amount} XLM escrow + 2.5% platform fee on completion`}
  simulation={feeEstimate ? feeEstimateToSimulation(feeEstimate) : null}
  simulating={estimating}
  payloadScope={{
    operation: "Post job",
    contractMethod: "post_job",
    jobTitle: title,
    amount: `${amount} XLM`,
    recipient: wallet,          // client address
    deadline: deadline,
  }}
/>
```

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_ALLOWED_ORIGINS` | `""` | Comma-separated additional trusted origins for origin validation. The current `window.location.origin` and the hard-coded `stellarwork.org` domains are always trusted. |
| `NEXT_PUBLIC_NETWORK` | `"testnet"` | Active Stellar network. Controls the network passphrase used in signing. |
| `NEXT_PUBLIC_CONTRACT_ID` | — | Deployed escrow contract address. |
| `NEXT_PUBLIC_CONTRACT_ID_TESTNET` | — | Per-network override. |
| `NEXT_PUBLIC_CONTRACT_ID_MAINNET` | — | Per-network override. |

---

## Adding a new contract method

1. **Add the payload builder** in `lib/contract.ts` following the pattern of
   `buildPostJobArgs`. Export it so the fee estimator can simulate with the
   same args.

2. **Add the contract call function** in `lib/contract.ts`:
   ```typescript
   export async function myMethod(caller: string, jobId: string) {
     return callContract(getActiveContractId(), "my_method", [
       nativeToScVal(caller, { type: "address" }),
       nativeToScVal(jobId, { type: "u64" }),
     ]);
   }
   ```

3. **Pass a `PayloadScope`** to `TransactionPreview` in the page that triggers
   the method. Fill in `operation`, `contractMethod`, and any fields relevant
   to the user's action (amount if tokens move, recipient if there is a
   counterparty).

4. **Document the payload** in the [Payload structures](#payload-structures)
   section above, following the existing format (ScVal type, semantics, what
   the user is signing).

5. `guardSigningRequest` and `TransactionVerifier` apply automatically to all
   `callContract` calls — no additional wiring is needed.
