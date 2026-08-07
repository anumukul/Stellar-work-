# Contributing to StellarWork

Thanks for contributing! Please take a moment to review this guide before
submitting changes. All contributors are expected to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

New contributors: start with the [onboarding checklist](docs/contributor-onboarding-checklist.md) and the [docs index](docs/README.md).

## Development Setup

### Prerequisites

- **Node.js** 18+ and **npm** 9+
- **Rust** stable toolchain (for contract development)
- **Soroban CLI** (for contract builds and deploys)
- **Docker** (optional, for local Stellar network)

### Clone and Install

```bash
git clone https://github.com/<your-org>/Stellar-work-.git
cd Stellar-work-
```

**Frontend only:**

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

**Full stack with Docker:**

```bash
cp frontend/.env.example frontend/.env.local
docker compose up -d
```

This starts the frontend (port 3000), a contract builder, and a local Stellar
dev network with Soroban RPC (port 8000).

### Run Checks Locally

```bash
make test-contract      # cargo test in contracts/escrow
make test-frontend      # vitest unit tests
make lint-frontend      # ESLint
make typecheck          # TypeScript type checking
```

## Branching

- Fork the repository and create branches from `main`.
- Use the naming convention: `<type>/<issue-number>-<short-description>`

| Type | Usage |
|------|-------|
| `feature/` | New features and enhancements |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |
| `chore/` | Maintenance, dependency updates, refactoring |
| `ci/` | CI/CD pipeline changes |

Examples: `feature/42-add-dark-mode`, `fix/17-wallet-connection`, `docs/8-api-reference`

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `style`, `perf`

**Scopes**: `contract`, `frontend`, `docs`, `ci`, `scripts`

Examples:
```
feat(frontend): add network switcher dropdown
fix(contract): handle zero-amount post_job edge case
docs(readme): add deployment walkthrough
chore(deps): bump @stellar/stellar-sdk to 15.0.1
```

## Coding Standards

- Run `soroban contract build` in `contracts/escrow`.
- Run `cargo test` in `contracts/escrow`.
- Run `cargo fmt --all -- --check` in `contracts/escrow` to verify formatting.
- Run `make coverage-contract` to verify test coverage meets the 80% threshold.
- Run frontend checks for changed frontend files.
### Rust (Contract)

- Follow `rustfmt` formatting: `cargo fmt --all -- --check`
- Run `cargo clippy` and address warnings
- All public contract functions must have unit tests
- Use `proptest` for property-based testing of state machines

### TypeScript / React (Frontend)

- Follow ESLint configuration in `frontend/eslint.config.mjs`
- Use `"use client"` directive at the top of client component files
- Use Tailwind CSS utilities for all styling — no external UI libraries
- Prefer `React.memo` for pure presentational components
- Use dynamic imports for large or rarely-used components
- All new features must include unit tests in `frontend/__tests__/`

## Development Rules

- Contract changes must include or update unit tests and test snapshots.
- Frontend PRs must not break existing pages or introduce TypeScript errors.
- Use Tailwind utilities only. Do not introduce external UI component libraries.
- Keep scope focused on the linked issue — avoid unrelated changes.
- Run `npm run typecheck` before pushing frontend changes.

## Contract Code Coverage

To maintain high code quality, we track test coverage for our Soroban smart contracts. We require a minimum of **80% code coverage** for all Rust contract code.

### Running Coverage Locally

You can generate code coverage reports locally using `cargo-tarpaulin`.

1. Ensure you have `cargo-tarpaulin` installed:
   ```bash
   cargo install cargo-tarpaulin
   ```
2. Run the coverage script using the Makefile:
   ```bash
   make coverage-contract
   ```
   Or run the script directly:
   ```bash
   ./contracts/coverage.sh
   ```

This will run the test suite, analyze the coverage, and generate:
- An interactive HTML report at `coverage/tarpaulin-report.html` (open this in your browser to inspect line-by-line coverage).
- An LCOV report at `coverage/lcov.info` (used for CI integration).

## Pre-commit Hooks (Optional)

To ensure consistent code quality, you can optionally set up pre-commit hooks. This will automatically run linting and formatting checks before each commit.

### Setup

