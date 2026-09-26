# Integrator Guide

This guide is for applications that consume the StellarWork contract programmatically. It covers the Soroban transaction lifecycle, the repository's typed wrapper, job lifecycle examples, wallet signing, errors, fees, and RPC operational limits.

## Choose an integration surface

There are two useful layers:

| Layer | Use it when | Source of truth |
| --- | --- | --- |
| Direct Soroban SDK | You own the client or run a backend/indexer | `@stellar/stellar-sdk` and the contract ABI |
| StellarWork wrapper | You are integrating the repository frontend or a fork | [`frontend/lib/contract.ts`](../frontend/lib/contract.ts) and [`frontend/lib/stellar.ts`](../frontend/lib/stellar.ts) |

The wrapper is an application library, not a separately published npm package. It resolves the active contract ID, encodes `ScVal` arguments, simulates transactions, asks Freighter to sign, submits to Soroban RPC, and polls for a terminal result.

## Prerequisites

- A contract ID for the selected network. Do not mix a contract ID and network passphrase from different networks.
- A funded Stellar account for writes. Read-only simulations can use a dummy source account.
- `@stellar/stellar-sdk` 15 or later for direct integrations.

```bash
npm install @stellar/stellar-sdk
```

The repository's network defaults are:

| Network | Soroban RPC | Network passphrase |
| --- | --- | --- |
| Testnet | `https://soroban-testnet.stellar.org` | `Test SDF Network ; September 2015` |
| Futurenet | `https://rpc-futurenet.stellar.org` | `Test SDF Future Network ; October 2022` |
| Mainnet | `https://mainnet.sorobanrpc.com` | `Public Global Stellar Network ; September 2015` |

Use the deployment-specific contract IDs in [`docs/environments.md`](./environments.md).

## Contract ABI and payloads

The current legacy `post_job` entry point has this ABI:

```text
post_job(
  client: Address,
  amount: i128,
  desc_hash: BytesN<32>,
  description_payload_len: u32,
  deadline: u64,
  token: Address,
) -> u64
```

`amount` is the escrow amount in the token's smallest unit. For XLM, one XLM is 10,000,000 stroops. `deadline` is a Unix timestamp in seconds; pass `0` for no deadline. `desc_hash` is the SHA-256 digest of the off-chain description, and `description_payload_len` is its UTF-8 byte length, not its character count. The token must be allowlisted and the payload length must be greater than zero and no greater than `get_desc_payload_max()`.

The contract also exposes newer entry points such as `post_job_with_categories`, `create_job_with_milestones`, and `post_job_with_referral`. Check the deployed contract's generated ABI before calling those methods; their argument lists are not interchangeable with the legacy `post_job` entry point.

## Direct SDK setup

```ts
import {
  Account,
  BASE_FEE,
  Contract,
  Networks,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const CONTRACT_ID = "C...";
const server = new rpc.Server("https://soroban-testnet.stellar.org");
const contract = new Contract(CONTRACT_ID);
const networkPassphrase = Networks.TESTNET;

const readonlySource =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
```

### Read a job

Reads are simulations: they do not require a wallet signature and do not spend stroops.

```ts
export async function getJob(jobId: string) {
  const account = new Account(readonlySource, "0");
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call("get_job", nativeToScVal(jobId, { type: "u64" })),
    )
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error);
  }
  return scValToNative(simulation.result!.retval);
}
```

The wrapper returns the same shape as the [`Job`](../frontend/lib/types.ts) type: `client`, nullable `freelancer`, string-valued integer fields such as `amount` and `deadline`, `description_hash`, `status`, `created_at`, `token`, and `revision_count`. Statuses are `Open`, `InProgress`, `SubmittedForReview`, `Completed`, `Cancelled`, and `Disputed`.

For lists, prefer `get_jobs_batch(start, limit)` over one `get_job` simulation per row. This reduces RPC traffic and avoids unnecessary provider throttling.

## Wallet signing and transaction submission

Every mutating call must be authorized by the address passed as the caller argument. A safe write flow is:

1. Build a transaction with the correct network passphrase.
2. Simulate it and stop if simulation returns an error.
3. Assemble and prepare the transaction so Soroban resource fees are attached.
4. Present the prepared XDR to the wallet for signing.
5. Deserialize the signed XDR, submit it with `sendTransaction`, and retain the returned hash.
6. Poll `getTransaction(hash)` until `SUCCESS` or `FAILED`.

