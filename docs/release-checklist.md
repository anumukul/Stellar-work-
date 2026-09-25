# Release Checklist

Use this checklist before creating a release tag.

## Contract

- Run contract tests: `cd contracts/escrow && cargo test`
- Review data integrity test results for state transitions (see [State Transition QA Checklist](../contracts/escrow/STATE_TRANSITION_QA_CHECKLIST.md))
- Build contract artifact: `cd contracts/escrow && soroban contract build`
- Confirm expected wasm exists at `contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm`

## Frontend

- Install dependencies: `cd frontend && npm install`
- Run unit tests: `cd frontend && npm test`
- Run lint checks: `cd frontend && npm run lint`
- Build production bundle: `cd frontend && npm run build`
- Verify `NEXT_PUBLIC_CONTRACT_ID`, `NEXT_PUBLIC_NETWORK`, and `NEXT_PUBLIC_SOROBAN_RPC` match the target environment. See `docs/environments.md`.

## Communications

- For planned downtime, use [maintenance-window-announcement-template.md](./maintenance-window-announcement-template.md)
- For production incidents, follow [production-escalation.md](./production-escalation.md)

## Release

- Update release notes/changelog for user-facing and contract changes (see [release-notes-guide.md](./release-notes-guide.md))
- Bump version in the release metadata used by maintainers
- Create and push a version tag (example: `v1.2.0`)
- Open GitHub release for the tag and attach notes/artifacts as needed

## Rollback Checklist (Failed Release)

- Halt rollout and pause any scheduled deployment jobs
- Confirm failure scope (frontend, contract interaction, environment configuration, or mixed)
- Revert to the last known-good deployment artifact or version tag
- Re-point runtime environment values to the previous stable release if they changed
- Validate rollback in production:
  - Homepage loads and wallet connection works
  - Open job listing renders and job detail routes resolve
  - Contract reads (`get_job_count`, `get_job`) respond successfully
  - Critical write path sanity check succeeds in a controlled environment
- Verify observability after rollback:
  - Error rate returns to pre-release baseline
  - No elevated client-side console/runtime errors
  - No new contract-level failures in transaction monitoring
- Communicate status updates:
  - Post rollback start and completion updates in the release channel
  - Notify maintainers and contributors about impact and mitigation status
  - Post user-facing incident update if release impact was externally visible
- Open follow-up issue with root cause, timeline, and preventive actions before retrying release
