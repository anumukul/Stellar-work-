# Escrow Contract Reference

Location: `contracts/escrow/src/lib.rs`

## Overview

The StellarWork escrow contract manages a decentralized freelance marketplace on Stellar Soroban. It holds payments in escrow and releases them based on job lifecycle state transitions. The contract supports multiple whitelisted tokens, platform fee accounting, dispute resolution, and a timelocked upgrade mechanism.

## Data Model

### `Job` struct

| Field | Type | Description |
|-------|------|-------------|
| `client` | `Address` | The account that created and funded the job. |
| `freelancer` | `Option<Address>` | The account assigned to the job (`None` until accepted). |
| `amount` | `i128` | Total payment held in escrow (in the token's smallest unit). |
| `description_hash` | `BytesN<32>` | SHA-256 hash of the job description (all-zero hash is rejected). |
| `status` | `JobStatus` | Current lifecycle state of the job. |
| `created_at` | `u64` | Unix epoch seconds, set by `e.ledger().timestamp()` at `post_job` time. Read-only after creation. |
| `deadline` | `u64` | Unix epoch seconds, the latest time the job is active. Use `0` for no deadline. |
| `token` | `Address` | The whitelisted token contract used for payment. |
| `revision_count` | `u32` | Number of times the client has rejected submitted work (max 3). |

### `JobStatus` enum

| Variant | Description |
|---------|-------------|
| `Open` | Job posted, awaiting freelancer acceptance. |
| `InProgress` | Freelancer accepted, work underway. |
| `SubmittedForReview` | Freelancer submitted work, awaiting client approval. |
| `Completed` | Work approved, payment released to freelancer (minus platform fee). |
| `Cancelled` | Job cancelled; funds returned to client or split per cancellation terms. |
| `Disputed` | Dispute raised; funds held until admin resolution. |

### `DisputeResolution` struct

| Field | Type | Description |
|-------|------|-------------|
| `client_bps` | `u32` | Basis-points share (0-10,000) awarded to the client. Remainder goes to freelancer after platform fee. |

Special cases:
- `10_000` — full refund to client, no fee, status becomes `Cancelled`
- `0` — full payout to freelancer minus fee, status becomes `Completed`
- Between `0` and `10_000` — split: client gets share (no fee on client portion), freelancer gets remainder minus fee

## Function Reference

### Lifecycle Functions

#### `initialize(admin: Address, native_token: Address)`

Initializes the contract. Can only be called once.

| Parameter | Type | Description |
|-----------|------|-------------|
| `admin` | `Address` | Admin account that controls admin-only functions. Must authorize. |
| `native_token` | `Address` | Default token contract address. Automatically added to the allowed token whitelist. |

**Errors:** `AlreadyInitialized` (10)

---

#### `post_job(client: Address, amount: i128, desc_hash: BytesN<32>, description_payload_len: u32, deadline: u64, token: Address) -> u64`

Creates a new job and transfers `amount` of `token` from `client` to the contract escrow.

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `Address` | Job creator. Must authorize and have sufficient token balance. |
| `amount` | `i128` | Escrow amount in token's smallest unit. Must be > 0. |
| `desc_hash` | `BytesN<32>` | SHA-256 hash of the job description. Cannot be all zeros. |
| `description_payload_len` | `u32` | Byte length of the description payload. Must be > 0 and <= `desc_payload_max`. |
| `deadline` | `u64` | Unix epoch deadline. Use `0` for no deadline. Cannot be in the past. |
| `token` | `Address` | Token contract address. Must be in the allowed token whitelist. |

**Returns:** `u64` — the new job ID (1-indexed).

**Errors:** `InvalidAmount` (11), `InvalidDescriptionHash` (12), `DescriptionPayloadTooLarge` (17), `InvalidDeadline` (14), `TokenNotAllowed` (8), `ActiveJobLimitExceeded` (15)

**Event:** `job_created` — data: `(job_id, client, amount, token)`

---

#### `accept_job(freelancer: Address, job_id: u64)`

Freelancer accepts an open job. Transitions status from `Open` to `InProgress`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `freelancer` | `Address` | Freelancer account. Must authorize. Cannot be the same as the client. |
| `job_id` | `u64` | ID of the job to accept. |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `JobAlreadyAccepted` (5), `Unauthorized` (2), `DeadlinePassed` (6)

**Event:** `job_accepted` — data: `(job_id, freelancer)`

---

#### `submit_work(freelancer: Address, job_id: u64)`

Freelancer submits completed work for review. Transitions from `InProgress` to `SubmittedForReview`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `freelancer` | `Address` | Must be the assigned freelancer. Must authorize. |
| `job_id` | `u64` | ID of the job. |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `Unauthorized` (2), `DeadlinePassed` (6)

**Event:** `job_submitted` — data: `(job_id, freelancer)`

---

#### `approve_work(client: Address, job_id: u64)`

Client approves submitted work. Deducts platform fee and transfers payout to freelancer. Transitions to `Completed`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `Address` | Must be the job client. Must authorize. |
| `job_id` | `u64` | ID of the job. |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `Unauthorized` (2)

**Event:** `job_approved` — data: `(job_id, client, freelancer, payout)`

---

#### `reject_work(client: Address, job_id: u64)`

Client rejects submitted work and requests revisions. Transitions from `SubmittedForReview` back to `InProgress`. Increments `revision_count`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `Address` | Must be the job client. Must authorize. |
| `job_id` | `u64` | ID of the job. |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `Unauthorized` (2), `RevisionLimitReached` (16)

**Event:** `job_rejected` — data: `(job_id, client, revision_count)`

---

#### `cancel_job(client: Address, job_id: u64)`

Client cancels an open job. Refunds full escrow to client. Transitions to `Cancelled`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `Address` | Must be the job client. Must authorize. |
| `job_id` | `u64` | ID of the job. Must be in `Open` status. |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `Unauthorized` (2)

**Event:** `job_cancelled` — data: `(job_id, client)`

---

#### `top_up_escrow(client: Address, job_id: u64, additional_amount: i128)`

Client adds funds to an existing job escrow. Transfers `additional_amount` from the client into the contract and updates `job.amount`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `Address` | Must be the original job client. Must authorize. |
| `job_id` | `u64` | ID of the job to top up. |
| `additional_amount` | `i128` | Extra escrow amount. Must be > 0. |

**Allowed statuses:** `Open`, `InProgress`, `SubmittedForReview`.

**Errors:** `JobNotFound` (1), `Unauthorized` (2), `InvalidStatus` (3), `InsufficientFunds` (4), `InvalidAmount` (11)

**Event:** `EscrowToppedUp` — data: `(job_id, old_amount, new_amount)`

---

#### `freelancer_cancel_job(freelancer: Address, job_id: u64)`

Freelancer cancels an in-progress job. Returns full escrow to client. Transitions to `Cancelled`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `freelancer` | `Address` | Must be the assigned freelancer. Must authorize. |
| `job_id` | `u64` | ID of the job. Must be in `InProgress` status. |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `Unauthorized` (2)

**Event:** `job_freelancer_cancelled` — data: `(job_id, freelancer, client, amount)`

---

#### `enforce_deadline(client: Address, job_id: u64)`

Client enforces a passed deadline on an in-progress job. Cancels the job and refunds escrow.

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `Address` | Must be the job client. Must authorize. |
| `job_id` | `u64` | ID of the job. Must be `InProgress` with a non-zero deadline that has passed. |

**Errors:** `JobNotFound` (1), `Unauthorized` (2), `InvalidStatus` (3), `DeadlineNotExpired` (7)

**Event:** `deadline_enforced` — data: `(job_id, client)`

---

#### `mutual_cancel(client: Address, freelancer: Address, job_id: u64, client_share_bps: i128)`

Both parties agree to cancel with a custom split. Transitions to `Cancelled`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `Address` | Must be the job client. Must authorize. |
| `freelancer` | `Address` | Must be the assigned freelancer. Must authorize. |
| `job_id` | `u64` | ID of the job. Must be `InProgress` or `SubmittedForReview`. |
| `client_share_bps` | `i128` | Client's share in basis points (0-10,000). |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `Unauthorized` (2), `InvalidAmount` (11)

**Event:** `job_mutually_cancelled` — data: `(job_id, client, freelancer, client_share, freelancer_share)`

---

### Dispute Functions

#### `raise_dispute(caller: Address, job_id: u64)`

Either party raises a dispute. Transitions from `InProgress` or `SubmittedForReview` to `Disputed`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `caller` | `Address` | Must be the client or freelancer. Must authorize. |
| `job_id` | `u64` | ID of the job. |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `Unauthorized` (2)

**Event:** `job_disputed` — data: `(job_id, caller)`

---

#### `resolve_dispute(job_id: u64, resolution: DisputeResolution)`

Admin resolves a disputed job. Distributes funds based on `client_bps` share.

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | `u64` | ID of the disputed job. |
| `resolution` | `DisputeResolution` | Contains `client_bps` (0-10,000 basis points for client). |

**Errors:** `JobNotFound` (1), `InvalidStatus` (3), `InvalidAmount` (11)

**Event:** `dispute_resolved` — data: `(job_id, client_bps)`

---

### Query Functions

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `get_job(job_id)` | `job_id: u64` | `Job` | Returns the job struct. Errors with `JobNotFound` (1) if missing. |
| `get_job_count()` | — | `u64` | Total number of jobs ever created. |
| `get_jobs_batch(start, limit)` | `start: u64, limit: u32` | `Vec<Job>` | Returns a batch of jobs starting from `start` (1-indexed). |
| `get_jobs_by_status(status)` | `status: JobStatus` | `Vec<Job>` | Returns all jobs matching the given status. |
| `get_open_jobs_count()` | — | `u64` | Count of jobs in `Open` status. |
| `get_completed_jobs_count()` | — | `u64` | Count of jobs in `Completed` status. |
| `get_cancelled_jobs_count()` | — | `u64` | Count of jobs in `Cancelled` status. |
| `get_admin()` | — | `Address` | Current admin address. |
| `get_native_token()` | — | `Address` | Native token contract address. |
| `get_fee_bps()` | — | `i128` | Current platform fee in basis points. |
| `get_fees(token)` | `token: Address` | `i128` | Accrued platform fees for a specific token. |
| `get_desc_payload_max()` | — | `u32` | Maximum description payload size in bytes. |
| `get_description_cid(desc_hash)` | `desc_hash: BytesN<32>` | `String` | IPFS CID for a description hash. Empty string if not stored. |
| `get_contract_version()` | — | `u32` | Current contract version number. |
| `get_max_active_jobs_per_client()` | — | `u32` | Max active jobs per client (0 = unlimited). |
| `get_client_active_jobs_count(client)` | `client: Address` | `u32` | Active job count for a specific client. |
| `is_token_allowed(token)` | `token: Address` | `bool` | Whether a token is in the whitelist. |

---

### Admin Functions

| Function | Parameters | Description |
|----------|-----------|-------------|
| `update_fee(new_fee_bps)` | `new_fee_bps: i128` | Update platform fee (max 1,000 bps = 10%). Admin only. |
| `update_fee_bps(caller, new_fee_bps)` | `caller: Address, new_fee_bps: i128` | Update fee with explicit caller auth (max 10,000 bps). Admin only. |
| `withdraw_fees(token)` | `token: Address` | Withdraw accrued fees for a token to admin. Admin only. |
| `add_allowed_token(token)` | `token: Address` | Add a token to the whitelist. Admin only. |
| `remove_allowed_token(token)` | `token: Address` | Remove a token from the whitelist. Admin only. |
| `set_desc_payload_max(caller, max_bytes)` | `caller: Address, max_bytes: u32` | Set max description payload size (32-65,536). Admin only. |
| `set_max_active_jobs_per_client(caller, limit)` | `caller: Address, limit: u32` | Set max active jobs per client (0 = unlimited). Admin only. |
| `transfer_admin(caller, new_admin)` | `caller: Address, new_admin: Address` | Transfer admin role. Current admin only. |

---

### Utility Functions

| Function | Parameters | Description |
|----------|-----------|-------------|
| `extend_job_ttl(caller, job_id)` | `caller: Address, job_id: u64` | Extend storage TTL for a job. Caller must be client or freelancer. |
| `store_description_cid(caller, desc_hash, cid)` | `caller: Address, desc_hash: BytesN<32>, cid: String` | Store an IPFS CID mapping for a description hash. |

---

### Upgrade Functions

| Function | Parameters | Description |
|----------|-----------|-------------|
| `propose_upgrade(admin, new_wasm_hash)` | `admin: Address, new_wasm_hash: BytesN<32>` | Propose a contract upgrade. Sets 24-hour timelock. Admin only. |
| `execute_upgrade(admin)` | `admin: Address` | Execute a pending upgrade after timelock expires. Admin only. |
| `cancel_upgrade(admin)` | `admin: Address` | Cancel a pending upgrade. Admin only. |

## Events

| Event | Topics | Data |
|-------|--------|------|
| `job_created` | `("job_created",)` | `(job_id, client, amount, token)` |
| `job_accepted` | `("job_accepted",)` | `(job_id, freelancer)` |
| `job_submitted` | `("job_submitted",)` | `(job_id, freelancer)` |
| `job_approved` | `("job_approved",)` | `(job_id, client, freelancer, payout)` |
| `job_rejected` | `("job_rejected",)` | `(job_id, client, revision_count)` |
| `job_cancelled` | `("job_cancelled",)` | `(job_id, client)` |
| `EscrowToppedUp` | `("EscrowToppedUp",)` | `(job_id, old_amount, new_amount)` |
| `job_freelancer_cancelled` | `("job_freelancer_cancelled",)` | `(job_id, freelancer, client, amount)` |
| `job_mutually_cancelled` | `("job_mutually_cancelled",)` | `(job_id, client, freelancer, client_share, freelancer_share)` |
| `deadline_enforced` | `("deadline_enforced",)` | `(job_id, client)` |
| `job_disputed` | `("job_disputed",)` | `(job_id, caller)` |
| `dispute_resolved` | `("dispute_resolved",)` | `(job_id, client_bps)` |
| `fee_updated` | `("fee_updated",)` | `(caller, new_fee_bps)` |
| `fees_withdrawn` | `("fees_withdrawn",)` | `(token, fees)` |
| `admin_transferred` | `("admin_transferred",)` | `(caller, new_admin)` |
| `max_active_jobs_updated` | `("max_active_jobs_updated",)` | `(caller, limit)` |
| `upgrade_proposed` | `("upgrade_proposed",)` | `(admin, new_wasm_hash, deadline)` |
| `contract_upgraded` | `("contract_upgraded",)` | `(admin, new_wasm_hash)` |
| `upgrade_cancelled` | `("upgrade_cancelled",)` | `(admin, new_wasm_hash)` |

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 1 | `JobNotFound` | The specified job ID does not exist. |
| 2 | `Unauthorized` | Caller is not authorized for this action. |
| 3 | `InvalidStatus` | Job is not in the required status for this operation. |
| 4 | `InsufficientFunds` | Arithmetic overflow/underflow in fund calculations. |
| 5 | `JobAlreadyAccepted` | Job already has an assigned freelancer. |
| 6 | `DeadlinePassed` | The job deadline has already passed. |
| 7 | `DeadlineNotExpired` | The job deadline has not yet passed. |
| 8 | `TokenNotAllowed` | Token is not in the allowed whitelist. |
| 9 | `FeeTooHigh` | Proposed fee exceeds the maximum (1,000 bps). |
| 10 | `AlreadyInitialized` | Contract has already been initialized. |
| 11 | `InvalidAmount` | Amount is zero, negative, or out of valid range. |
| 12 | `InvalidDescriptionHash` | Description hash is all zeros or payload length is zero. |
| 13 | `UnauthorizedAdmin` | Caller is not the contract admin. |
| 14 | `InvalidDeadline` | Deadline is in the past at time of job creation. |
| 15 | `ActiveJobLimitExceeded` | Client has reached the maximum number of active jobs. |
| 16 | `RevisionLimitReached` | Maximum revision count (3) has been reached. |
| 17 | `DescriptionPayloadTooLarge` | Description exceeds the configured max payload size. |
| 18 | `UpgradeNotApproved` | Reserved for future use. |
| 19 | `UpgradeTimelockPending` | Upgrade timelock period has not yet elapsed. |
| 20 | `NoPendingUpgrade` | No upgrade proposal exists. |

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_FEE_BPS` | 250 | Default platform fee (2.5%). |
| `MAX_FEE_BPS` | 1,000 | Maximum fee for `update_fee` (10%). |
| `MAX_FEE_BPS_CONFIG` | 10,000 | Maximum fee for `update_fee_bps` (100%). |
| `MAX_REVISIONS` | 3 | Maximum work rejection cycles. |
| `UPGRADE_TIMELOCK_SECS` | 86,400 | 24-hour timelock for upgrades. |
| `DEFAULT_DESCRIPTION_PAYLOAD_MAX_BYTES` | 4,096 | Default max description size. |
| `MIN_DESCRIPTION_PAYLOAD_MAX_BYTES` | 32 | Minimum allowed description size. |
| `MAX_DESCRIPTION_PAYLOAD_MAX_BYTES` | 65,536 | Maximum allowed description size. |

## Upgrade Mechanism

The contract supports a two-step upgrade process with a 24-hour timelock:

1. **Propose**: Admin calls `propose_upgrade(admin, new_wasm_hash)`.
2. **Wait**: 24 hours must elapse.
3. **Execute**: Admin calls `execute_upgrade(admin)` after the deadline.
4. **Cancel**: Admin may call `cancel_upgrade(admin)` at any point before execution.

## Token Whitelist

The contract maintains a whitelist of allowed token addresses. Only whitelisted tokens can be used for job payments.

- The `native_token` passed to `initialize` is automatically whitelisted.
- Admin can add tokens via `add_allowed_token(token)`.
- Admin can remove tokens via `remove_allowed_token(token)`.
- `post_job` validates the token is whitelisted before accepting payment.
- Each job stores its token address for use during payout.

## Storage TTL Management

The contract uses Soroban's storage TTL extension to manage ledger entry lifetimes:

- **Instance storage**: Extended on every state-changing call.
- **Active jobs**: Extended with a longer bump amount (518,400 ledgers).
- **Archival jobs** (Completed/Cancelled): Extended with a shorter bump (120,960 ledgers).
- **Token fees**: Extended when fees are accrued or withdrawn.