Never send a private key to an integration server or ask a wallet to sign an unprepared transaction. A browser integration can pass the prepared XDR to Freighter:

```ts
import { signTransaction } from "@stellar/freighter-api";

const signed = await signTransaction(prepared.toXDR(), {
  networkPassphrase,
});
if ("error" in signed && signed.error) throw new Error(signed.error);
const signedXdr = "signedTxXdr" in signed ? signed.signedTxXdr : signed;
```

The repository wrapper exposes the same lifecycle through `callContract()`. Its default behavior is simulation, preparation, Freighter signing, submission, three-second confirmation polling, and a 30-second polling timeout. The public wrapper functions accept decimal strings for `i128` and `u64` values so large amounts and IDs are not rounded by JavaScript `number` arithmetic.

## Quick start: post, accept, submit, approve

The following direct SDK helper builds the current seven-argument `post_job` payload. Keep the description bytes used for hashing and the length field from the same value.

```ts
import { createHash } from "node:crypto";

function descriptionPayload(description: string) {
  const bytes = Buffer.from(description, "utf8");
  return {
    hash: new Uint8Array(createHash("sha256").update(bytes).digest()),
    length: bytes.byteLength,
  };
}

async function postJob(
  client: string,
  amount: string,
  description: string,
  deadline: string,
  token: string,
  signPreparedXdr: (xdr: string) => Promise<string>,
) {
  const payload = descriptionPayload(description);
  return invoke(
    "post_job",
    [
      nativeToScVal(client, { type: "address" }),
      nativeToScVal(amount, { type: "i128" }),
      nativeToScVal(payload.hash, { type: "bytes" }),
      nativeToScVal(payload.length, { type: "u32" }),
      nativeToScVal(deadline, { type: "u64" }),
      nativeToScVal(token, { type: "address" }),
    ],
    client,
    signPreparedXdr,
  );
}

async function acceptJob(
  freelancer: string,
  jobId: string,
  signPreparedXdr: (xdr: string) => Promise<string>,
) {
  return invoke(
    "accept_job",
    [
      nativeToScVal(freelancer, { type: "address" }),
      nativeToScVal(jobId, { type: "u64" }),
    ],
    freelancer,
    signPreparedXdr,
  );
}

async function submitWork(
  freelancer: string,
  jobId: string,
  signPreparedXdr: (xdr: string) => Promise<string>,
) {
  return invoke(
    "submit_work",
    [
      nativeToScVal(freelancer, { type: "address" }),
      nativeToScVal(jobId, { type: "u64" }),
    ],
    freelancer,
    signPreparedXdr,
  );
}

async function approveWork(
  client: string,
  jobId: string,
  signPreparedXdr: (xdr: string) => Promise<string>,
) {
  return invoke(
    "approve_work",
    [
      nativeToScVal(client, { type: "address" }),
      nativeToScVal(jobId, { type: "u64" }),
    ],
    client,
    signPreparedXdr,
  );
}
```

`invoke` in the example is the build, simulate, prepare, sign, submit, and poll helper described above. A complete integration persists the returned job ID from `post_job`, then passes that exact ID through the remaining lifecycle:

```ts
const jobId = await postJob(client, "100000000", description, "0", token, sign);
await acceptJob(freelancer, String(jobId), sign);
await submitWork(freelancer, String(jobId), sign);
await approveWork(client, String(jobId), sign);
```

With the repository wrapper, the equivalent calls are:

```ts
import { acceptJob, approveWork, postJob, submitWork } from "@/lib/contract";

await postJob(client, amount, bonusAmount, hashHex, payloadByteLength, deadline, token, title, category);
await acceptJob(freelancer, jobId);
await submitWork(freelancer, jobId);
await approveWork(client, jobId);
```

The wrapper's `postJob` shape is versioned application code. Verify that its argument encoder matches the ABI of the deployed contract before using it; when the contract changes, update [`buildPostJobArgs`](../frontend/lib/contract.ts) and its integration tests together with the deployment.

## Error handling

Simulation errors should be handled before asking the user to sign. Contract errors appear as Soroban errors such as `Error(Contract, #3)`. Use the authoritative catalogue in [`frontend/lib/contract-errors.ts`](../frontend/lib/contract-errors.ts) or [`docs/contract-error-messages.md`](./contract-error-messages.md) to map codes to actions. Common lifecycle failures include:

