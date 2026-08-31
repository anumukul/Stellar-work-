# Smart Contract Upgrade and Migration Runbook

DOC-41 ([#759](https://github.com/anumukul/Stellar-work-/issues/759)).

The escrow contract holds user funds. An upgrade that corrupts storage or
bricks a function does not merely break the product — it can strand escrowed
payments belonging to people who were not party to the decision. This runbook
exists so the process is the same every time and does not depend on who is
performing it.

Related: [CONTRACT.md](CONTRACT.md) for the contract surface,
[OPS_RUNBOOK.md](OPS_RUNBOOK.md) for incident handling,
[production-escalation.md](production-escalation.md) for who to wake.

---

## 0. Before anything

The upgrade mechanism is two-step with a 24-hour timelock
(`UPGRADE_TIMELOCK_SECS = 86_400`):

1. `propose_upgrade(admin, new_wasm_hash)` — records the hash and starts the clock
2. Wait 24 hours
3. `execute_upgrade(admin)` — swaps the WASM
4. `cancel_upgrade(admin)` — abandons a proposal, any time before execution

**The timelock is a feature, not an obstacle.** It is the window in which a bad
proposal can be caught and cancelled. Do not treat it as latency to be
engineered around.

### Roles

| Role | Responsibility |
| --- | --- |
| **Upgrade lead** | Runs the steps, owns the go/no-go call |
| **Reviewer** | Independently verifies the WASM hash and the migration plan; must not be the lead |
| **Ops contact** | Reachable for the entire cutover window |

A single person must not both author and approve an upgrade.

---

## 1. Preconditions

Do not proceed unless **all** of these hold.

- [ ] The change is merged to `main` and CI is green on that commit
- [ ] `cargo test --lib` passes for `contracts/escrow`
- [ ] The new WASM builds reproducibly — two builds from the same commit produce the same hash
- [ ] The WASM hash has been verified independently by the reviewer, from the source commit, not from a message
- [ ] A storage-compatibility review has been done (§2) and its conclusion is written down
- [ ] The change has been staged on testnet (§4) and observed for at least 24 hours
- [ ] Rollback criteria (§7) are agreed **in writing before** the proposal, not decided under pressure
- [ ] The admin key is available and its holder is present for the whole window

### Sanity snapshot

Capture the pre-upgrade state so post-upgrade verification has something to
compare against. Record at minimum:

```
get_job_count()                    # total jobs
get_admin()                        # admin address
get_fee_bps()                      # platform fee
get_contract_version()             # version constant
get_latest_event_seq()             # event log head, if present
```

Plus, for a sample of at least 10 jobs spanning every status:

```
get_job(id)                        # full struct, all fields
```

Store this with the change record. Without it, "did the upgrade preserve
state?" is unanswerable.

### Pause, where applicable

If the deployment has a pause facility, engage it before executing and lift it
only after verification (§5) passes. An upgrade executed while jobs are being
posted means the pre- and post- snapshots cannot be compared.

---

## 2. Storage compatibility

**This is the step that loses funds when skipped.**

Soroban stores contract data as XDR keyed by the `DataKey` enum. The new WASM
reads entries written by the old one. Two changes are dangerous:

### Changing a stored struct

Adding, removing or reordering a field in `Job`, `Milestone`, `AuditEntry` or
any other `#[contracttype]` struct changes its XDR layout. Existing entries
written by the old WASM will **fail to deserialize**, and every job stored
before the upgrade becomes unreadable.

| Change | Safe? | Notes |
| --- | --- | --- |
| Add a field to a struct | ❌ | Old entries lack it and fail to decode |
| Remove a field | ❌ | Same |
| Reorder fields | ❌ | Same |
| Rename a field | ❌ | Same |
| Add a new `DataKey` variant | ✅ | Only if appended; existing discriminants must not move |
| Reorder `DataKey` variants | ❌ | Changes the discriminants of existing keys |
| Add a new function | ✅ | |
| Change a function signature | ⚠️ | Safe on-chain, breaks every caller — coordinate with the frontend |
| Add an `Error` variant | ✅ | Only if appended with a new number |
| Reuse a retired error number | ❌ | Clients map numbers to messages ([contract-error-messages.md](contract-error-messages.md)) |

If a struct must change, the upgrade requires a **migration** (§3). There is no
way to skip this.

### Enum ceilings

Soroban caps a `#[contracttype]` union at **50 cases**. `DataKey` is close to
that ceiling; check the current count before adding variants:

```
awk '/^pub enum DataKey \{/,/^\}/' contracts/escrow/src/lib.rs | grep -cE "^    [A-Z]"
```

Exceeding it fails to compile with `LengthExceedsMax` — at build time, not at
runtime, so it cannot reach production. Exported function names are capped at
**32 characters** and fail the same way.

---

## 3. Migration path

Needed whenever a stored struct changes shape, or a new field must be populated
for existing entries.

### Pattern: versioned read with backfill

1. **Ship the new WASM able to read both layouts.** Keep the old struct as
   `JobV1`, add `JobV2`, and have the read path try the new layout and fall
   back to the old.
2. **Write only the new layout.** Every write after the upgrade produces `V2`.
3. **Backfill in bounded batches.** A migration helper reads a range of ids,
   converts and rewrites them. Bounded because a single transaction has a
   finite budget — attempting the whole set at once fails and rolls back.
4. **Track progress on-chain.** Store the highest migrated id, so a batch that
   fails can resume rather than restart.
5. **Remove the fallback in a later release**, once the backfill is confirmed
   complete. Not in the same release — the fallback is the safety net.

### Backfill checklist

- [ ] Batch size chosen and tested against the resource budget, with headroom
- [ ] The helper is idempotent — re-running a completed batch is a no-op
- [ ] Progress is persisted, so an interrupted run resumes
- [ ] Migrated entries are spot-checked against the §1 snapshot
- [ ] The count of migrated entries matches `get_job_count()`
- [ ] Archived jobs (`ArchivedJob`) are covered, not just active ones

Archived jobs are the ones most often forgotten: they are stored under a
different key and are invisible to a loop over active ids.

---

## 4. Testnet staging

Never rehearse on mainnet.

- [ ] Deploy the current mainnet WASM to a fresh testnet contract
- [ ] Seed it with jobs in **every** status — Open, InProgress, SubmittedForReview, Completed, Cancelled, Disputed
- [ ] Include at least one archived job and one job with milestones
- [ ] Take the §1 snapshot
- [ ] Run the full upgrade: propose → wait → execute
- [ ] Run the migration backfill to completion
- [ ] Run the §5 verification in full
- [ ] Exercise the frontend against the upgraded contract
- [ ] Leave it running for **24 hours** and re-verify

The timelock can be shortened on a testnet deployment for iteration, but the
final rehearsal must use the real 24-hour path — the wait is part of what is
being tested, including whether anyone notices a cancel-worthy problem in time.

---

## 5. Verification

Run after `execute_upgrade` and after each backfill batch. **Every check must
pass before the pause is lifted.**

### Identity and configuration

- [ ] `get_contract_version()` returns the expected new version
- [ ] `get_admin()` is unchanged
- [ ] `get_fee_bps()` is unchanged
- [ ] The token allowlist is unchanged
- [ ] `get_job_count()` matches the snapshot exactly

A changed job count after an upgrade means data loss. Stop and roll back.

### Data integrity

- [ ] Every sampled job from §1 reads back with identical field values
- [ ] Jobs in each status are readable
- [ ] At least one archived job is readable
- [ ] Escrowed balances match the sum of active job amounts

### Behaviour

- [ ] `post_job` succeeds end to end
- [ ] `accept_job` → `submit_work` → `approve_work` completes and pays out
- [ ] A dispute can be raised and resolved
- [ ] Events are emitted with the expected topics
- [ ] The frontend loads the job list and a job detail page

### Funds

- [ ] Contract token balance ≥ the sum of all escrowed amounts
- [ ] Accrued fees are unchanged
- [ ] A withdrawal of accrued fees succeeds

The funds check is the one that must never be skipped for time.

---

## 6. Mainnet cutover

- [ ] All of §1 confirmed, including the independent hash verification
- [ ] Maintenance window announced ([template](maintenance-window-announcement-template.md))
- [ ] Ops contact confirmed available for the whole window
- [ ] Pause engaged, if available
- [ ] `propose_upgrade(admin, new_wasm_hash)` submitted
- [ ] **Proposal hash re-verified on-chain** against the reviewed hash
- [ ] 24-hour timelock elapsed with no cancel-worthy findings
- [ ] `execute_upgrade(admin)` submitted
- [ ] §5 verification passed in full
- [ ] Migration backfill run to completion, with §5 re-run after
- [ ] Pause lifted
- [ ] Monitored for 1 hour with no elevated error rate
- [ ] Change record updated with hashes, timestamps and the snapshot

Verify the proposed hash **on-chain after proposing**, not just before. A
mistyped hash is caught here, inside the timelock, where cancelling is free.

---

## 7. Rollback

### Criteria — decide these before proposing

Roll back immediately if **any** of the following is true after execution:

- `get_job_count()` differs from the snapshot
- Any sampled job fails to read, or reads with different values
- Contract token balance is less than the sum of escrowed amounts
- Any lifecycle transition fails that previously succeeded
- Error rate is elevated for more than 15 minutes with no identified cause

Do **not** roll back for cosmetic frontend issues; fix forward instead.

### Before the timelock expires

`cancel_upgrade(admin)`. Nothing has changed on-chain. This is why the timelock
exists and why proposals should be made early.

### After execution

There is no automatic downgrade. Rolling back means proposing the **previous
WASM hash** as a new upgrade — which means waiting another 24 hours unless a
pause is in place.

This asymmetry is the single most important thing to understand before
executing:

> Cancelling before execution is free and instant.
> Reverting after execution costs another full timelock.

Plan accordingly: keep the pause engaged until verification passes, and keep
the previous WASM hash to hand.

### Fund recovery

If an upgrade leaves funds inaccessible:

1. **Pause immediately** to stop further writes making it worse
2. Do not attempt further upgrades until the failure mode is understood — a
   second bad upgrade on top of a first is far harder to unwind
3. Escalate per [production-escalation.md](production-escalation.md)
4. Determine whether the funds are unreachable or merely unreadable; a
   deserialization failure often leaves the ledger entries intact and
   recoverable by a reader that understands the old layout
5. If a recovery upgrade is required, treat it as a new upgrade and run this
   entire runbook — the pressure to skip steps is exactly why the steps exist

---

## 8. After the upgrade

- [ ] Change record updated: commit, WASM hash, proposal and execution tx hashes, timestamps
- [ ] [CONTRACT.md](CONTRACT.md) updated if the surface changed
- [ ] [contract-error-messages.md](contract-error-messages.md) updated if error variants changed
- [ ] Frontend contract bindings regenerated and deployed if signatures changed
- [ ] The snapshot from §1 archived with the change record
- [ ] Retrospective if anything deviated from this runbook — and this runbook
      updated to match what was actually needed

A step that gets skipped every time is either unnecessary or badly written.
Fix the runbook rather than quietly working around it.
