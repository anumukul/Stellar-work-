# Frontend-Contract Interaction Guide

This guide explains how the StellarWork frontend communicates with the Soroban smart contract, covering the contract API layer, Soroban Value (ScVal) encoding, the transaction lifecycle, error handling, and event processing.

## Overview

All contract interaction flows through two main files:

- **`frontend/lib/contract.ts`**: High-level, typed wrappers around individual contract methods
- **`frontend/lib/stellar.ts`**: Low-level transaction building, signing, and submission

This separation allows pages to call simple async functions (e.g., `postJob()`) without needing to understand Soroban's RPC protocol or transaction lifecycle.

---

## Contract.ts API Reference

The `contract.ts` file exports typed async functions that correspond to Soroban contract methods. Each function handles argument encoding and delegates to `callContract()` in `stellar.ts`.

### Getting the Active Contract ID

```typescript
function getActiveContractId(): string
```

Returns the contract ID for the currently persisted network. Falls back to the configured `NEXT_PUBLIC_CONTRACT_ID` environment variable if no network-specific ID is found. Required by all contract functions.

**Usage:**
```typescript
// Called internally by all exported functions
const contractId = getActiveContractId();
```

### Job Lifecycle Functions

#### `postJob()`

```typescript
export async function postJob(
  client: string,
  amount: string,
  descHashHex: string,
  descriptionPayloadLen: number,
  deadline: string,
  tokenAddress: string
)
```

Creates a new job and transfers escrow to the contract.

