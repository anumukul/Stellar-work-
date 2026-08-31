# Admin Key Rotation and Backup

SEC-06 ([#770](https://github.com/anumukul/Stellar-work-/issues/770)).

Rotation is the one privileged operation with no undo. If admin control lands
on an address whose key nobody holds, the contract becomes permanently
un-administrable: no fee changes, no dispute resolution, no upgrades, and no
way to fix it. The escrow keeps working, but nobody can ever intervene in it
again.

This document is the procedure for avoiding that.

Related: [contract-upgrade-runbook.md](contract-upgrade-runbook.md),
[CONTRACT.md](CONTRACT.md), [SECURITY.md](../SECURITY.md).

---

## Use the two-step flow. Always.

The contract exposes two ways to change the admin.

| Function | Steps | Recipient confirms? | Use it? |
| --- | --- | --- | --- |
| `transfer_ownership` + `accept_ownership` | 2 | **Yes** | ✅ Always |
| `transfer_admin` | 1 | No | ❌ Never in production |

`transfer_admin` hands control over immediately. A typo in the address, or an
address whose key is not actually held, loses the contract. There is no
recovery: the new admin is the only party who can nominate another, and they do
not exist.

The two-step flow makes that mistake free. Nominating a wrong address costs
nothing, because control does not move until the nominee proves they hold the
key by calling `accept_ownership` themselves. Until then the current admin keeps
full powers and can cancel or redirect.

> `transfer_admin` remains in the ABI for compatibility. It now also clears any
> pending nomination — previously a nomination survived it, so a stale nominee
> could call `accept_ownership` afterwards and take the contract from whoever
> the one-step transfer had just installed (#770).

---

## Before rotating

- [ ] The new key is generated and **its holder has proved they can sign** —
      have them sign anything on testnet first
- [ ] The new key is backed up (§Backup) *before* it is nominated
- [ ] Two people know the rotation is happening; one runs it, one verifies
- [ ] The reason is recorded (scheduled rotation, suspected compromise,
      personnel change)
- [ ] Current state captured: `get_admin()`, `get_pending_admin()`,
      `get_fee_bps()`, `get_job_count()`

If this is a **suspected compromise**, rotate first and investigate second.
A compromised admin can nominate an attacker-controlled address; every hour
the old key stays live is an hour that is possible.

---

## The procedure

### 1. Nominate

```bash
stellar contract invoke --id "$CONTRACT_ID" --source-account "$CURRENT_ADMIN" \
  -- transfer_ownership --admin "$CURRENT_ADMIN_ADDR" --new_admin "$NEW_ADMIN_ADDR"
```

### 2. Verify the nomination — before anyone accepts

```bash
stellar contract invoke --id "$CONTRACT_ID" --source-account "$CURRENT_ADMIN" \
  -- get_pending_admin
```

**Compare the output character by character against the intended address.**
This is the last moment a mistake is free. If it is wrong, cancel (§Rollback)
and start again.

### 3. Accept, signed by the new key

```bash
stellar contract invoke --id "$CONTRACT_ID" --source-account "$NEW_ADMIN" \
  -- accept_ownership --new_admin "$NEW_ADMIN_ADDR"
```

This must be signed by the new key. That is the point: it proves the key exists
and is usable before it is given control.

### 4. Verify the rotation

```bash
stellar contract invoke --id "$CONTRACT_ID" -- get_admin          # → new address
stellar contract invoke --id "$CONTRACT_ID" -- get_pending_admin  # → None
```

- [ ] `get_admin` returns the new address
- [ ] `get_pending_admin` returns `None`
- [ ] The new admin can perform an admin action (e.g. `update_fee_bps` to its
      current value — a no-op that still proves authority)
- [ ] The old admin can **no longer** perform one
- [ ] `get_job_count` and escrow balances are unchanged

The old key is revoked by this step. There is no separate revocation: the
contract stores exactly one admin, and acceptance overwrote it.

### 5. After

- [ ] Old key removed from any signing infrastructure, CI secret, or password
      manager entry that granted access
- [ ] Old key **backup retained** for the incident record — retained, not
      destroyed, until the rotation is confirmed stable
- [ ] Rotation recorded: date, reason, old and new addresses, tx hashes
- [ ] If this was a compromise, the incident is escalated per
      [production-escalation.md](production-escalation.md)

---

## Rollback

**Before acceptance** — the nomination is not yet a transfer:

```bash
stellar contract invoke --id "$CONTRACT_ID" --source-account "$CURRENT_ADMIN" \
  -- cancel_ownership_transfer --admin "$CURRENT_ADMIN_ADDR"
```

Or simply nominate the correct address instead; the new nomination replaces
the old one and the superseded nominee can no longer accept.

**After acceptance** — the new admin is the only party who can rotate again.
If the new key is held and merely wrong, rotate again from it. If it is not
held, control is lost. Nothing in the contract can recover it, which is the
entire reason step 2 exists.

---

## Backup

An admin key with no backup is a rotation waiting to happen under pressure.

**What to back up**

- The secret key (S…) itself
- The public address, so a backup can be identified without decrypting it
- The date it was created and what it controls

**How**

- At least two copies, in two physical locations, on two media
- Encrypted at rest with a passphrase held separately from the key
- Never in a repository, CI secret store, chat, or unencrypted cloud storage —
  a CI secret grants access, it is not a backup
- For mainnet, a hardware wallet or an offline-generated key kept offline

**Test the backup.** A backup nobody has restored is a hypothesis. Once a
quarter, restore it in an isolated environment and confirm the address matches.
Do not sign a mainnet transaction to test it.

**Rotate on personnel change.** When someone with access to the key or its
backup leaves, rotate. The two-step flow makes this cheap enough to be routine.

---

## Automation

[`scripts/rotate-admin-key.sh`](../scripts/rotate-admin-key.sh) walks the
sequence with the verification steps built in. It stops between nomination and
acceptance and requires explicit confirmation of the pending address, because
that pause is the safety feature.

```bash
./scripts/rotate-admin-key.sh --network testnet \
  --contract "$CONTRACT_ID" --current alice --new bob
```

Rehearse on testnet before every mainnet rotation. The sequence is short enough
that rehearsing costs minutes, and unfamiliarity is the main risk.

---

## Coverage

[`contracts/escrow/src/lib.rs`](../contracts/escrow/src/lib.rs) — 22 tests
covering the full sequence, rollback before acceptance, redirection, who may do
what, repeated rotation, that escrow and in-flight jobs are untouched, that the
outgoing admin keeps its powers until acceptance, and the stale-nomination
regression above.
