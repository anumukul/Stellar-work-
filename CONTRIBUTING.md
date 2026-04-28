# Contributing to StellarWork

Thanks for contributing.

## Branching

- Fork and create branches as `feature/<issue-number>-<short-description>`.

## Development Rules

- Contract changes must include or update unit tests.
- Frontend PRs must not break existing pages.
- Use Tailwind utilities only. Do not introduce external UI component libraries.
- Keep scope focused on the linked issue.

## Before Opening a PR

- Run `soroban contract build` in `contracts/escrow`.
- Run `cargo test` in `contracts/escrow`.
- Run frontend checks for changed frontend files.

## Pull Request Requirements

- Reference the issue number in the PR description.
- Include a brief explanation of design choices and trade-offs.
- Include screenshots or short clips for UI changes.
- Maintainer review is required before merge.
