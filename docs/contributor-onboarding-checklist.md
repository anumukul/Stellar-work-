# First-Time Contributor Guide

Welcome to StellarWork. This guide takes you from a cloned repository to a
small, reviewable first contribution. Keep [CONTRIBUTING.md](../CONTRIBUTING.md)
open for the complete project rules and [STYLE_GUIDE.md](./STYLE_GUIDE.md) open
when changing code or documentation.

## 1. Find a good first task

Start with an issue rather than choosing an untracked change. Search the
repository's [good first issue](https://github.com/anumukul/Stellar-work-/labels/good%20first%20issue)
label, or look for a small documentation, test, or maintenance issue that has
clear acceptance criteria.

The main labels tell you what kind of work an issue involves:

| Label | Meaning |
| --- | --- |
| `bug` | A confirmed regression or broken behavior |
| `enhancement` | A new feature or improvement |
| `documentation` | Docs-only work |
| `contract` | Soroban contract logic or tests in `contracts/` |
| `frontend` | Next.js, React, or styling work in `frontend/` |
| `maintenance` | Refactoring, cleanup, dependencies, or CI |
| `good first issue` | Small, well-defined work suitable for a new contributor |
| `needs info` | The issue needs reproduction steps, logs, or another detail |
| `priority: high`, `priority: medium`, `priority: low` | Impact and urgency |

Read [TRIAGE.md](./TRIAGE.md) for the complete label meanings and maintainer
triage process. Before starting, check for duplicate issues and leave a short
comment if the issue is already assigned or someone is actively working on it.

## 2. Clone and prepare the environment

You need Git, Docker, and a working terminal. For manual development, also
install Node.js 18+, npm 9+, stable Rust, and the Soroban CLI. Never add wallet
private keys, `S...` secrets, API tokens, or local credentials to the repository.

```bash
git clone https://github.com/<your-org>/Stellar-work-.git
cd Stellar-work-
git remote -v
```

Create a branch from `main` using the issue number:

```bash
git switch main
git pull --ff-only
git switch -c docs/123-improve-onboarding
```

