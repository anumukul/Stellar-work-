# Contract Function Quick Reference

This document provides a quick reference for the `EscrowContract` methods, expected states, and input/output parameters.

## Core Lifecycle Methods

| Function | Parameters | Preconditions | Description |
|----------|------------|---------------|-------------|
| `initialize` | `admin: Address`, `native_token: Address` | Not already initialized | Sets the contract admin and native token. |
| `post_job` | `client: Address`, `amount: i128`, `desc_hash: BytesN<32>`, `deadline: u64`, `token: Address` | `amount > 0`, `desc_hash != 0`, `deadline` in future (or 0), `token` allowed | Client deposits funds and creates a new job. |
| `accept_job` | `freelancer: Address`, `job_id: u64` | Job status is `Open`, `freelancer != client`, `deadline` not passed | Freelancer claims the job. Status becomes `InProgress`. |
| `submit_work` | `freelancer: Address`, `job_id: u64` | Job status is `InProgress`, caller is assigned freelancer | Freelancer submits work for review. Status becomes `SubmittedForReview`. |
| `approve_work` | `client: Address`, `job_id: u64` | Job status is `SubmittedForReview`, caller is client | Client approves work. Funds (minus fee) are released to freelancer. Status becomes `Completed`. |
| `reject_work` | `client: Address`, `job_id: u64` | Job status is `SubmittedForReview`, caller is client, `revision_count < 3` | Client requests revisions. Status returns to `InProgress`. |
| `cancel_job` | `client: Address`, `job_id: u64` | Job status is `Open`, caller is client | Client cancels the job and gets a refund. Status becomes `Cancelled`. |
| `enforce_deadline`| `client: Address`, `job_id: u64` | Job status is `InProgress`, caller is client, `deadline` passed | Client cancels job after deadline. Status becomes `Cancelled`. |

## Dispute Resolution

| Function | Parameters | Preconditions | Description |
|----------|------------|---------------|-------------|
| `raise_dispute` | `caller: Address`, `job_id: u64` | Status is `InProgress` or `SubmittedForReview`, caller is client or freelancer | Flags the job as disputed. Status becomes `Disputed`. |
| `resolve_dispute`| `job_id: u64`, `winner: Address` | Status is `Disputed`, caller is admin, `winner` is client or freelancer | Admin resolves the dispute, awarding funds to the winner. |

## Data Structures

### JobStatus (Enum)
- `Open`
- `InProgress`
- `SubmittedForReview`
- `Completed`
- `Cancelled`
- `Disputed`

### Job (Struct)
- `client: Address`: The account that created the job.
- `freelancer: Option<Address>`: The account assigned to the job.
- `amount: i128`: Total job payment held in escrow.
- `description_hash: BytesN<32>`: SHA-256 hash of the job description.
- `status: JobStatus`: Current state of the job.
- `created_at: u64`: Ledger timestamp (Unix epoch, **seconds**) recorded at the moment `post_job` is called.
  - Set by the contract via `e.ledger().timestamp()` — callers cannot supply or override this value.
  - Immutable after job creation; never updated by subsequent state transitions.
  - **Example:** `1710000000` (≈ 2024-03-10 00:00:00 UTC)
  - Useful for calculating job age: `age_seconds = current_ledger_timestamp - created_at`.
- `deadline: u64`: Ledger timestamp (Unix epoch, **seconds**) after which the job may be cancelled by the client via `enforce_deadline`. Pass `0` to indicate no deadline.
  - **Example (no deadline):** `0`
  - **Example (30-day deadline):** `1710000000 + 2_592_000` = `1712592000` (≈ 2024-04-09 UTC)
  - The contract validates at `post_job` and `accept_job` that `deadline == 0 || current_timestamp <= deadline`.
- `token: Address`: The token used for payment.
- `revision_count: u32`: Number of times the client has rejected work.

## Administrative & Utility Methods

| Function | Parameters | Description |
|----------|------------|-------------|
| `get_job` | `job_id: u64` | Returns the `Job` struct for a given ID. |
| `get_jobs_batch` | `start: u64`, `limit: u32` | Returns a list of jobs starting from `start` up to `limit`. |
| `get_job_count` | - | Returns the total number of jobs created. |
| `get_open_jobs_count`| - | Returns the count of jobs currently in `Open` status. |
| `get_admin` | - | Returns the current contract admin address. |
| `transfer_admin` | `caller: Address`, `new_admin: Address` | Updates the admin address (requires current admin auth). |
| `get_fee_bps` | - | Returns the current platform fee in basis points (default: 250 = 2.5%). |
| `update_fee_bps` | `new_fee_bps: i128` | Updates the fee (requires admin auth). |
| `withdraw_fees` | `token: Address` | Transfers accrued fees to the admin (requires admin auth). |
| `add_allowed_token`| `token: Address` | Whitelists a token for use in jobs (requires admin auth). |
| `is_token_allowed` | `token: Address` | Returns whether a token is whitelisted. |