| Code | Meaning | Typical response |
| ---: | --- | --- |
| 1 | Job not found | Refresh the job list or recover the correct ID |
| 2 | Unauthorized caller | Sign with the client or assigned freelancer wallet |
| 3 | Invalid current status | Re-read the job before retrying |
| 8 / 47 | Token is not allowed | Select a token returned by `is_token_allowed` |
| 11 | Amount is invalid | Send a positive smallest-unit amount |
| 12 / 17 | Description is invalid or too large | Recompute the non-zero UTF-8 payload hash and length |
| 14 | Deadline is invalid | Use a future Unix timestamp or `0` |

Do not blindly retry a contract rejection: the transaction will not become valid without changing its inputs or state. Retry transient RPC failures such as timeouts, `429`, `503`, and resource-limit responses with exponential backoff. The repository defaults are three attempts with 1s, 2s, and 4s backoffs, plus a circuit breaker after five consecutive failures.

## Rate limits and batching

There is no protocol-level StellarWork API-key quota. Limits come from the RPC provider, the network, and the application layer:

- The repository UI limits local job-post attempts to five per rolling hour per browser storage. This is a user-experience guard, not a contract security boundary; server integrations must add their own abuse control.
- Treat HTTP 429 and 503 responses as transient. Honor provider `Retry-After` when present and use bounded exponential backoff.
- Cache immutable or terminal job data, and use `get_jobs_batch` for list views.
- Poll a submitted transaction every three seconds by default and stop after a bounded timeout. A timeout is not proof that the transaction failed; inspect the hash before submitting an equivalent replacement.
- For event consumers, use the contract's sequenced `get_events(from_seq, limit)` cursor and persist the next sequence. Reject a zero or oversized page limit; the contract reports `InvalidPageLimit`.

## Fee estimates and gas terminology

Soroban does not have one EVM-style gas number. The fee includes the classic base fee, the simulated resource fee, and any applicable rent. Read-only simulations are not submitted and cost no stroops. For writes, always simulate and assemble instead of hardcoding a resource fee:

```ts
const simulation = await server.simulateTransaction(transaction);
if (rpc.Api.isSimulationError(simulation)) throw new Error(simulation.error);
const assembled = rpc.assembleTransaction(transaction, simulation).build();
const prepared = await server.prepareTransaction(assembled);
```

The repository's [`estimateTransactionFee`](../frontend/lib/fee-estimator.ts) reports `baseFeeStroops`, `resourceFeeStroops`, `totalFeeStroops`, an XLM conversion, and an optional recent-fee comparison. It uses the RPC's `minResourceFee`; it does not predict token escrow or the platform fee. The current benchmark guide gives approximate CPU and ledger-resource baselines, but live simulation is the value to show users before signing.

## Sample integration checklist

1. Select a network and load its contract ID and passphrase together.
2. Check `is_token_allowed` and `get_desc_payload_max` before posting.
3. Hash the exact UTF-8 description bytes and store the description off-chain if it is not otherwise available to the consumer.
4. Build and simulate the transaction; display the live fee estimate.
5. Ask the appropriate wallet to sign the prepared XDR.
6. Submit once, persist the hash, and poll or resume by hash after a timeout.
7. Re-read the job after every lifecycle transition and index events by cursor.
8. Map contract codes with the shared error catalogue and separate them from retryable transport errors.

## Keeping this guide in sync

When a contract method, argument type, status, limit, or error changes, update these together:

- [`contracts/escrow/src/lib.rs`](../contracts/escrow/src/lib.rs), the ABI source;
- [`frontend/lib/contract.ts`](../frontend/lib/contract.ts), argument encoding;
- [`frontend/lib/types.ts`](../frontend/lib/types.ts), returned TypeScript types;
- [`frontend/lib/contract-errors.ts`](../frontend/lib/contract-errors.ts), error mapping;
- [`docs/contract-reference.md`](./contract-reference.md) and [`docs/contract-error-messages.md`](./contract-error-messages.md), reference tables;
- [`docs/api/openapi.yaml`](./api/openapi.yaml), if the API specification covers the changed method;
- this guide and the contract/frontend integration tests.

Run the contract-error drift tests and a testnet happy-path transaction before publishing a changed integration example.
