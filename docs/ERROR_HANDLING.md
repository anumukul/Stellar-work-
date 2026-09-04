# Error Handling Patterns — Contract & Frontend

> **Status:** Documentation fix — consolidates inconsistent error handling across the escrow contract, the frontend catalogue, retry logic, and monitoring.
> **Previously scattered:** partial tables in `docs/FRONTEND_CONTRACT_INTERACTION.md`, the contract-message reference in `docs/contract-error-messages.md`, the frontend catalogue in `frontend/lib/contract-errors.ts`, and retry logic in `frontend/lib/contract-retry.ts`.
> **Fixed:** added complete variant catalogue (including missing codes 44, 45, 46), corrected the frontend interaction error table, documented propagation, retry/recovery, logging and monitoring, and created this consolidated guide.

---

## 1. Why this exists

Error handling was inconsistent:

- The contract (`contracts/escrow/src/lib.rs`) defines a `Error` enum with ~50 variants, but the frontend catalogue (`frontend/lib/contract-errors.ts`) had drifted — codes 1/2 were transposed in an earlier inline map, and newer variants (44–46) were missing entirely.
- `docs/FRONTEND_CONTRACT_INTERACTION.md` contained an outdated error-code table from a different contract version (milestones / disputes / oracles mismatched), which would mislead any frontend developer.
- Retry, circuit-breaker, and failed-write recovery were implemented but not described in docs.
- Logging (console, events, metrics) and monitoring (Prometheus / Grafana / Sentry) existed in code but were not tied to error-handling guidance.

This document is the single reference for both sides.

---

## 2. Source of truth

| Layer | File / Service | What it defines / collects |
|---|---|---|
| **Contract enum** | `contracts/escrow/src/lib.rs` (line ~393) | `pub enum Error { JobNotFound = 1, Unauthorized = 2, ... }` |
| **Propaganda / audit** | `contracts/escrow/src/lib.rs` | `panic_with_error!`, `write_audit`, `record_event`, `e.events().publish` |
| **Frontend catalogue** | `frontend/lib/contract-errors.ts` | `CONTRACT_ERRORS: Record<number, ContractErrorSpec>` — message + action per code |
| **Drift guard** | `frontend/__tests__/contract-errors.test.ts` | Fails if `CONTRACT_ERRORS` drift from `lib.rs` or from `docs/contract-error-messages.md` |
| **Message table** | `docs/contract-error-messages.md` | Human-readable table with trigger, message, and action |
| **Retry / circuit** | `frontend/lib/contract-retry.ts` | `withContractRetry`, `isRetryableNetworkError`, circuit-breaker state, `enqueueFailedWrite` |
| **Contract wrapper** | `frontend/lib/contract.ts` | `callContract` — simulation → submission → polling |
| **Parsing entry** | `frontend/lib/contract-errors.ts` | `describeContractError`, `messageForContractCode`, `actionForContractCode` |
| **Metrics** | `frontend/lib/metrics.ts`, `frontend/lib/stellar.ts` | `stellarwork_contract_tx_total`, `stellarwork_rpc_errors_total`, etc. |
| **Monitoring** | `monitoring/` (Prometheus / Grafana / Alertmanager) | Dashboards, rules, alerts |

> **Rule of thumb:** when in doubt, open `lib.rs` for the code, `contract-errors.ts` for the user message, and `contract-retry.ts` for retry behaviour.

---

## 3. Catalog of contract error types and variants

The authoritative source is the `Error` enum in `contracts/escrow/src/lib.rs`. Below is the consolidated list with the user-facing mapping from `frontend/lib/contract-errors.ts`. Codes 44, 45, and 46 were missing from both the catalogue and the docs table and have been added (see file history / edit). Code 50 is reused for three conditions (`InvalidMetadataHash`, `RecoveryError`, `InvalidCategory`) — details are surfaced through audit events rather than the numeric code alone.

