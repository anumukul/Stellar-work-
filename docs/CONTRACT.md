# Escrow Contract Reference

Location: `contracts/escrow/src/lib.rs`

## Implemented (Starter Kit)

- `post_job(amount, desc_hash, deadline)`
- `accept_job(job_id)`
- `submit_work(job_id)`
- `approve_work(job_id)`
- `cancel_job(job_id)`
- `get_job(job_id)`
- `get_job_count()`

## Stubbed (Contributor Scope)

- `raise_dispute(job_id)` — not implemented
- `resolve_dispute(job_id, winner)` — not implemented

## Data Model

- `Job`: `client`, `freelancer`, `amount`, `description_hash`, `status`, `created_at`, `deadline`
- `JobStatus`: `Open`, `InProgress`, `SubmittedForReview`, `Completed`, `Cancelled`, `Disputed`

## Error Codes

- `1` JobNotFound
- `2` Unauthorized
- `3` InvalidStatus
- `4` InsufficientFunds
- `5` JobAlreadyAccepted
- `6` DeadlinePassed
- `7` AlreadyInitialized
