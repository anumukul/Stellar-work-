# Deadline Extension: Implementation Notes (SC-113)

Summary
-------
- Implemented a stricter `extend_deadline` flow for jobs in the escrow contract.

What changed
------------
- Updated function: `extend_deadline` in `contracts/escrow/src/lib.rs`.
- New semantics:
  - Only the job `client` may call `extend_deadline`.
  - Only allowed when the job status is `InProgress`.
  - The `new_deadline` must be strictly greater than the currently stored deadline.
  - The updated deadline is persisted on-chain.
  - Emits a new event topic `deadline_extended` with payload `(job_id, old_deadline, new_deadline)`.

Rationale
---------
- Ensures clients cannot shorten or reset deadlines to past values.
- Limits the extension path to active work in progress, avoiding accidental extension on closed/archived jobs.
- Emitting `deadline_extended` helps indexers and off-chain services observe deadline changes.

Frontend
--------
- The frontend helper `extendDeadline` in `frontend/lib/contract.ts` already calls the contract entrypoint. No UI changes were made here as part of this task.

Testing
-------
- I attempted to run the contract tests locally but the Windows environment lacks the MSVC linker (`link.exe`), which blocks building native toolchain-dependent crates.
- Recommended verification commands (run in the repo or inside the provided Docker dev environment):

```bash
# Start services (if not already running)
docker compose up -d

# Run escrow contract tests inside the contract-builder container
docker compose exec contract-builder bash -lc "cargo test --manifest-path contracts/escrow/Cargo.toml"
```

Notes
-----
- Per instruction, no new CI tests were added. If you want test cases added locally (not in CI), I can prepare them — otherwise the change is confined to the contract code and documented here.

Next steps (optional)
---------------------
- Add contract unit tests for the following cases:
  - successful extension by client when job is `InProgress` and `new_deadline > current`
  - reject when caller is not the client
  - reject when job is not `InProgress`
  - reject when `new_deadline <= current`
- Update frontend UI to display a confirmation/notification when the deadline is extended.

Change reference
----------------
- Contract file: `contracts/escrow/src/lib.rs` (function `extend_deadline`)

Documented by: development assistant