Use `feature/`, `fix/`, `docs/`, `chore/`, or `ci/` as the branch prefix, as
described in [CONTRIBUTING.md](../CONTRIBUTING.md#branching).

## 3. Start the local development stack

Docker Compose is the recommended path when you need the complete application:

```bash
cp frontend/.env.example frontend/.env.local
docker compose up
```

The stack provides a local Stellar service with Soroban RPC on port `8000`, a
Next.js frontend on `http://localhost:3000`, and a contract-builder container.
The first Stellar startup can take 20–30 seconds.

Useful commands while working:

```bash
docker compose ps
docker compose logs frontend
docker compose logs stellar
docker compose down
```

For a fresh local chain, use `docker compose down -v`. This removes local
volumes and test state.

For frontend-only work, use the manual path:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Set the required `NEXT_PUBLIC_CONTRACT_ID` values in `.env.local` when a page
needs contract interaction. See [environments.md](./environments.md) for the
network-specific variables.

For isolated contract tests, the repository also provides:

```bash
./scripts/setup-devnet.sh
./scripts/run-tests-local.sh
```

## 4. Know where changes belong

| Directory | Common changes |
| --- | --- |
| `contracts/escrow/` | Soroban contract entry points, storage, errors, and Rust tests |
| `frontend/app/` | Next.js routes and page-level workflows |
| `frontend/components/` | Reusable UI components and presentation |
| `frontend/lib/` | Contract wrapper, wallet/RPC code, hooks, validation, and shared utilities |
| `frontend/__tests__/` | Frontend unit and contract-interaction tests |
| `frontend/e2e/` | Browser workflow tests |
| `frontend/messages/` | Translation strings and locale content |
| `docs/` | Architecture, API, deployment, testing, and contributor documentation |
| `scripts/` | Local devnet and repository automation |
| `monitoring/` | Prometheus, Grafana, and alerting configuration |
| `.github/workflows/` | CI, preview, deployment, and quality checks |

A few common entry points:

- Contract lifecycle behavior starts in `contracts/escrow/src/lib.rs`; nearby
  Rust tests are in `contracts/escrow/src/test.rs`.
- Frontend contract calls are exposed by `frontend/lib/contract.ts` and the
  transaction lifecycle is implemented in `frontend/lib/stellar.ts`.
- Shared frontend types are in `frontend/lib/types.ts`.
- The docs index is [`docs/README.md`](./README.md).

Before editing, follow the nearest existing implementation and test. For a
contract change, check the public method's authorization, state transitions,
errors, events, and storage impact. For a frontend change, find the page or
component that owns the behavior and add a focused test beside the existing
tests.

## 5. Use the normal development loop

1. Read the linked issue and identify the smallest acceptance criterion.
2. Locate the owning module and one neighboring test or call site.
3. Make a focused change that preserves existing public APIs unless the issue
   requires a contract change.
4. Run the narrowest relevant test while iterating.
5. Run the broader checks required by the changed area.
6. Inspect the diff for unrelated formatting, generated files, secrets, or debug
   output.

The main Make targets run through Docker Compose:

```bash
make test-contract    # Rust contract tests
make test-frontend    # Frontend unit tests
make lint-frontend    # ESLint
make typecheck        # TypeScript checks
make build            # Frontend production build
```

For contract changes, also run `cargo fmt --all -- --check` and
`soroban contract build` in `contracts/escrow`. For frontend or client changes,
run lint, typecheck, tests, and the production build when practical. UI changes
should be checked in a browser at the affected route and at mobile and desktop
widths.

## 6. Follow the project conventions

- Use Conventional Commits for commit messages and PR titles, for example
  `fix(contract): reject expired deadlines` or `docs: clarify local setup`.
- Use two-space TypeScript indentation, typed interfaces, absolute `@/` imports,
  and Tailwind utilities for frontend styling.
- Use `snake_case` for Rust and contract methods, `PascalCase` for Rust types,
  and `camelCase` for TypeScript functions and variables.
- Add tests for new behavior and regression tests for bug fixes.
- Document public contract functions, authorization requirements, preconditions,
  emitted events, and errors.
- Keep user-facing errors actionable; do not expose raw contract codes as the
  final message.
- Keep the change scoped to the linked issue. Avoid drive-by refactors.

See [STYLE_GUIDE.md](./STYLE_GUIDE.md) for the detailed TypeScript, Rust,
comment, naming, testing, and formatting rules.

## 7. Prepare the first pull request

Create the PR against `main` after pushing your branch. The repository's
[PR template](../.github/PULL_REQUEST_TEMPLATE.md) expects the following:

- **Linked issue:** use `Closes #123` or the appropriate issue reference.
- **PR title:** use the Conventional Commits format required by CI.
- **What changed:** summarize the implementation and relevant trade-offs.
- **Validation:** list the contract/frontend checks you ran and mark anything
  that does not apply.
- **UI evidence:** include screenshots or a short clip for UI changes, or note
  `N/A` for non-visual work.
- **Additional notes:** call out follow-up work, risks, migration details, or
  reviewer context.

Before opening the PR, review the rendered description and confirm that the
issue number, test commands, screenshots, and environment assumptions are
clear to someone who did not make the change.

## First contribution checklist

- [ ] Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [STYLE_GUIDE.md](./STYLE_GUIDE.md).
- [ ] Read the linked issue and confirm it is not a duplicate or already being worked on.
- [ ] Clone the repository and create an issue-named branch from `main`.
- [ ] Start either Docker Compose or the smallest manual environment needed.
- [ ] Locate the owning directory, entry point, and neighboring test.
- [ ] Make the smallest change that satisfies the issue.
- [ ] Add or update tests and documentation required by the change.
- [ ] Run focused checks, then the relevant full checks.
- [ ] Review `git diff` and `git status` for unrelated files or secrets.
- [ ] Push the branch and complete the PR template.
- [ ] Include screenshots or a short clip for UI work.
- [ ] Respond to review feedback with follow-up commits and rerun affected checks.

## Troubleshooting and next references

- Setup and Docker issues: [DOCKER_COMPOSE_SETUP.md](./DOCKER_COMPOSE_SETUP.md)
- Contract and frontend test coverage: [testing-matrix.md](./testing-matrix.md)
- Contract methods and states: [contract-reference.md](./contract-reference.md)
- Frontend-contract calls: [FRONTEND_CONTRACT_INTERACTION.md](./FRONTEND_CONTRACT_INTERACTION.md)
- Issue labels and triage: [TRIAGE.md](./TRIAGE.md)
- Full documentation index: [README.md](./README.md)
