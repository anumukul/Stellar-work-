# StellarWork Escrow Contract

Soroban smart contract for a decentralized freelance escrow flow.

## Implemented

- `initialize(admin, native_token)`
- `post_job(client, amount, desc_hash, deadline)`
- `accept_job(freelancer, job_id)`
- `submit_work(freelancer, job_id)`
- `approve_work(client, job_id)`
- `cancel_job(client, job_id)`
- `get_job(job_id)`
- `get_job_count()`

## Stubbed

- `raise_dispute(job_id)`
- `resolve_dispute(job_id, winner)`

## Test

```bash
cargo test
```