1. Install [pre-commit](https://pre-commit.com/#install).
2. Install the hooks in this repository:
   ```bash
   pre-commit install
   ```

### Hook Checks

The following checks are performed:
- **General**: Trailing whitespace, end-of-file fixers, YAML validation, large file check.
- **Rust**: `cargo fmt` (formatting) and `cargo clippy` (linting).
- **Frontend**: `npm run lint` (ESLint).

### Usage and Opt-out

- **Manual Run**: You can run all hooks manually on all files:
  ```bash
  pre-commit run --all-files
  ```
- **Skipping Hooks**: If you need to commit without running hooks (e.g., for a work-in-progress commit), use the `--no-verify` flag:
  ```bash
  git commit -m "your message" --no-verify
  ```
- **Uninstalling**: To remove the hooks:
  ```bash
  pre-commit uninstall
  ```

## Architecture Decision Records (ADRs)

When making significant architectural changes, please submit an ADR in the `docs/adr/` directory.

### ADR Creation Checklist
- [ ] Use the standard template format.
- [ ] Title, Status, and Date are clearly stated.
- [ ] Context explains the motivating issue.
- [ ] Decision details the proposed change.
- [ ] Consequences list what becomes easier or harder.
- [ ] Linked from relevant code comments if applicable.

## Pull Request Process

1. **Open an issue** (if one doesn't exist) describing the bug or feature.
2. **Create a branch** from `main` following the naming convention above.
3. **Implement your changes**, writing tests and updating docs as needed.
4. **Run all checks locally**:
   - Contract: `cargo test && cargo fmt --all -- --check && cargo clippy`
   - Frontend: `npm run lint && npm run typecheck && npm test`
5. **Push your branch** and open a pull request against `main`.
6. **Fill out the PR template** — reference the issue, explain design choices,
   and include screenshots or short clips for UI changes.
7. **Request review** from a maintainer. All PRs require at least one approving
   review before merge.
8. **Address review feedback** by pushing additional commits or amending.

### PR Title Format

PR titles should follow the same conventional commit format:

```
feat(frontend): add network switcher dropdown
fix(contract): handle zero-amount post_job edge case
```

See [PR title conventions](docs/pr-title-conventions.md) for details.

### Test Requirements

- **New contract functions**: must have unit tests covering happy path and error
  conditions. Update test snapshots if needed.
- **New frontend features**: must have at least one unit test covering the core
  behavior. Complex UI components should include Storybook stories.
- **Bug fixes**: must include a regression test preventing the bug from
  recurring.
- **Refactors**: existing tests must continue to pass. Update tests if behavior
  changes.

## Feature Flags

StellarWork uses a feature flag system (`frontend/lib/feature-flags.ts`) to enable gradual rollouts, A/B testing, and emergency feature disabling without deployments.

### Available Flags

| Flag | Description |
|------|-------------|
| `newDashboard` | New analytics dashboard layout |
| `newMessaging` | Redesigned messaging interface |
| `biddingSystem` | Freelancer bidding system for jobs |
| `milestones` | Milestone-based payment releases |
| `multiToken` | Support for multiple token types |

### Using Flags in Code

```typescript
import { isEnabled } from "@/lib/feature-flags";

if (isEnabled("newMessaging")) {
  // render new messaging UI
}
```

### Evaluation Order

Flags are evaluated in this priority order (highest first):

1. **URL parameters**: `?feature.newMessaging=true`
2. **Environment variables**: `NEXT_PUBLIC_FF_NEWMESSAGING=true`
3. **localStorage overrides**: Set via the admin panel
4. **Default value**: Defined in `FLAG_DEFINITIONS`

### Admin Panel

Admins can toggle flags from the admin panel. Overrides are persisted in `localStorage` under the key `stellarwork:feature-flags`.

### Adding a New Flag

1. Add the flag to `FLAG_DEFINITIONS` in `frontend/lib/feature-flags.ts` with a default value and description.
2. Use `isEnabled('yourFlag')` in components.
3. Write tests covering both enabled and disabled states.
4. Document the flag in the table above.

### Development Helpers

- Use `logActiveFlags()` to print all active flags to the console for debugging.
- Use `getActiveFlags()` to inspect the current state of all flags programmatically.
- Use URL overrides (`?feature.flagName=true`) to test flags without changing localStorage.

## Getting Help

- **GitHub Issues**: Search existing issues or open a new one.
- **GitHub Discussions**: For questions, ideas, or general conversation.
- **Discord**: Join the Stellar Developer Discord for real-time help.

Stuck on your first contribution? Look for issues labeled `good first issue` —
they're curated for newcomers and have additional context in the comments.

## Contributor Recognition

All contributors are listed in our [README](README.md) and release notes.
We value every contribution — from fixing a typo to shipping a major feature.
First-time contributors get a special shoutout in the monthly community update.

## Issue Labels

We use labels to categorize issues and pull requests. Please use them accordingly. For a detailed breakdown of our triage process and label meanings, see the [Issue Triage Guide](docs/TRIAGE.md).

| Label | Description | Example |
| :--- | :--- | :--- |
| `bug` | Something isn't working as expected. | [Bug]: Contract revert on init |
| `enhancement` | New feature or request for improvement. | [Feature]: Add dark mode |
| `documentation` | Improvements or additions to docs. | Add labels guide |
| `good first issue` | Good for newcomers to the project. | Fix typo in README |
| `contract` | Related to Soroban smart contracts. | Update escrow logic |
| `frontend` | Related to the Next.js web application. | Fix navigation alignment |
| `maintenance` | Chore, refactoring, or dependency updates. | Update next.js to latest |
| `invalid` | This doesn't seem right or is out of scope. | Feature request for unrelated app |

## Stale Issue Policy

To keep our issue tracker manageable, we use automated stale issue management:

### Timing
- Issues are marked as **stale** after 30 days of inactivity
- Stale issues are **closed** after 7 additional days (37 days total from last activity)

### Exempt Labels
The following labels exempt issues from being marked stale:
- `bug` - Bugs may need extended investigation
- `security` - Security issues require careful handling
- `good first issue` - Reserved for newcomers
- `help wanted` - Issues seeking community contribution
- `pinned` - Important issues kept visible
- `in-progress` - Currently being worked on
- `blocked` - Waiting on dependencies or external factors

### Removing Stale Status
If an issue is marked as stale, you can remove the stale status by:
- Leaving a comment on the issue
- Updating the issue with new information
- Closing the issue if it's no longer relevant

This resets the inactivity timer.