| Code | Variant | Trigger (developer terms) | User-facing message | Suggested action |
|---|---|---|---|---|
| 1 | `JobNotFound` | No job exists with id, or archived | "This job could not be found. It may have been removed or archived." | Return to list and pick another |
| 2 | `Unauthorized` | Caller not a party, or wrong party | "You do not have permission to do this." | Switch to the owning wallet, try again |
| 3 | `InvalidStatus` | Status does not allow this transition | "This action is not available while the job is in its current state." | Refresh to see current status |
| 4 | `InsufficientFunds` | Contract balance < requested payout | "There are not enough funds in escrow to complete this action." | Contact support — balance mismatch |
| 5 | `JobAlreadyAccepted` | Freelancer already accepted | "Someone else has already accepted this job." | Browse other open jobs |
| 6 | `DeadlinePassed` | Deadline in the past | "This job's deadline has passed." | Ask client to extend, or cancel |
| 7 | `DeadlineNotExpired` | Action needs expired deadline tried early | "The deadline has not passed yet." | Wait until deadline |
| 8 | `TokenNotAllowed` | Token not on allowlist | "This token is not accepted for payments." | Choose supported token (XLM / USDC) |
| 9 | `FeeTooHigh` | Admin fee above permitted max | "The configured platform fee is invalid." | Contact support — platform config |
| 10 | `AlreadyInitialized` | `initialize()` on already init contract | "This contract has already been set up." | No action needed |
| 11 | `InvalidAmount` | Job amount is zero or negative | "The amount must be greater than zero." | Enter positive amount |
| 12 | `InvalidDescriptionHash` | Hash all zero or payload length zero | "The job description is missing or invalid." | Add description and retry |
| 13 | `UnauthorizedAdmin` | Non-admin calls admin-only fn | "Only an administrator can do this." | Switch to admin wallet |
| 14 | `InvalidDeadline` | Deadline already in past | "The deadline must be in the future." | Pick later date |
| 15 | `ActiveJobLimitExceeded` | Client at max active jobs | "You have reached the maximum number of active jobs." | Complete / cancel existing |
| 16 | `RevisionLimitReached` | Job rejected max times | "This job has reached its revision limit." | Approve work or raise dispute |
| 17 | `DescriptionPayloadTooLarge` | Payload > `desc_payload_max` | "The job description is too long." | Shorten description |
| 18 | `UpgradeNotApproved` | Upgrade executed without proposal | "This upgrade has not been approved." | Contact support |
| 19 | `UpgradeTimelockPending` | Timelock not elapsed | "This upgrade is still in its waiting period." | Try after timelock |
| 20 | `NoPendingUpgrade` | Action taken with no proposal | "There is no upgrade waiting to be applied." | No action needed |
| 21 | `ReferralCodeAlreadyExists` | Code already registered | "That referral code is already taken." | Choose different code |
| 22 | `ReferralCodeNotFound` | No match for supplied code | "That referral code does not exist." | Check and retry |
| 23 | `InsufficientReferralEarnings` | Withdrawal > balance | "You do not have enough referral earnings to withdraw." | Withdraw smaller amount |
| 24 | `BlacklistedUser` | Caller blacklisted | "This account is not permitted to use the platform." | Contact support |
| 25 | `NotWhitelisted` | Whitelist mode + not whitelisted | "The platform is currently invitation-only." | Request access / contact support |
| 26 | `SelfReferralNotAllowed` | Client uses own code | "You cannot refer yourself." | Use another's code or skip |
| 27 | `DeadlineNotExtendable` | Job status prevents extension | "This job's deadline can no longer be changed." | Refresh status |
| 28 | `NoFreelancerAssigned` | Action needs freelancer, none assigned | "No freelancer has accepted this job yet." | Wait for acceptance |
| 29 | `ForwarderNotTrusted` | Meta-tx through unregistered forwarder | "This request came from an untrusted source." | Try from official app |
| 30 | `NoPendingTransfer` | Accept / cancel with none pending | "There is no ownership transfer waiting." | No action needed |
| 31 | `NotPendingAdmin` | Wrong address tries to accept ownership | "You are not the nominated administrator." | Switch to nominated wallet |
| 32 | `BatchSizeMismatch` | Batch arrays different lengths | "The batch request was malformed." | Retry with matching inputs |
| 33 | `BatchTooLarge` | Batch exceeds permitted size | "Too many items in one request." | Split into smaller batches |
| 34 | `AttestationNotFound` | Attestation id missing | "That attestation could not be found." | Check id and retry |
| 35 | `JobNotVisible` | Private job + viewer not invited | "This job is private." | Ask client for invitation |
| 36 | `FreelancerNotInvited` | Freelancer tries private job without invite | "You have not been invited to this job." | Ask for invite or browse open |
| 37 | `OracleNotFound` | Oracle address not registered | "That oracle is not registered." | Contact support |
| 38 | `OracleNotActive` | Oracle disabled | "This oracle is not currently active." | Try later / contact support |
| 39 | `OracleNotAssigned` | Oracle submitted for wrong job | "This oracle is not assigned to that dispute." | Contact support |
| 40 | `OracleAlreadySubmitted` | Verdict already recorded | "A verdict has already been submitted." | No action needed |
| 41 | `InsufficientBurnPool` | Burn exceeds accumulated pool | "There are not enough funds in the burn pool." | Contact support |
| 42 | `InvalidBurnPercentage` | Burn % outside permitted range | "The configured burn rate is invalid." | Contact support |
| 43 | `NoActiveOracles` | Dispute needs oracle, none active | "No dispute resolvers are available right now." | Try later / contact support |
| **44** | **`DuplicateNonce`** | Replay of client nonce (double-click / retry) | "This request has already been submitted. You may recover the original job." | Recover via `get_job_id_for_nonce` or submit new nonce |
| **45** | **`InvalidAttachmentCount`** | Empty list or > `MAX_ATTACHMENT_LEAVES` | "The attachment list is empty or has too many items." | Add at least one; stay within limit |
| **46** | **`InvalidPageLimit`** | Page size zero or > `MAX_EVENT_PAGE_LIMIT` | "The page size is invalid." | Request 1 to max allowed |
| 47 | `UnsupportedToken` | Token not on approved whitelist | "This token is not accepted for payments." | Choose supported token |
| 48 | `BelowMinimumRating` | Rating below platform min | "Your rating is too low to accept this job." | Improve rating on other jobs |
| 49 | `InvalidRating` | Rating outside 1–500 | "The rating value is not valid." | Enter between 1 and 500 |
| 50 | `RecoveryError` / `InvalidCategory` / `InvalidMetadataHash` | Multi-condition (recovery proposal invalid, category invalid, metadata hash zero) | "Something went wrong on-chain." / Check audit or contact support | Check audit log (`get_audit_entry`) or contact support |

