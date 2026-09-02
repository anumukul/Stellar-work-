# Upgrade Testing Checklist

Contract upgrades are the highest-risk operation in the escrow protocol: a bad
upgrade can permanently lose user escrow. This checklist documents how to test
an upgrade end-to-end before it ships. It complements the automated tests in
`src/lib.rs` (search for the *"Upgrade paths & data-migration tests"* section).

> **Why this matters.** A Soroban upgrade replaces the contract's *code* while
> leaving its *storage* untouched. Every upgrade must therefore prove that the
> new code can read every piece of state the old code wrote — otherwise the
> first post-upgrade call silently reads garbage or panics.

## 1. Pre-upgrade preparation

- [ ] Pin the current on-chain version. Record the `CONTRACT_VERSION` constant
      and the deployed contract ID + WASM hash (see `contract-addresses.json`).
- [ ] Build the release WASM with the **same** `soroban-sdk` version the
      deployed contract uses. A dependency bump can change the storage encoding
      of `#[contracttype]` types and corrupt reads.
- [ ] Take a snapshot of representative on-chain state: job count, jobs in
      every `JobStatus`, `FeeBps`, `FeeTier` table, whitelisted tokens, oracles,
      dispute state, accrued fees (`TokenFees`), escrow balances, and the admin
      address.

## 2. Before the upgrade (unit test suite)

Run and confirm these pass:

```bash
cd contracts/escrow && cargo test
```

- [ ] Governance gating: only the admin can `propose_upgrade`,
      `execute_upgrade`, `cancel_upgrade` (`upgrade_propose_non_admin_fails`).
- [ ] Timelock enforced: `execute_upgrade` before `UPGRADE_TIMELOCK_SECS` must
      fail with `UpgradeTimelockPending` (`upgrade_execute_before_timelock_fails`).
- [ ] No proposal → execute fails with `NoPendingUpgrade`
      (`upgrade_execute_without_proposal_fails`, `upgrade_cancel_without_proposal_fails`).
- [ ] Pending state round-trips propose → cancel → re-propose
      (`upgrade_propose_and_cancel`, `upgrade_execute_after_timelock_clears_pending_state`).

## 3. v1 → v2 migration scenarios

- [ ] `upgrade_v1_to_v2_preserves_jobs_config_and_funds` — after swapping code
      to v2 at the same address, admin, config, job records, job count, and
      escrow balances are byte-for-byte intact.
- [ ] `an_inflight_job_completes_after_upgrade` — the upgraded code can advance
      a job that was in-flight before the upgrade, with correct fee math.
- [ ] Migration entrypoint is **idempotent**: calling `migrate` twice must not
      double-stamp or corrupt state (asserted in the preservation test).
- [ ] Schema version is stamped **in storage** and readable after migration
      (`get_schema_version` reads 1 before, 2 after).

## 4. Data-preservation verification

For every storage key the v1 contract writes, assert it reads back identically
on v2. The automated suite covers the high-value ones:

- [ ] `Admin`, `JobsCount`, `Job(u64)` records, `FeeBps`.
- [ ] `JobEscrowBalance(u64)` and the token balance actually held by the
      contract (escrow funds are not moved by the upgrade).
- [ ] `TokenFees(token)` (accrued platform fees) and dispute state
      (`rollback_to_v1_preserves_data_and_restores_behavior`).
- [ ] Oracle registry entries and other persistent auxiliary state.

## 5. Rollback procedures

Rollback is re-deploying the previous WASM at the same address (the storage
survives because it is keyed by contract address, not code).

- [ ] `rollback_to_v1_preserves_data_and_restores_behavior` — a v1 → v2 → v1
      round-trip preserves every job, fee, dispute and oracle record and the
      contract is fully operational afterwards.
- [ ] Rehearse the rollback transaction on **testnet** with a copy of
      production state before touching mainnet.
- [ ] Keep the previous WASM hash recorded so rollback is a single
      `propose_upgrade` + timelock + `execute_upgrade` cycle.

## 6. The real execution path

- [ ] `execute_upgrade_after_timelock_swaps_code_and_preserves_data` — the full
      `propose_upgrade` → timelock → `execute_upgrade` path runs, emits
      `contract_upgraded`, clears pending state, and leaves data intact.
- [ ] `execute_upgrade_with_unuploaded_wasm_hash_fails` — pointing the contract
      at a hash that was never uploaded is rejected by the host.
- [ ] On testnet, verify `update_current_contract_wasm` targets the intended
      WASM hash (compare against the built artifact's hash).

## 7. Migration performance benchmarks

Run the ignored benchmark:

```bash
cargo test --lib -- upgrade_benchmark --ignored --nocapture
```

- [ ] Record CPU instruction and memory byte costs for `propose_upgrade`,
      `cancel_upgrade`, the code swap, and the v1 → v2 `migrate` over a
      representative dataset. Recent numbers (native test harness):
      - code swap ≈ 423k instructions / 102k memory bytes
      - migrate ≈ 523k instructions / 123k memory bytes
      - propose_upgrade ≈ 226k instructions / 56k memory bytes
      - cancel_upgrade ≈ 392k instructions / 95k memory bytes
- [ ] Confirm the migration's cost fits comfortably inside the Soroban per-
      transaction budget for the largest expected dataset.

## 8. Post-upgrade verification (testnet / mainnet)

- [ ] Re-run every snapshot check from step 1 against post-upgrade state.
- [ ] Exercise one full job lifecycle end-to-end (post → accept → submit →
      approve) after the upgrade.
- [ ] Confirm fees, escrow balances and the admin key are unchanged.
- [ ] Confirm the schema version reported by the contract matches the new
      version, and the migration has been recorded.
