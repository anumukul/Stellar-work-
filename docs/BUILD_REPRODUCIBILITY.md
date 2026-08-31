# Build Reproducibility

This document describes how contract builds are verified to be reproducible,
what that means, and how to run the check locally.

## What "reproducible" means here

A build is reproducible when compiling the same source revision twice (or on
two different machines) produces **bit-for-bit identical WASM bytecode**.
This makes it possible to verify that a deployed contract matches a public
source revision, which is essential for auditability and trust.

## Known-variance inputs

The following inputs must be identical between two builds for the output to
match:

| Input | Expected value |
|---|---|
| Rust toolchain | `stable` (pinned via `rust-toolchain.toml` or CI matrix) |
| `soroban-sdk` version | as declared in `Cargo.lock` |
| Build profile | `--release` targeting `wasm32-unknown-unknown` |
| Environment variables | No `SOURCE_DATE_EPOCH` overrides; Soroban SDK embeds no timestamps |
| `Cargo.lock` | Must be committed and identical |

## Running the check locally

```bash
python3 scripts/check_reproducible.py
```

The script:

1. Builds the escrow contract once with `cargo build --target wasm32-unknown-unknown --release`.
2. Copies the WASM to a temporary directory.
3. Builds again (reusing the already-compiled dependencies but recompiling the contract crate).
4. Computes the SHA-256 hash of both outputs and compares them.
5. Exits `0` on a match, `1` on a mismatch.

```bash
=== Build 1 ===
Build 1 SHA-256: <hash>

=== Build 2 ===
Build 2 SHA-256: <hash>

SUCCESS: Both builds produced identical WASM. Build is reproducible.
```

## CI integration

The `ci.yml` workflow includes a `reproducible-build` job that:

1. Installs the Rust toolchain with the `wasm32-unknown-unknown` target.
2. Runs `python3 scripts/check_reproducible.py`.
3. Fails the workflow if the hashes differ.

This job runs on every push and pull request targeting `main`.

## What to do if the check fails

A mismatch almost always means either:

- The `Cargo.lock` was not committed or has drifted.
- A dependency injects a timestamp, random seed, or path into the binary.
- Different Rust toolchain versions are being compared.

Check the diff between `Cargo.lock` on the two builds first.  If the issue
persists, open an issue with the SHA-256 outputs of both builds and the full
CI log.