> **Lifecycle context (most frequent):**
> - **Posting:** 11 (`InvalidAmount`), 14 (`InvalidDeadline`), 12 (`InvalidDescriptionHash`), 17 (`DescriptionPayloadTooLarge`), 8 (`TokenNotAllowed`), 15 (`ActiveJobLimitExceeded`), 44 (`DuplicateNonce` if nonces used).
> - **Accepting:** 1 (`JobNotFound`), 5 (`JobAlreadyAccepted`), 3 (`InvalidStatus`), 6 (`DeadlinePassed`), 35 (`JobNotVisible`), 36 (`FreelancerNotInvited`), 2 (`Unauthorized`).
> - **Submitting / Approving:** 3 (`InvalidStatus`), 2 (`Unauthorized`), 28 (`NoFreelancerAssigned`), 16 (`RevisionLimitReached`).
> - **Cancelling / Disputing:** 3 (`InvalidStatus`), 7 (`DeadlineNotExpired`), 2 (`Unauthorized`), 43 (`NoActiveOracles`).
> - **Access control:** 24 (`BlacklistedUser`), 25 (`NotWhitelisted`) — both are account-level; do not offer retry, route to support.

---

## 4. Contract error propagation patterns

The contract does not throw Python-style exceptions; it uses Soroban's `panic_with_error!` macro, which rolls back the transaction and surfaces a numeric error code to the caller.

### 4.1 Invariant / authorization failures — `panic_with_error!`

Used when a precondition fails and the call must abort.

```rust
// Example from lib.rs (~line 583): admin-only function
if caller != admin {
    panic_with_error!(&e, Error::UnauthorizedAdmin);
}
```

- **Effect:** Transaction reverts; no state change.
- **Frontend sees:** `Error(Contract, #13)` (or whichever code).
- **When to use:** authorization checks, state-machine preconditions, input validation, missing data (e.g., `get_job_or_panic`).

### 4.2 State transition checks

Many functions open with a helper that panics if the job is missing or wrong:

```rust
fn get_job_or_panic(e: &Env, job_id: u64) -> Job {
    let key = DataKey::Job(job_id);
    e.storage().persistent().get(&key).unwrap_or_else(|| {
        panic_with_error!(&e, Error::JobNotFound);
    })
}
```

- **Propagate:** always return `Error::JobNotFound` (1) when the id is unknown.
- **Do not silently return `None`:** the frontend relies on a precise code to distinguish "missing" from "wrong party".

### 4.3 Audit trail — non-repudiation

Every mutating call writes an audit entry via `write_audit`:

