# Release Checklist

Use this checklist before creating a release tag.

## Contract

- Run contract tests: `cd contracts/escrow && cargo test`
- Build contract artifact: `cd contracts/escrow && soroban contract build`
- Confirm expected wasm exists at `contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm`

## Frontend

- Install dependencies: `cd frontend && npm install`
- Run unit tests: `cd frontend && npm test`
- Run lint checks: `cd frontend && npm run lint`
- Build production bundle: `cd frontend && npm run build`
- Verify `NEXT_PUBLIC_CONTRACT_ID` is set for the target environment

## Release

- Update release notes/changelog for user-facing and contract changes
- Bump version in the release metadata used by maintainers
- Create and push a version tag (example: `v1.2.0`)
- Open GitHub release for the tag and attach notes/artifacts as needed