**Parameters:**
- `client`: Stellar address of the job creator (will be required to authenticate via Freighter)
- `amount`: Job payment in stroops (the token's smallest unit) as a string to preserve precision
- `descHashHex`: SHA-256 hash of the job description as a 64-character hex string (0x-prefixed or not)
- `descriptionPayloadLen`: Byte length of the description payload (validated by contract)
- `deadline`: Unix epoch timestamp as a string; use `0` for no deadline
- `tokenAddress`: Stellar token contract address (must be whitelisted)

**Returns:** Promise resolving to a `TransactionResult` object.

**Encoding:**
- `client` → `nativeToScVal(..., { type: "address" })`
- `amount` → `nativeToScVal(..., { type: "i128" })`
- `descHashHex` → hex string decoded via `hexToBytes()`, then `nativeToScVal(..., { type: "bytes" })`
- `descriptionPayloadLen` → `nativeToScVal(..., { type: "u32" })`
- `deadline` → `nativeToScVal(..., { type: "u64" })`
- `tokenAddress` → `nativeToScVal(..., { type: "address" })`

**Example:**
```typescript
import { postJob } from "@/lib/contract";

const result = await postJob(
  "GCDO3JYKXMXN3CBZC5K2NCTPPGZSHQJ3QZGGUXD3IPRQRZ7CDNFM5K4",
  "100000000", // 10 XLM in stroops
  "a1b2c3d4...e5f6g7h8", // 64-char SHA-256 hex
  256, // description is 256 bytes
  "1735689600", // Jan 1, 2025
  "CAQUYCCGBNKRVMFGCSRVV6P2IGWKGQK5LVWSM4Q5XZVVXAFSUFDZQAAA"
);

if (result.status === "SUCCESS") {
  console.log("Job created with hash:", result.hash);
}
```

---

#### `acceptJob()`

```typescript
export async function acceptJob(freelancer: string, jobId: string)
```

Freelancer accepts an open job. Transitions job from `Open` to `InProgress`.

**Parameters:**
- `freelancer`: Stellar address of the freelancer
- `jobId`: Job ID (string, converted to u64)

**Encoding:**
- `freelancer` → address type
- `jobId` → u64 type

**Example:**
```typescript
import { acceptJob } from "@/lib/contract";

const result = await acceptJob(
  "GBYZ2DFG3M2D4XLMCBSRYEPG4WKCDSQF5DF7XWC52NIDVMDHVZ7ZKZZ",
  "42"
);
```

---

#### `submitWork()`

```typescript
export async function submitWork(freelancer: string, jobId: string)
```

Freelancer marks job work as submitted for review. Transitions from `InProgress` to `SubmittedForReview`.

**Parameters:**
- `freelancer`: Freelancer address
- `jobId`: Job ID

**Example:**
```typescript
await submitWork(walletAddress, jobId);
```

---

#### `approveWork()`

```typescript
export async function approveWork(client: string, jobId: string)
```

Client approves submitted work. Deducts platform fee and releases payment to freelancer. Transitions to `Completed`.

**Parameters:**
- `client`: Client address
- `jobId`: Job ID

**Example:**
```typescript
await approveWork(walletAddress, jobId);
```

---

#### `cancelJob()`

```typescript
export async function cancelJob(client: string, jobId: string)
```

Client cancels an open job. Refunds escrow to client. Only works for `Open` status jobs.

**Parameters:**
- `client`: Client address
- `jobId`: Job ID

**Example:**
```typescript
await cancelJob(walletAddress, jobId);
```

---

#### `freelancerCancelJob()`

```typescript
export async function freelancerCancelJob(freelancer: string, jobId: string)
```

Freelancer cancels an in-progress job. Returns escrow to client.

**Parameters:**
- `freelancer`: Freelancer address
- `jobId`: Job ID

**Example:**
```typescript
await freelancerCancelJob(walletAddress, jobId);
```

---

### Query Functions (Read-Only)

Query functions do not modify contract state and do not require signing. They are called with the `{ readOnly: true }` option.

#### `getJob()`

```typescript
export async function getJob(jobId: string): Promise<Job | null>
```

Fetches a job by ID.

**Returns:** `Job` struct or `null` if not found.

**Example:**
```typescript
const job = await getJob("42");
if (job) {
  console.log("Job status:", job.status); // e.g., "InProgress"
}
```

---

#### `getJobCount()`

```typescript
export async function getJobCount(): Promise<number>
```

Returns the total number of jobs ever created.

**Example:**
```typescript
const total = await getJobCount();
```

---

#### `getMilestones()`

```typescript
export async function getMilestones(jobId: string): Promise<Milestone[] | null>
```

Fetches all milestones for a job. Returns `null` if the job has no milestones (i.e., it is a regular job, not milestone-based).

**Note:** Regular jobs do not have milestones. The contract raises a panic for jobs without milestone data; this function catches the error and returns `null`.

**Example:**
```typescript
const milestones = await getMilestones("42");
if (milestones) {
  milestones.forEach((m) => console.log(`Milestone ${m.id}: ${m.amount} stroops`));
}
```

---

#### `getFees()`

```typescript
export async function getFees(tokenAddress: string): Promise<number>
```

Returns accrued platform fees for a specific token.

**Example:**
```typescript
const fees = await getFees(tokenAddress);
```

---

#### `isTokenAllowed()`

```typescript
export async function isTokenAllowed(tokenAddress: string): Promise<boolean>
```

Checks if a token is in the allowed whitelist.

**Example:**
```typescript
const allowed = await isTokenAllowed("CAQUYCCGBNKRVMFGCSRVV6P2IGWKGQK5LVWSM4Q5XZVVXAFSUFDZQAAA");
```

---

#### `getNativeToken()`

```typescript
export async function getNativeToken(): Promise<string>
```

Returns the native token address configured at contract initialization.

**Example:**
```typescript
const nativeToken = await getNativeToken();
```

---

### Milestone Functions

#### `createJobWithMilestones()`

```typescript
export async function createJobWithMilestones(
  client: string,
  milestones: MilestoneInput[],
  descHashHex: string,
  descriptionPayloadLen: number,
  deadline: string,
  tokenAddress: string
)
```

Creates a job whose payment is split across multiple milestones.

**Parameters:**
- `client`: Client address
- `milestones`: Array of `MilestoneInput` objects, each with:
  - `descriptionHashHex`: 64-char SHA-256 hex for the milestone description
  - `amount`: Milestone payment in stroops (as string)
- `descHashHex`: Overall job description hash
- `descriptionPayloadLen`: Payload length of overall description
- `deadline`: Deadline for the entire job
- `tokenAddress`: Token address

**Encoding Note:**
Milestones are encoded as a `Vec<ScVal>` where each element is a struct (map) with `description_hash` (bytes) and `amount` (i128) keys.

```typescript
const encodedMilestones = xdr.ScVal.scvVec(
  milestones.map((m) =>
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("description_hash"),
        val: nativeToScVal(hexToBytes(m.descriptionHashHex), { type: "bytes" }),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("amount"),
        val: nativeToScVal(m.amount, { type: "i128" }),
      }),
    ])
  )
);
```

**Example:**
```typescript
const result = await createJobWithMilestones(
  walletAddress,
  [
    { descriptionHashHex: "aaa...aaa", amount: "50000000" },
    { descriptionHashHex: "bbb...bbb", amount: "50000000" },
  ],
  "ccc...ccc", // overall job description hash
  512,
  "1735689600",
  tokenAddress
);
```

---

#### `approveMilestone()`

```typescript
export async function approveMilestone(client: string, jobId: string, milestoneId: number)
```

Releases payment for a single milestone. Only the client can call this.

**Parameters:**
- `client`: Client address
- `jobId`: Job ID
- `milestoneId`: Milestone index (0-based)

**Example:**
```typescript
await approveMilestone(walletAddress, jobId, 0);
```

---

### Admin Functions

#### `addAllowedToken()`

```typescript
export async function addAllowedToken(tokenAddress: string)
```

Adds a token to the whitelist. Admin-only.

**Example:**
```typescript
import { addAllowedToken } from "@/lib/contract";

await addAllowedToken("CAQUYCCGBNKRVMFGCSRVV6P2IGWKGQK5LVWSM4Q5XZVVXAFSUFDZQAAA");
```

---

#### `removeAllowedToken()`

```typescript
export async function removeAllowedToken(tokenAddress: string)
```

Removes a token from the whitelist. Admin-only.

---

#### `withdrawFees()`

```typescript
export async function withdrawFees(tokenAddress: string)
```

Withdraws accumulated platform fees. Admin-only.

**Example:**
```typescript
await withdrawFees(tokenAddress);
```

---

#### `setTrustedForwarder()`

```typescript
export async function setTrustedForwarder(forwarder: string, isTrusted: boolean)
```

Marks an address as a trusted forwarder for gasless relay operations. Admin-only.

---

### Access Control Functions

#### `setWhitelistMode()`

```typescript
export async function setWhitelistMode(admin: string, enabled: boolean)
```

Enables or disables whitelist-only access. Admin-only.

---

#### `isWhitelisted()`

```typescript
export async function isWhitelisted(address: string): Promise<boolean>
```

Checks if an address is on the whitelist.

---

#### `addToWhitelist()`

```typescript
export async function addToWhitelist(admin: string, address: string)
```

Adds an address to the whitelist. Admin-only.

---

#### `removeFromWhitelist()`

```typescript
export async function removeFromWhitelist(admin: string, address: string)
```

Removes an address from the whitelist. Admin-only.

---

#### `isBlacklisted()`

```typescript
export async function isBlacklisted(address: string): Promise<boolean>
```

Checks if an address is blacklisted.

---

#### `addToBlacklist()`

```typescript
export async function addToBlacklist(admin: string, address: string)
```

Adds an address to the blacklist. Admin-only.

---

#### `removeFromBlacklist()`

```typescript
export async function removeFromBlacklist(admin: string, address: string)
```

Removes an address from the blacklist. Admin-only.

---

### Dispute Resolution

#### `raiseDispute()`

```typescript
export async function raiseDispute(caller: string, jobId: string)
```

Either the client or freelancer raises a dispute. Transitions job to `Disputed` status.

**Example:**
```typescript
await raiseDispute(walletAddress, jobId);
```

---

#### `resolveDispute()`

```typescript
export async function resolveDispute(jobId: string, clientBps: number)
```

Admin resolves a disputed job. Distributes funds based on `clientBps` (client's share in basis points, 0–10,000).

**Parameters:**
- `jobId`: Job ID
- `clientBps`: Basis points (0–10,000) of the escrow awarded to the client

**Encoding:**
The `clientBps` is wrapped in a `Vec<ScVal>` as an optional parameter:
```typescript
xdr.ScVal.scvVec([nativeToScVal(clientBps, { type: "u32" })])
```

**Example:**
```typescript
// Award 50% to client, 50% to freelancer (minus platform fee)
await resolveDispute(jobId, 5000);
```

---

#### `resolveDisputeSplit()`

```typescript
export async function resolveDisputeSplit(jobId: string, clientPayoutBps: number)
```

Alternative dispute resolution that accepts client payout in basis points directly.

---

### Deadline Extensions

#### `extendDeadline()`

```typescript
export async function extendDeadline(
  client: string,
  jobId: string,
  newDeadline: string,
  freelancerConsent?: string
)
```

Extends the job deadline. If `freelancerConsent` is provided, the freelancer's consent is embedded in the transaction.

**Encoding:**
If consent is provided, it is wrapped in a `Vec` containing the freelancer address as a symbol. Otherwise, an empty `Vec` is sent.

---

#### `enforceDeadline()`

```typescript
export async function enforceDeadline(client: string, jobId: string)
```

Client enforces a passed deadline on an in-progress job. Cancels the job and returns escrow.

---

#### `extendJobTtl()`

```typescript
export async function extendJobTtl(caller: string, jobId: string)
```

Extends the storage TTL (time-to-live) for a job. This prevents the job from being archived by Soroban's storage system.

---

### Description Storage

#### `storeDescriptionCid()`

```typescript
export async function storeDescriptionCid(
  caller: string,
  descHashHex: string,
  cid: string
)
```

Stores an IPFS CID mapping for a description hash on-chain.

**Parameters:**
- `caller`: Address making the call
- `descHashHex`: 64-char SHA-256 hex of the description
- `cid`: IPFS CID string

**Encoding:**
- `descHashHex` → hex string decoded to bytes
- `cid` → `nativeToScVal(..., { type: "string" })`

**Example:**
```typescript
await storeDescriptionCid(
  walletAddress,
  "a1b2c3...d4e5f6",
  "QmXxxx...xxxxx"
);
```

---

#### `getDescriptionCid()`

```typescript
export async function getDescriptionCid(descHashHex: string): Promise<string | null>
```

Retrieves the IPFS CID for a description hash. Returns `null` if not found or empty.

---

### Batch Operations

#### `batchApproveJobs()`

```typescript
export async function batchApproveJobs(client: string, jobIds: string[])
```

Approves multiple jobs in a single transaction.

**Encoding:**
Job IDs are encoded as a vector of u64 values:
```typescript
nativeToScVal(jobIds.map((id) => nativeToScVal(id, { type: "u64" })), { type: "vec" })
```

---

### Admin Job Views

#### `adminGetAllJobs()`

```typescript
export async function adminGetAllJobs(
  admin: string,
  startIndex: number,
  limit: number
): Promise<Job[]>
```

Retrieves a batch of all jobs. Admin-only (requires admin authorization).

**Example:**
```typescript
const jobs = await adminGetAllJobs(adminAddress, 0, 20);
```

---

#### `adminGetJobsByStatus()`

```typescript
export async function adminGetJobsByStatus(
  admin: string,
  status: string,
  startIndex: number,
  limit: number
): Promise<Job[]>
```

Retrieves jobs by status. The `status` string is converted to a Soroban symbol via `nativeToScVal(..., { type: "symbol" })`.

**Valid statuses:** `"Open"`, `"InProgress"`, `"SubmittedForReview"`, `"Completed"`, `"Cancelled"`, `"Disputed"`

**Example:**
```typescript
const inProgressJobs = await adminGetJobsByStatus(admin, "InProgress", 0, 20);
```

---

#### `adminGetJobCount()`

```typescript
export async function adminGetJobCount(admin: string): Promise<number>
```

Returns total job count. Admin-only.

---

---

## ScVal Encoding Patterns

This section documents how the frontend converts between JavaScript/TypeScript values and Soroban's native type representation (ScVal).

### Overview

Soroban contract functions accept arguments as `xdr.ScVal[]` — an array of Soroban values. The `nativeToScVal()` function from `@stellar/stellar-sdk` converts JavaScript types to ScVal, given a type descriptor.

The `callContract()` function in `stellar.ts` then packages these ScVal arguments into a transaction.

### Type Mapping

All type conversions happen in `contract.ts` using `nativeToScVal()` from the Stellar SDK:

```typescript
import { nativeToScVal, xdr } from "@/lib/stellar";
```

#### Primitive Types

| JavaScript Type | Type Descriptor | Example |
|-----------------|-----------------|---------|
| `string` (address) | `{ type: "address" }` | Stellar account address |
| `string` (number) | `{ type: "i128" }` | Job amount in stroops |
| `number` | `{ type: "u32" }` | Description payload length |
| `number` | `{ type: "u64" }` | Deadline (Unix timestamp) |
| `boolean` | `{ type: "bool" }` | Enable/disable flag |
| `string` | `{ type: "symbol" }` | Job status enum variant |
| `string` | `{ type: "string" }` | IPFS CID, description text |
| `Uint8Array` | `{ type: "bytes" }` | SHA-256 hash bytes |

**Example:**
```typescript
nativeToScVal("GCDO3JYK...", { type: "address" })         // → ScVal address
nativeToScVal("100000000", { type: "i128" })              // → ScVal i128
nativeToScVal(256, { type: "u32" })                       // → ScVal u32
nativeToScVal("1735689600", { type: "u64" })              // → ScVal u64
nativeToScVal(true, { type: "bool" })                     // → ScVal bool
nativeToScVal("Open", { type: "symbol" })                 // → ScVal symbol
nativeToScVal("Qm...", { type: "string" })                // → ScVal string
nativeToScVal(hexToBytes("a1b2c3..."), { type: "bytes" }) // → ScVal bytes
```

### Complex Types

#### Vectors (Arrays)

A vector of values is encoded as:
```typescript
nativeToScVal(values, { type: "vec" })
```

where `values` is an array of pre-encoded `ScVal` objects.

**Example: Vector of u64 (job IDs):**
```typescript
const jobIds = ["1", "2", "3"];
const encoded = nativeToScVal(
  jobIds.map((id) => nativeToScVal(id, { type: "u64" })),
  { type: "vec" }
);
```

This is used in `batchApproveJobs()` to encode an array of job IDs.

#### Maps (Structs)

Complex types like milestones are encoded as maps using `xdr.ScVal.scvMap()`:

```typescript
xdr.ScVal.scvMap([
  new xdr.ScMapEntry({
    key: xdr.ScVal.scvSymbol("field_name"),
    val: nativeToScVal(value, { type: "field_type" }),
  }),
  // ... more fields
])
```

**Example: Milestone struct:**
```typescript
xdr.ScVal.scvMap([
  new xdr.ScMapEntry({
    key: xdr.ScVal.scvSymbol("description_hash"),
    val: nativeToScVal(hexToBytes(descHashHex), { type: "bytes" }),
  }),
  new xdr.ScMapEntry({
    key: xdr.ScVal.scvSymbol("amount"),
    val: nativeToScVal(amountStr, { type: "i128" }),
  }),
])
```

This pattern is used in `createJobWithMilestones()` to encode each milestone as a struct.

#### Optional Types

Optional types (Rust `Option<T>`) are encoded as a vector that is either empty (None) or contains a single ScVal (Some).

**Example: Optional freelancer consent in `extendDeadline()`:**
```typescript
// With consent (Some)
xdr.ScVal.scvVec([nativeToScVal(freelancerAddress, { type: "address" })])

// Without consent (None)
xdr.ScVal.scvVec([])
```

#### Enums

Enums are encoded as symbols (for unit variants) or as tagged unions for variants with data.

**Example: Job status enum:**
```typescript
// For "Open", "InProgress", etc., use symbol encoding:
nativeToScVal("Open", { type: "symbol" })
nativeToScVal("InProgress", { type: "symbol" })
```

In `adminGetJobsByStatus()`, the status string is converted to a symbol to match the contract's `JobStatus` enum.

### Hex-to-Bytes Helper

The `hexToBytes()` utility converts hex strings to `Uint8Array` for use with the `bytes` type:

```typescript
export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex input.");
  }
  if (!/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error("Invalid hex input.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}
```

**Usage:**
```typescript
const hashBytes = hexToBytes("a1b2c3d4e5f6g7h8..."); // → Uint8Array
const encoded = nativeToScVal(hashBytes, { type: "bytes" });
```

---

## Transaction Lifecycle

This section traces the actual end-to-end flow from a page component calling a contract function to final on-chain confirmation.

### Architecture Diagram

```
┌─────────────────────┐
│  Page Component     │
│ (e.g., PostJobPage) │
└──────────┬──────────┘
           │
           │ await postJob(...)
           ↓
┌──────────────────────────────────┐
│  lib/contract.ts                 │
│  (postJob function)              │
│  - Encodes args via nativeToScVal│
│  - Calls callContract()          │
└──────────┬───────────────────────┘
           │
           │ callContract(contractId, method, args)
           ↓
┌─────────────────────────────────────────────┐
│  lib/stellar.ts                             │
│  (callContract function)                    │
│  1. Get account sequence                    │
│  2. Build transaction                       │
│  3. Simulate transaction                    │
│  4. (If write) Assemble + Sign + Submit + Poll
│  5. Return result                           │
└──────────┬────────────────────────────────┘
           │
           │ Soroban RPC Server
           ↓
┌─────────────────────────────────┐
│  Stellar Blockchain             │
│  (Soroban Contract Execution)   │
└─────────────────────────────────┘
```

### Step-by-Step Flow

#### Step 1: Page Component Invokes Contract Function

A page component imports a contract function and calls it with JavaScript values:

```typescript
import { postJob } from "@/lib/contract";

// Inside an async function or event handler:
const result = await postJob(
  walletAddress,      // string
  "100000000",        // string (amount in stroops)
  "a1b2c3...",        // string (64-char hex hash)
  256,                // number (payload length)
  "1735689600",       // string (Unix timestamp)
  tokenAddress        // string (Stellar address)
);
```

#### Step 2: Contract.ts Encodes Arguments

The contract function encodes arguments to ScVal and delegates to `callContract()`:

```typescript
export async function postJob(
  client: string,
  amount: string,
  descHashHex: string,
  descriptionPayloadLen: number,
  deadline: string,
  tokenAddress: string,
) {
  return callContract(getActiveContractId(), "post_job", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(amount, { type: "i128" }),
    nativeToScVal(hexToBytes(descHashHex), { type: "bytes" }),
    nativeToScVal(descriptionPayloadLen, { type: "u32" }),
    nativeToScVal(deadline, { type: "u64" }),
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}
```

#### Step 3: Stellar.ts Determines Operation Type

`callContract()` checks if the call is read-only:

```typescript
export async function callContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  options?: { readOnly?: boolean; pollTimeout?: number },
): Promise<TransactionResult> {
  const server = new rpc.Server(getRpcUrl());
  const networkPassphrase = getNetworkPassphrase();
  const contract = new Contract(contractId);

  // Determine if read-only (no wallet required)
  if (options?.readOnly) {
    // ...read-only flow
  } else {
    // ...write flow requiring Freighter signature
  }
}
```

#### Step 4a: Read-Only Flow

For read-only calls (e.g., `getJob()`, `getFees()`):

1. Create a temporary read-only account (or use the connected wallet if available)
2. Build a transaction
3. Simulate the transaction via RPC
4. Return the simulated result directly (no signing, no submission):

```typescript
if (options?.readOnly) {
  const source = await getPublicKey();
  if (source) {
    account = await server.getAccount(source);
  } else {
    account = new Account(READONLY_SOURCE, "0");
  }

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error);
  }

  const retval = simulation.result?.retval;
  if (!retval) {
    return { status: "ERROR", errorResult: "No return value from simulation" };
  }

  return { status: "SUCCESS", data: scValToNative(retval) };
}
```

**Result extraction:**
- If the contract function returns a value (e.g., a Job struct, a boolean), it is returned as `retval` in the simulation result
- `scValToNative()` converts the ScVal back to a JavaScript object:

```typescript
const job = await getJob("1");
// job is already a JavaScript object: { client: "G...", status: "Open", ... }
```

#### Step 4b: Write Flow

For state-changing calls (e.g., `postJob()`, `acceptJob()`):

**Sub-step 1: Get Account Sequence**

Fetch the current sequence number for the connected wallet:

```typescript
const source = await getPublicKey();
if (!source) {
  throw new Error("Connect Freighter before calling contract.");
}
account = await server.getAccount(source);
```

**Sub-step 2: Build Transaction**

Create a transaction with the contract operation:

```typescript
const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
  .addOperation(contract.call(method, ...args))
  .setTimeout(60)
  .build();
```

The `contract.call()` method (from Stellar SDK) packages the contract address, method name, and arguments into a Soroban `InvokeHostFunction` operation.

**Sub-step 3: Simulate Transaction**

Simulate the transaction to estimate fees and resource usage:

```typescript
const simulation = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(simulation)) {
  throw new Error(simulation.error);
}
```

If simulation fails, the error is thrown immediately. This prevents submitting a transaction that would fail on-chain.

**Sub-step 4: Assemble Transaction**

Use simulation results to populate resource fees:

```typescript
const assembled = rpc.assembleTransaction(tx, simulation).build();
```

This step calculates the actual network fee and resource costs for the contract invocation.

**Sub-step 5: Prepare Transaction**

Prepare the transaction for signing (adds signers and finalizes the envelope):

```typescript
const prepared = await server.prepareTransaction(assembled);
```

**Sub-step 6: Sign via Freighter**

Send the transaction XDR to Freighter for signing:

```typescript
const signedXdr = await signTransaction(prepared.toXDR());

export async function signTransaction(xdrValue: string): Promise<string> {
  const signed = await freighterSignTransaction(xdrValue, {
    networkPassphrase: getNetworkPassphrase(),
  });
  if ("error" in signed && signed.error) {
    throw new Error(signed.error);
  }
  return "signedTxXdr" in signed ? signed.signedTxXdr : signed;
}
```

This prompts the user via the Freighter extension to review and sign the transaction.

**Sub-step 7: Submit Transaction**

Submit the signed transaction to the network:

```typescript
const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
const sent = await server.sendTransaction(signedTx);

if (sent.status === "ERROR") {
  throw new Error(sent.errorResult?.toXDR().toString() ?? "Contract invocation failed.");
}
```

If submission fails, an error is thrown. Otherwise, `sent.status` is either `"PENDING"` or `"SUCCESS"`.

**Sub-step 8: Poll for Confirmation**

If the transaction is pending, poll the RPC for its final status:

```typescript
if (sent.status === "PENDING") {
  const pollTimeout = options?.pollTimeout ?? DEFAULT_POLL_TIMEOUT; // 30s default
  const pollInterval = DEFAULT_POLL_INTERVAL; // 3s
  const startTime = Date.now();

  while (Date.now() - startTime < pollTimeout) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    const status = await server.getTransaction(sent.hash);

    if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { status: "SUCCESS", hash: sent.hash };
    }

    if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
      return { status: "ERROR", hash: sent.hash, errorResult: "Transaction failed." };
    }
  }

  throw new Error(`Transaction timed out after ${pollTimeout}ms. Hash: ${sent.hash}`);
}
```

The default timeout is 30 seconds; most Soroban transactions finalize within 3–6 seconds.

#### Step 5: Return TransactionResult

The function returns a `TransactionResult` object:

```typescript
interface TransactionResult {
  status: "SUCCESS" | "ERROR" | "PENDING";
  hash?: string;          // Transaction hash (for successful submissions)
  errorResult?: string;   // Error message (if failed)
  resultMetaXdr?: string; // Result metadata XDR (if available)
  data?: unknown;         // Return value (for read-only calls)
}
```

**Example handling:**
```typescript
const result = await postJob(...);

if (result.status === "SUCCESS") {
  console.log("Transaction confirmed:", result.hash);
} else if (result.status === "ERROR") {
  console.error("Transaction failed:", result.errorResult);
} else {
  console.warn("Transaction status is pending");
}
```

---

## Error Handling

The contract uses numeric error codes. Errors surface to the frontend either as SDK exceptions during simulation or as transaction failures during submission.

### Contract Error Codes

Errors from the Soroban contract are defined in `contracts/escrow/src/lib.rs`:

| Code | Variant | Description | Common Cause |
|------|---------|-------------|--------------|
| 1 | `AlreadyInitialized` | Contract has been initialized twice | Contract was already set up |
| 2 | `NotInitialized` | Operation on uninitialized contract | Contract not yet initialized |
| 3 | `Unauthorized` | Caller lacks authorization | Wrong wallet address for operation |
| 4 | `JobNotFound` | Job ID does not exist | Invalid job ID |
| 5 | `InvalidJobStatus` | Job is not in the required state | e.g., trying to accept a closed job |
| 6 | `NotJobClient` | Caller is not the job's client | Wrong address |
| 7 | `NotJobFreelancer` | Caller is not the assigned freelancer | Wrong address |
| 8 | `JobAlreadyAccepted` | Job already has a freelancer | Someone already accepted it |
| 9 | `DeadlinePassed` | Deadline has expired | Job deadline was exceeded |
| 10 | `InsufficientFunds` | Not enough token balance | Caller lacks sufficient balance |
| 11 | `InvalidAdmin` | Caller is not the contract admin | Only admin can perform this |
| 12 | `NoFeesToWithdraw` | No accumulated fees to withdraw | Try again after transactions |
| 13 | `TokenNotAllowed` | Token is not whitelisted | Token must be added by admin first |
| 14 | `Blacklisted` | Caller is on the blacklist | Contact admin for removal |
| 15 | `NotWhitelisted` | Caller is not on the whitelist | Contact admin for whitelist approval |
| 16 | `TransferFailed` | Token transfer failed | Check token contract state |
| 17 | `InvalidMilestoneCount` | Wrong number of milestones | Milestone count must match contract expectations |
| 18 | `MilestoneNotFound` | Milestone ID does not exist | Invalid milestone index |
| 19 | `MilestoneAlreadyReleased` | Milestone payment already released | Cannot approve twice |
| 20 | `JobNotDisputed` | Job is not in disputed state | Only disputed jobs can be resolved |
| 21 | `NoMilestones` | Job has no milestones | Only milestone jobs have milestones |
| 22 | `InvalidDisputeSplit` | Invalid dispute resolution split | Client share must be 0–10,000 bps |
| 23 | `NotTrustedForwarder` | Caller is not a trusted forwarder | Must be added via `setTrustedForwarder()` |
| 24 | `AuthorizationFailed` | Authorization check failed | Freighter signature validation failed |
| 25 | `DescriptionTooLong` | Description payload exceeds limit | Check `getDescPayloadMax()` |

### Error Detection Pattern

Errors typically occur at two points:

**1. During Simulation (in `callContract`):**
```typescript
const simulation = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(simulation)) {
  throw new Error(simulation.error);
}
```

If the contract rejects the call (e.g., due to validation), the error is thrown as an exception.

**2. During Submission (in `callContract`):**
```typescript
const sent = await server.sendTransaction(signedTx);

if (sent.status === "ERROR") {
  throw new Error(sent.errorResult?.toXDR().toString() ?? "Contract invocation failed.");
}
```

**3. During Polling (in `callContract`):**
```typescript
if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
  return { status: "ERROR", hash: sent.hash, errorResult: "Transaction failed." };
}
```

### Handling Errors in Page Components

When calling a contract function, wrap the call in a try-catch:

```typescript
import { postJob } from "@/lib/contract";

async function handlePostJob() {
  try {
    const result = await postJob(
      walletAddress,
      amount,
      descHash,
      payloadLen,
      deadline,
      tokenAddress
    );

    if (result.status === "SUCCESS") {
      console.log("Job posted successfully:", result.hash);
      // Update UI, redirect, etc.
    } else if (result.status === "ERROR") {
      console.error("Job posting failed:", result.errorResult);
      // Show error message to user
    }
  } catch (error) {
    console.error("Contract call error:", error);
    // Handle SDK-level errors (simulation failed, signing rejected, etc.)
    if (error instanceof Error) {
      if (error.message.includes("Simulation failed")) {
        // Contract validation failed
      } else if (error.message.includes("signature")) {
        // User rejected Freighter signature
      } else {
        // Other error
      }
    }
  }
}
```

### Wallet-Related Errors

If the wallet is not connected:

```typescript
const source = await getPublicKey();
if (!source) {
  // Show "Connect Wallet" UI
}
```

If Freighter is not installed or permission is denied:

```typescript
const access = await requestAccess();
if (access.error || !access.address) {
  console.error("Wallet connection failed:", access.error);
}
```

---

## Event Handling

**Note:** As of the current codebase version, the frontend does NOT currently implement event listening from the Soroban contract. This is a gap worth addressing in future development.

### Event Emissions in the Contract

The Soroban contract emits events during state transitions. Based on the contract source (`contracts/escrow/src/lib.rs`), the following events are available:

| Event | Topics | Data | Triggers |
|-------|--------|------|----------|
| `init` | `("init",)` | `(admin, native_token)` | Contract initialization |
| `posted` | `("posted",)` | `(job_id, client, desc_hash, amount)` | `post_job()` called |
| `accepted` | `("accepted",)` | `(job_id, client, freelancer, amount)` | `accept_job()` called |
| `wrk_sub` | `("wrk_sub",)` | `(job_id, client, freelancer, amount)` | `submit_work()` called |

(Additional events exist in the contract source but are not fully documented here; refer to the contract source for the complete list.)

### Why Event Listening is Not Implemented

Frontend developers typically listen to contract events for two reasons:

1. **Real-time UI updates** — updating a job status in the UI as soon as the blockchain confirms it
2. **Historical event analysis** — aggregating events to build indices or analytics

The current implementation uses:
- **Polling** for confirmation (via `getTransaction()` in `callContract`)
- **Direct queries** to read current job state (via `getJob()`, `getJobCount()`, etc.)

This is sufficient for the current feature set but means:
- The UI does not update in real-time for events from other users (e.g., another freelancer accepting a job)
- Event-driven applications (e.g., real-time notifications) would require a backend listener or indexer

### Future Event Listening Implementation

If event listening is added in the future, the pattern would be:

```typescript
// Example (not currently implemented):
import { subscribeToContractEvents } from "@/lib/events";

const unsubscribe = await subscribeToContractEvents(contractId, (event) => {
  if (event.type === "job_accepted") {
    const { job_id, freelancer } = event.data;
    console.log(`Job ${job_id} accepted by ${freelancer}`);
    // Update UI
  }
});

// Later: unsubscribe();
```

The Stellar RPC provides `getEvents()` and `subscribeToEvents()` methods that could enable this functionality.

---

## Summary

The frontend interacts with the Soroban smart contract through a well-defined layer:

1. **contract.ts** exposes typed async functions that match contract methods
2. **stellar.ts** handles the low-level transaction lifecycle (build, simulate, sign, submit, poll)
3. **nativeToScVal** encodes JavaScript values into Soroban's ScVal format
4. **Freighter** provides wallet connection and transaction signing
5. **Errors** are surfaced as exceptions or TransactionResult status
6. **Events** are currently not listened to but are available on-chain

For new developers adding features:

- Import contract functions from `lib/contract.ts`
- Call them like regular async functions; they handle signing and submission internally
- Always check the `TransactionResult.status` for write operations
- Wrap calls in try-catch to handle simulation errors and wallet rejections
- Use type hints from `lib/types.ts` (e.g., `Job`, `Milestone`) for contract data
- Refer to `docs/CONTRACT.md` for contract method signatures and semantics