```rust
fn write_audit(e: &Env, caller: Address, operation: &str, job_id: Option<u64>, details: &str) {
    // increments AuditCount, writes AuditLog(id) with timestamp, caller, operation
}
```

- **Key:** `DataKey::AuditLog(id)` / `DataKey::AuditCount`
- **Use:** when investigating failures (e.g., recovery proposal rejected — `Error::RecoveryError` 50), query by `id` or filter by `operation`.

### 4.4 Events — indexable sequence

The contract publishes events and mirrors them to a paginated log:

```rust
fn record_event(e: &Env, topic: &str, job_id: u64, actor: &Address) {
    // writes ExtKey::EventLog(seq) with seq, topic, job_id, actor, timestamp
}
```

- **Source of truth:** `e.events().publish(...)` for live subscribers.
- **Resumption:** indexers use `get_events(from_seq, limit)` — always validate `limit` with `InvalidPageLimit` (46).

### 4.5 Recovery / emergency fund errors (code 50)

`RecoveryError` (50) covers invalid recovery proposal states (not stuck, too many proposals, wrong signer). Because the same numeric code maps to multiple underlying conditions, the contract surfaces details through:
- `AuditLog` entries with operation `"recovery"`.
- Events emitted during proposal / approval / resolution.

> **Guidance:** when a user sees 50, do not guess; direct them to check the audit log or contact support.

---

## 5. Frontend error propagation patterns

The wrapper `frontend/lib/contract.ts` (`callContract`) orchestrates three phases.

### 5.1 Phase 1 — Simulation

```typescript
const simulation = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(simulation)) {
  throw new Error(simulation.error); // may contain "Error(Contract, #N)"
}
```

- **Errors here:** contract validation failures (`InvalidStatus`, `Unauthorized`, `InvalidAmount`, etc.)
- **Parsing:** feed the thrown error to `describeContractError(err)` to get the structured message.

### 5.2 Phase 2 — Submission

```typescript
const sent = await server.sendTransaction(signedTx);
if (sent.status === "ERROR") {
  throw new Error(sent.errorResult?.toXDR().toString() ?? "Contract invocation failed.");
}
```

- **Errors here:** fee insufficient, sequence number out of date, network-level failure.
- **Note:** `sent.errorResult` is an XDR string; `parseContractError` (in `stellar.ts`) delegates to `describeContractError` where possible.

### 5.3 Phase 3 — Polling

```typescript
if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
  return { status: "ERROR", hash: sent.hash, errorResult: "Transaction failed." };
}
```

- **Errors here:** transaction succeeded in simulation but failed on-ledger (e.g., state changed between simulate and submit, or fee spike).
- **Recovery:** retry with `withContractRetry` only if the error is retryable (network / timeout / 429 / 503); do not blindly retry contract validation errors.

### 5.4 Parsing — structured vs unstructured

```typescript
import { describeContractError } from "@/lib/contract-errors";

try {
  await postJob(...);
} catch (err) {
  const described = describeContractError(err);
  if (described) {
    toast.error(described.message, { description: described.action });
  } else {
    toast.error(parseContractError(err)); // network, wallet, fee, timeout
  }
}
```

- `describeContractError` returns `{ code, message, action }` for contract errors, `null` otherwise.
- This separation prevents mislabelling a network timeout as `JobNotFound`.

---

## 6. User-facing error messages

### 6.1 Structure

Every entry in `CONTRACT_ERRORS` has three fields (see `frontend/lib/contract-errors.ts`):

- `message`: one sentence, no jargon, no error codes.
- `action`: a concrete next step.
- `trigger`: developer context for when it fires.

### 6.2 Rules enforced by tests / docs

From `docs/contract-error-messages.md` (enforced by `contract-errors.test.ts`):

1. **No bare numbers in user text.** A user never sees "Error 4" — they see the message.
2. **Unknown codes still get a sentence.** `messageForContractCode(99)` returns a generic sentence, never a raw number.
3. **Message + action always paired.** A message without an action leaves the user stuck.
4. **Distinct messages per code.** Two codes sharing one message means the UI cannot distinguish them.

### 6.3 Example toast usage

```typescript
toast.error("This job could not be found.", {
  description: "Return to the job list and pick another job.",
});
```

---

## 7. Retry and recovery strategies

Retry logic is implemented in `frontend/lib/contract-retry.ts`. It is **opt-in** via `withContractRetry`; the frontend does not automatically retry every call.

### 7.1 `withContractRetry` — configurable backoff

