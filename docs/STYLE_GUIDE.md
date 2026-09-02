# Style Guide — StellarWork

This document defines the code, comment, and documentation style conventions for the StellarWork project. Following these conventions ensures a consistent codebase that is easy to read, review, and maintain.

**Related:**
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contribution workflow and setup
- [PR Title Conventions](./pr-title-conventions.md) — PR title format details
- [frontend/eslint.config.mjs](../frontend/eslint.config.mjs) — automated TypeScript/React linting
- [pre-commit-config.yaml](../.pre-commit-config.yaml) — automated formatting and linting hooks

---

## Table of Contents

1. [TypeScript Style Conventions](#typescript-style-conventions)
2. [Rust Style Conventions](#rust-style-conventions)
3. [Comment & Docstring Formats](#comment--docstring-formats)
4. [Naming Conventions](#naming-conventions)
5. [Commit Message Guidelines](#commit-message-guidelines)
6. [Automated Linting Configuration](#automated-linting-configuration)

---

## TypeScript Style Conventions

### File Structure

- **One component per file** unless the components are tightly coupled (e.g., a small presentational wrapper and its core component).
- **Barrel exports** in `index.ts` files to simplify imports.
- **Feature-based folders**: group related components, hooks, and utilities by feature (e.g., `app/job/[id]/`, `lib/`).
- **`"use client"` directive** at the top of any file that contains client-side code (interactive components, hooks, browser APIs).

```typescript
"use client";

import { ... } from "...";
```

### Indentation & Formatting

- **Indentation**: 2 spaces (enforced by Prettier via ESLint).
- **Line length**: prefer ~100 characters; no hard cutoff enforced, but long lines should be broken for readability.
- **Semicolons**: required.
- **Quotes**: double quotes for JSX attributes, single quotes for TypeScript strings (Prettier default).
- **Trailing commas**: required in multi-line object/array literals.

### Type System

- **Prefer `interface` over `type`** for object shapes that may be extended.
- **Avoid `any`**; use `unknown` and narrow with type guards when the type is genuinely unknown.
- **Explicit return types** on exported functions to catch regressions at the function boundary.
- **Avoid explicit type annotations on variables** when inference is clear; annotate function parameters and return types.

```typescript
// Good
interface Job {
  id: number;
  client: string;
  status: JobStatus;
}

function getJob(id: number): Promise<Job | null> { ... }

// Avoid
const job: any = fetchData();  // prefer unknown + narrow
```

### React / Component Patterns

- **Presentational components**: wrap with `React.memo` when props are stable and the component is re-rendered frequently.
- **Hooks**: custom hooks should be prefixed with `use` (e.g., `useJob`, `useContract`).
- **Event handlers**: inline arrow functions are acceptable for simple handlers; extract to named functions for complex logic.
- **Conditional rendering**: prefer ternary or early returns over complex inline conditionals.
- **Tailwind CSS only**: no external UI component libraries; use Tailwind utility classes for all styling.

### Imports

- **Absolute imports** via `@/` alias (configured in `tsconfig.json`).
- **Group imports** in this order: external packages → `@/` app imports → relative imports.
- **No default exports** except for page components in the Next.js `app/` router.

```typescript
// Good
import { callContract } from "@/lib/stellar";
import type { Job } from "@/lib/types";
```

### Error Handling

- **Fail fast**: validate inputs at the top of functions.
- **Custom error types** for domain errors (e.g., contract errors, network errors).
- **User-facing errors**: surface clear messages; never expose raw contract error codes to users without translation.

---

## Rust Style Conventions

### Formatting

- ** rustfmt ** is the authoritative formatter. Run `cargo fmt --all -- --check` before committing.
- The project enforces this in CI and via the pre-commit hook (`cargo-fmt`).

### Clippy

- **Zero clippy warnings**: run `cargo clippy --all-targets --all-features -- -D warnings` and fix all warnings.
- Clippy is enforced in CI and via the pre-commit hook (`cargo-clippy`).

### Naming

- **Types** (structs, enums, traits): `PascalCase` (e.g., `Job`, `JobStatus`, `EscrowContract`).
- **Functions and methods**: `snake_case` (e.g., `post_job`, `accept_job`, `resolve_dispute`).
- **Variables and fields**: `snake_case` (e.g., `job_id`, `client_address`, `fee_bps`).
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `DEFAULT_FEE_BPS`, `MAX_REVISIONS`).
- **Contract functions** exposed to the frontend use `snake_case` to match the Soroban convention.
- **Error codes**: `PascalCase` enum variants (e.g., `JobNotFound`, `Unauthorized`).

### Documentation

- **Public functions** must have doc comments (see [Comment & Docstring Formats](#comment--docstring-formats) below).
- **Contract functions** (`#[contractimpl]`) should document:
  - What the function does
  - Authorization requirements (who may call)
  - Preconditions and invariants
  - Events emitted
  - Errors that may be returned
- **Tests** should have doc comments explaining the scenario being tested, especially for complex state-machine tests.

### Error Handling

- **Contract errors**: use the `Error` enum with explicit numeric codes. Every new error variant must be documented in `contract-error-messages.md`.
- **Panic with error**: use `panic_with_error!(&e, Error::XXX)` rather than raw panics.
- **Checked arithmetic**: use `checked_add`, `checked_sub`, `checked_mul_div` helpers to prevent overflow/wrap.

### Testing

- **Unit tests** for every public contract function (happy path + error conditions).
- **Property-based tests** with `proptest` for state machines where applicable.
- **Test naming**: `fn test_description_of_scenario()` (e.g., `fn late_fee_enabled_accrues_fee()`).
- **Test modules**: group related tests under section headers (see existing `test.rs` for the pattern).

### Attributes

- **`#[allow(dead_code)]`** on constants that are referenced in documentation but not directly used.
- **`#[derive(Clone, Debug, Eq, PartialEq)]`** on contract types by default.
- **`#[contracttype]`** on types stored in contract storage.
- **`#[contracterror]`** on the error enum.

---

## Comment & Docstring Formats

### TypeScript Comments

#### Single-line comments

Use `//` for short explanations alongside code. Place above the line they describe, or at the end of the line for very short notes.

```typescript
// Convert a title string to a 64-byte hex representation for BytesN<64>.
export function titleToBytesN64(title: string): Uint8Array { ... }
```

#### Multi-line comments

Use `/** ... */` for documentation that precedes a function, class, or interface. This format is picked up by TypeScript documentation generators.

```typescript
/**
 * Release payment for a single milestone.
 * Only the client may call this; the job must be InProgress.
 */
export async function approveMilestone(
  client: string,
  jobId: string,
  milestoneId: number,
) { ... }
```

#### TSDoc conventions

Follow the [TSDoc](https://tsdoc.org/) standard for API documentation:

| Tag | Usage |
|-----|-------|
| `@param` | Describe each parameter |
| `@returns` | Describe the return value |
| `@throws` | Document errors that may be thrown |
| `@example` | Provide usage examples for non-obvious APIs |

```typescript
/**
 * Fetch all milestones for a job.
 * Returns null if the job has no milestones (regular job).
 *
 * @param jobId - The job ID as a string
 * @returns Array of milestones, or null if the job has none
 */
export async function getMilestones(jobId: string): Promise<Milestone[] | null> { ... }
```

#### Inline comments

Use `//` for explanations of non-obvious logic. Explain **why**, not **what** (the code shows what).

```typescript
// SC-121: no attachments committed at creation.
attachments_root: BytesN::from_array(&e, &[0u8; 32]),
```

### Rust Doc Comments

#### Public items

Use `///` for doc comments on public functions, types, and constants. This format is picked up by `cargo doc`.

```rust
/// Resolve a disputed job.
///
/// Only the admin may call this. `resolution.client_bps` is the share
/// (in basis-points, 0 – 10 000) of the escrowed amount returned to the
/// client. The remainder is paid to the freelancer after deducting the
/// platform fee.
///
/// Special cases:
///   client_bps == 10_000  → full refund to client, no fee, status = Cancelled
///   client_bps == 0       → full payout to freelancer minus fee, status = Completed
pub fn resolve_dispute(e: Env, job_id: u64, resolution: DisputeResolution) { ... }
```

#### Private items

Use `//` for comments on private functions and internal logic. Keep them concise.

```rust
// Checked before any validation or transfer so a replay is rejected
// without moving funds, and cheaply.
if e.storage()
    .persistent()
    .has(&ExtKey::ClientNonce(client.clone(), nonce))
{
    panic_with_error!(&e, Error::DuplicateNonce);
}
```

#### Item-level documentation

Use `//!` for module-level documentation at the top of the file.

```rust
//! SC-120: freelancer verification endpoints.
//!
//! These functions manage the verified/unverified status of freelancer
//! addresses. Verification is an admin-only operation and is idempotent.
```

#### Doc comment structure

A good Rust doc comment for a contract function should include:

1. **One-line summary** — what the function does
2. **Authorization** — who may call it
3. **Parameters** — what each parameter represents
4. **Returns** — what is returned (for view functions)
5. **Events** — what events are emitted
6. **Errors** — what errors may be returned
7. **Special cases** — edge cases, invariants, or notable behavior

```rust
/// Post a job with a client-supplied idempotency nonce.
///
/// A double-submitted transaction — a wallet retry, a double-clicked
/// button — otherwise creates a second job and locks a second escrow. With
/// a nonce, the replay is rejected with [`Error::DuplicateNonce`] and the
/// client can recover the original job id via [`Self::get_job_id_for_nonce`].
///
/// A separate entry point rather than an added parameter on `post_job`:
/// changing that signature would break every existing caller and stored
/// client, and the issue asks for the nonce to be optional. Callers that do
/// not supply one keep the existing behaviour unchanged.
pub fn post_job_with_nonce(...) -> u64 { ... }
```

### Documentation Links

- Cross-reference other functions with `[` and `]` (e.g., `[`Self::get_job_id_for_nonce`]`).
- Cross-reference error variants with `[`Error::DuplicateNonce`]`.
- Link to external documentation with Markdown links.

---

## Naming Conventions

### TypeScript / React

#### Components

- **PascalCase** for component names (e.g., `JobCard`, `DashboardStats`, `PostJobForm`).
- **File name matches component name**: `JobCard.tsx` exports `JobCard`.
- **Page components**: follow the route structure (e.g., `app/job/[id]/page.tsx` exports the `JobDetailPage` component).
- **Layout components**: prefix with `Layout` (e.g., `MainLayout`, `AdminLayout`).
- **Widget/partial components**: describe their purpose (e.g., `RecentContractInteractionsWidget`, `JobStatusBadge`).

#### Functions

- **camelCase** for function names (e.g., `postJob`, `getCompletedJobsCount`, `resolveDispute`).
- **Verb-noun pattern** for action functions: `postJob`, `acceptJob`, `submitWork`, `cancelJob`.
- **Query functions**: prefix with `get` or `fetch` (e.g., `getJob`, `getJobsBatch`, `fetchSwapQuote`).
- **Hook functions**: prefix with `use` (e.g., `useJob`, `useContract`, `useFeatureFlag`).
- **Utility functions**: describe the transformation (e.g., `hexToBytes`, `titleToBytesN64`, `nativeToScVal`).

#### Variables & Constants

- **camelCase** for variables and parameters (e.g., `jobId`, `clientAddress`, `feeBps`).
- **UPPER_SNAKE_CASE** for module-level constants (e.g., `MAX_JOB_LIMIT`, `DEFAULT_PAGE_SIZE`).
- **Boolean variables**: prefix with `is`, `has`, `should`, `can` (e.g., `isLoading`, `hasError`, `shouldRetry`).

#### Types & Interfaces

- **PascalCase** for interfaces and types (e.g., `Job`, `Milestone`, `JobStatusCounts`).
- **Interface names**: noun phrases describing the shape (e.g., `CompletionCertificate`, `MilestoneInput`).
- **Type aliases**: use when the type is a transformation or union (e.g., `JobId = string`).

#### Event Names

- **kebab-case** for custom event names dispatched on `window` (e.g., `stellarwork:job-cancelled`, `stellarwork:job-status-changed`).

### Rust / Soroban

#### Contract Functions

- **snake_case** for all contract function names (e.g., `post_job`, `accept_job`, `submit_work`, `resolve_dispute`).
- **Verb-noun pattern** for action functions: `post_job`, `cancel_job`, `extend_deadline`.
- **Query functions**: prefix with `get` (e.g., `get_job`, `get_job_count`, `get_dashboard_stats`).
- **Admin-only functions**: prefix with `admin_` when the scope is admin-specific (e.g., `admin_get_all_jobs`, `admin_get_job_count`).

#### Types

- **PascalCase** for structs, enums, and type aliases (e.g., `Job`, `JobStatus`, `DashboardStats`, `DisputeResolution`).
- **Enum variants**: `PascalCase` (e.g., `JobStatus::Open`, `JobStatus::InProgress`).
- **Data keys**: `PascalCase` enum variants (e.g., `DataKey::JobsCount`, `DataKey::Job(u64)`).

#### Variables

- **snake_case** for variables, parameters, and fields (e.g., `job_id`, `client_address`, `fee_bps`).
- **Boolean variables**: prefix with `is_`, `has_`, `should_`, `enabled` (e.g., `is_verified`, `late_fee_enabled`).

#### Constants

- **SCREAMING_SNAKE_CASE** for constants (e.g., `DEFAULT_FEE_BPS`, `MAX_REVISIONS`, `UPGRADE_TIMELOCK_SECS`).
- **Symbolic constants**: use `Symbol::new` with a descriptive string, but the Rust constant name follows the SCREAMING_SNAKE_CASE convention (e.g., `const JOB_CREATED: Symbol = symbol_short!("job_created");`).

#### Test Functions

- **snake_case** with descriptive names (e.g., `fn late_fee_enabled_accrues_fee()`, `fn archive_old_jobs_archives_at_cutoff_boundary()`).
- **Section headers**: use comments to group related tests (e.g., `// ── SC-120 (#749): freelancer verification ───`).

---

## Commit Message Guidelines

### Format

StellarWork follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(frontend): add network switcher dropdown` |
| `fix` | Bug fix | `fix(contract): handle zero-amount post_job edge case` |
| `docs` | Documentation only | `docs(readme): update installation instructions` |
| `style` | Code style (formatting, no logic change) | `style(frontend): apply project style guide` |
| `refactor` | Code restructuring without feature/bug change | `refactor(contract): simplify job state machine` |
| `test` | Adding or updating tests | `test(frontend): add e2e test for job submission` |
| `chore` | Maintenance tasks | `chore(deps): update dependencies` |
| `ci` | CI/CD changes | `ci(workflow): add PR title lint check` |
| `build` | Build system changes | `build(contract): update soroban-sdk version` |
| `perf` | Performance improvement | `perf(frontend): optimize job listing rendering` |
| `revert` | Revert a previous commit | `revert: feat(add-feature)` |

### Scopes

| Scope | Usage |
|-------|-------|
| `contract` | Smart contract changes |
| `frontend` | Frontend application changes |
| `docs` | Documentation |
| `ci` | CI/CD configuration |
| `scripts` | Scripts and tooling |
| `deps` | Dependencies |
| `config` | Configuration files |

### Description

- Use the **imperative mood** (e.g., "add" not "added" or "adds").
- Use **lowercase** letters (except for proper nouns).
- **No trailing period**.
- Keep under **72 characters** total.
- Be **concise but descriptive**.

### Body (optional)

Use the body for:
- Explaining **why** the change was made (not what — the diff shows what).
- Listing breaking changes with `BREAKING CHANGE:` prefix.
- Providing context for complex refactors.

```
feat(contract): add dispute resolution functionality

Implements on-chain dispute resolution with flexible client/freelancer
split outcomes. Disputes can be raised by either party and resolved by
the admin with a configurable payout split.

Closes #123
```

### Footer (optional)

- Reference issues with `Closes #<number>` or `Fixes #<number>`.
- Reference PRs with `Ref: #<number>`.
- Note breaking changes with `BREAKING CHANGE: <description>`.

### Examples

**Good:**
```
feat(frontend): add network switcher dropdown
fix(contract): handle zero-amount post_job edge case
docs(readme): update deployment instructions
test(contract): add test for edge case in fee calculation
chore(deps): update Next.js to version 15
ci(workflow): add automated PR title linting
style(frontend): apply project style guide
```

**Bad (will fail CI):**
```
❌ Add new feature                    # missing type
❌ FEAT: add new feature              # wrong case
❌ feat: Add new feature.             # period at end
❌ feat: This is a very long description that exceeds the 72 character limit
❌ added new feature                  # wrong mood
❌ wip                                # not a valid type
```

See [PR Title Conventions](./pr-title-conventions.md) for full details and CI enforcement information.

---

## Automated Linting Configuration

StellarWork uses automated tools to enforce style conventions. All checks run in CI and can be run locally.

### Frontend (TypeScript / React)

| Tool | Configuration | Purpose |
|------|--------------|---------|
| **ESLint** | [frontend/eslint.config.mjs](../frontend/eslint.config.mjs) | Lints TypeScript, React hooks, accessibility, and code quality rules |
| **TypeScript** | [frontend/tsconfig.json](../frontend/tsconfig.json) | Type checking with strict mode enabled |
| **Prettier** | (via ESLint integration) | Code formatting (indentation, quotes, semicolons, trailing commas) |

**Run locally:**
```bash
cd frontend
npm run lint          # ESLint with auto-fix
npm run typecheck     # TypeScript type checking
```

### Rust (Contract)

| Tool | Configuration | Purpose |
|------|--------------|---------|
| **rustfmt** | (default Rust format) | Code formatting |
| **clippy** | (default Rust lint) | Linting and warnings |
| **cargo test** | [contracts/escrow/Cargo.toml](../contracts/escrow/Cargo.toml) | Unit and integration tests |

**Run locally:**
```bash
cd contracts/escrow
cargo fmt --all -- --check    # Check formatting
cargo clippy --all-targets --all-features -- -D warnings  # Check linting
cargo test                    # Run tests
make coverage-contract        # Run coverage (requires cargo-tarpaulin)
```

### Pre-commit Hooks

Pre-commit hooks run automatically on commit (when installed) and can be run manually:

```bash
# Install hooks
pre-commit install

# Run all hooks manually on all files
pre-commit run --all-files

# Skip hooks for a work-in-progress commit
git commit -m "wip" --no-verify
```

**Hooks configured in [`.pre-commit-config.yaml`](../.pre-commit-config.yaml):**

| Hook | Files | Check |
|------|-------|-------|
| `trailing-whitespace` | all | Remove trailing whitespace |
| `end-of-file-fixer` | all | Ensure files end with a newline |
| `check-yaml` | all | Validate YAML syntax |
| `check-added-large-files` | all | Prevent large file commits |
| `cargo-fmt` | `*.rs` | Rust formatting |
| `cargo-clippy` | `*.rs` | Rust linting |
| `frontend-lint` | `frontend/**/*.{js,jsx,ts,tsx}` | ESLint |

### CI Enforcement

- **PR Title Lint**: PR titles are checked against the Conventional Commits format in CI. See [PR Title Conventions](./pr-title-conventions.md).
- **Frontend CI**: Runs ESLint, TypeScript type checking, and tests on all frontend changes.
- **Contract CI**: Runs `cargo fmt --check`, `cargo clippy`, and `cargo test` on all contract changes.
- **Secret Scanning**: Gitleaks is enforced in CI to prevent credential commits.

---

## Quick Reference

| Convention | TypeScript | Rust |
|------------|-----------|------|
| **File naming** | `PascalCase.tsx` matching component | `snake_case.rs` or module file |
| **Component/type names** | `PascalCase` | `PascalCase` (structs, enums) |
| **Function names** | `camelCase` | `snake_case` |
| **Variable names** | `camelCase` | `snake_case` |
| **Constants** | `UPPER_SNAKE_CASE` | `SCREAMING_SNAKE_CASE` |
| **Private fields** | `_camelCase` or `camelCase` | `snake_case` |
| **Comments** | `//` for inline, `/** */` for docs | `//!` for module, `///` for items, `//` for inline |
| **Formatting** | Prettier via ESLint | rustfmt |
| **Linting** | ESLint + TypeScript | clippy (`-D warnings`) |

---

*Last updated: 2026-09-02*