```typescript
export async function withContractRetry<T>(
  operation: () => Promise<T>,
  operationLabel: string,
  options?: { readOnly?: boolean; contractId?: string; method?: string; args?: xdr.ScVal[] }
): Promise<T>
```

**Defaults (`DEFAULT_RETRY_CONFIG`):**

| Setting | Default | Override env / storage |
|---|---|---|
| `maxRetries` | 3 | `NEXT_PUBLIC_CONTRACT_RETRY_MAX` |
| `backoffMs` | [1000, 2000, 4000] | `NEXT_PUBLIC_CONTRACT_RETRY_BACKOFF_MS` (comma-separated) |
| `circuitBreakerEnabled` | true | `getRetryConfig()` / `localStorage` |
| `circuitBreakerThreshold` | 5 | stored config |
| `circuitBreakerCooldownMs` | 30000 | stored config |
| `queueFailedWrites` | true | stored config |

**Behaviour:**

1. If circuit is open (`isCircuitOpen()`), throw `CircuitOpenError` immediately with remaining cooldown.
2. For each attempt (1 → max):
   - Success → `recordCircuitSuccess()`; return result.
   - `!isRetryableNetworkError(err)` → throw immediately (do not retry contract errors).
   - If attempt < max → dispatch `CONTRACT_RETRY_EVENT` (`phase: "backoff"`), `console.warn`, await `delay`, continue.
3. After max attempts → `recordCircuitFailure` (may open circuit), dispatch `phase: "exhausted"`, enqueue write if applicable, `console.error`, throw aggregated error.

### 7.2 Retryable errors (`isRetryableNetworkError`)

Matches lowercase message for:

- `timeout`, `econnrefused`, `econnreset`, `etimedout`, `enotfound`
- `network`, `too many requests`, `429`, `503`
- `resource limit`, `rate limit`, `circuit breaker`

> **Do not retry** `Unauthorized`, `InvalidStatus`, `JobNotFound`, or any contract validation error — the call will fail identically on retry.

### 7.3 Circuit breaker

- **State:** stored in `localStorage` (`stellarwork:circuit-breaker-state`) — `consecutiveFailures`, `openedAt`.
- **Open:** after `threshold` consecutive failures in a window.
- **Reset:** automatically after `cooldownMs`; also manual via `resetCircuitBreaker()`.
- **UI:** listen to `CIRCUIT_OPEN_EVENT`; show cooldown timer.

### 7.4 Failed write queue (non-read-only writes only)

When a write exhausts retries:

```typescript
enqueueFailedWrite(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  lastError: string
): QueuedWrite | null
```

- **Store:** `localStorage` key `stellarwork:failed-write-queue` (max 10 entries).
- **Fields:** `id`, `contractId`, `method`, `argsXdr`, `timestamp`, `lastError`.
- **Replay:** `loadFailedWriteQueue()` → `decodeQueuedArgs(argsXdr)` → call method again.
- **UI event:** `FAILED_WRITE_QUEUE_EVENT` dispatched on update.
- **Cleanup:** `removeQueuedWrite(id)`, `clearFailedWriteQueue()`.

### 7.5 Manual retry patterns

For read-only failures (e.g., polling timeout):

```typescript
// User clicks "Retry"
try {
  await withContractRetry(() => fetchJobStatus(jobId), "fetchJobStatus");
} catch (e) {
  if (e instanceof CircuitOpenError) {
    toast.error(`Wait ${Math.ceil(e.cooldownMs / 1000)}s before retrying.`);
  }
}
```

---

## 8. Logging and monitoring guidance

### 8.1 Frontend console logging

`contract-retry.ts` writes structured logs:

```typescript
console.warn(
  `[Stellar] ${operationLabel} attempt ${attempt}/${config.maxRetries} failed, retrying in ${delay}ms`,
  (err as Error)?.message,
);

console.error(
  `[Stellar] ${operationLabel} failed after ${config.maxRetries} attempts`,
  (err as Error)?.message,
);
```

- Use the `[Stellar]` prefix to filter in DevTools / log aggregation.
- Log messages include `operationLabel`, attempt number, delay, and error text — never log full XDR or wallet private keys.

### 8.2 Custom events

| Event name | Source | Detail fields | Use |
|---|---|---|---|
| `stellar-retry-attempt` | `contract-retry.ts` | `phase`, `attempt`, `nextAttempt`, `maxRetries`, `delayMs`, `operation`, `error` | UI progress / telemetry |
| `stellar-circuit-open` | `contract-retry.ts` | `operation`, `cooldownMs`, `error` | Circuit breaker UI / alerting |
| `stellarwork:failed-write-queue-updated` | `contract-retry.ts` | (event only; load queue) | Queue badge / replay UI |

Listen on `window`:

```typescript
window.addEventListener("stellar-retry-attempt", (e) => {
  const d = (e as CustomEvent).detail as ContractRetryEventDetail;
  // update retry indicator
});
```

### 8.3 Metrics

From `docs/MONITORING.md` and `frontend/lib/metrics.ts` / `frontend/lib/stellar.ts`:

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `stellarwork_contract_tx_total` | Counter | `method`, `outcome`, `network` | Contract invocations by result |
| `stellarwork_contract_tx_duration_milliseconds` | Histogram | `method`, `network` | End-to-end latency |
| `stellarwork_rpc_errors_total` | Counter | `kind`, `network` | RPC failures by coarse kind |
| `stellarwork_web_vital_milliseconds` | Histogram | `metric`, `path` | Core Web Vitals |
| `stellarwork_page_views_total` | Counter | `path` | Client-side navigations |

- **Collection:** `frontend/lib/stellar.ts` wraps `callContract` to record outcome and latency; server registers via `frontend/lib/metrics.ts`; exposed at `/api/metrics`.
- **Scrape:** Prometheus every 30s; aggregate with `sum by (...)` and `rate()`.
- **Dashboards:** `StellarWork — Platform Overview` in Grafana folder `StellarWork`.

### 8.4 Error tracking (Sentry)

From `docs/ARCHITECTURE.md`: Sentry receives real-time error reports with source maps from the frontend bundle. Configure in `frontend/lib/metrics-client.ts` or environment; do not log user PII or raw transaction args.

### 8.5 Monitor / alert thresholds

From `monitoring/alerts.yml` (reference in `docs/MONITORING.md`):

- `stellarwork_rpc_errors_total` > 5 in 5 min → alert `RPC errors high`
- `stellarwork_contract_tx_total{outcome="ERROR"}` / total > 10% in 5 min → alert `Contract error rate high`
- Circuit-open events > 0 in 2 min → alert `Circuit breaker open`
- Failed-write queue length > 5 → alert `Failed writes queued`

---

## 9. Cross-reference quick links

| What you need | File / URL |
|---|---|
| Full contract error enum | `contracts/escrow/src/lib.rs` (line 393) |
| User-facing message catalogue | `frontend/lib/contract-errors.ts` |
| Drift guard (tests) | `frontend/__tests__/contract-errors.test.ts` |
| Message table (generated from catalogue) | `docs/contract-error-messages.md` |
| Retry / circuit / queue implementation | `frontend/lib/contract-retry.ts` |
| Contract wrapper (sim → submit → poll) | `frontend/lib/contract.ts` |
| Parsing entry (`describeContractError`) | `frontend/lib/contract-errors.ts` |
| Interaction docs (updated) | `docs/FRONTEND_CONTRACT_INTERACTION.md` |
| Monitoring / metrics / alerts | `docs/MONITORING.md`, `monitoring/` |
| Architecture (Sentry, metrics, logging) | `docs/ARCHITECTURE.md` |

---

## 10. Changes made (fix summary)

1. **Added missing catalogue entries** (`frontend/lib/contract-errors.ts`): `DuplicateNonce` (44), `InvalidAttachmentCount` (45), `InvalidPageLimit` (46).
2. **Updated message table** (`docs/contract-error-messages.md`): inserted rows 44–46; left 50 documented in text only because it maps to three conditions via audit/events.
3. **Corrected interaction docs** (`docs/FRONTEND_CONTRACT_INTERACTION.md`): replaced the wrong milestone/dispute error table with the correct escrow summary; enhanced try-catch example to use `describeContractError`; added reference to this guide.
4. **Created comprehensive guide** (`docs/ERROR_HANDLING.md`): covers all error types, propagation patterns (contract `panic_with_error!` + audit/events; frontend simulation/submission/polling + parsing), user-facing messages, retry/recovery (`withContractRetry`, circuit breaker, failed-write queue), logging (console + events), and monitoring (metrics + Sentry + Prometheus/Grafana/Alertmanager).

---

*Last updated: 2026-09-03 — aligned with contract source (`lib.rs` at commit `HEAD`) and frontend catalogue (`contract-errors.ts`).*
