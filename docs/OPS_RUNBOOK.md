# Operations Runbook

Day-to-day operational procedures for StellarWork in production: monitoring, backups, incident response, and maintenance tasks.

> For initial deployment steps see [DEPLOYMENT.md](./DEPLOYMENT.md).
> For incident severity and escalation paths see [production-escalation.md](./production-escalation.md).

---

## Table of Contents

1. [Monitoring](#1-monitoring)
2. [Backup Procedures](#2-backup-procedures)
3. [Incident Response](#3-incident-response)
4. [Emergency Contract Upgrade](#4-emergency-contract-upgrade)
5. [Fund Recovery Procedures](#5-fund-recovery-procedures)
6. [Regular Maintenance Tasks](#6-regular-maintenance-tasks)

---

## 1. Monitoring

The StellarWork platform has three observable layers: the Soroban RPC, on-chain contract state, and the Next.js frontend.

### 1.1 What to Monitor

#### Soroban RPC Health

| Signal | Healthy | Degraded | Critical |
|--------|---------|----------|----------|
| RPC response time | < 2 s | 2–10 s | > 10 s or no response |
| `getTransaction` success rate | > 99% | 90–99% | < 90% |
| `simulateTransaction` errors | None | Occasional | Repeated `FAILED` |
| Ledger close time | ~5 s | 10–30 s | > 30 s or stalled |

Quick RPC health check:

```bash
curl -s https://soroban-rpc.stellar.org \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getNetwork","params":{}}' \
  | jq '.result.passphrase'
# Should print: "Public Global Stellar Network ; September 2015"
```

Check the latest ledger sequence:

```bash
curl -s https://soroban-rpc.stellar.org \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger","params":{}}' \
  | jq '.result'
```

#### Contract State

| Signal | Check | Command |
|--------|-------|---------|
| Job counter | Incrementing as expected | `get_job_count` |
| Fee accrual | Growing with completed jobs | `get_fees <token>` |
| Admin address | Has not changed unexpectedly | `get_admin` |
| Contract version | Matches last deployed version | `get_contract_version` |

Routine state check script:

```bash
#!/bin/bash
# ops-check.sh — run daily
CONTRACT_ID="<YOUR_CONTRACT_ID>"
NETWORK="mainnet"
NATIVE_TOKEN="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

echo "=== StellarWork Contract Health ==="
echo "Job count:"
soroban contract invoke --id $CONTRACT_ID --network $NETWORK -- get_job_count

echo "Accrued fees (stroops):"
soroban contract invoke --id $CONTRACT_ID --network $NETWORK \
  -- get_fees --token $NATIVE_TOKEN

echo "Admin address:"
soroban contract invoke --id $CONTRACT_ID --network $NETWORK -- get_admin

echo "Contract version:"
soroban contract invoke --id $CONTRACT_ID --network $NETWORK -- get_contract_version
```

#### Frontend Health

| Signal | Check | Tool |
|--------|-------|------|
| Page load success | HTTP 200 on `/` | `curl -s -o /dev/null -w "%{http_code}" https://stellarwork.app` |
| Deployment status | Latest deployment shows **Ready** | Vercel Dashboard |
| JS bundle errors | No console errors on page load | Browser DevTools |
| Wallet connect flow | Freighter popup appears | Manual smoke test |

Minimal uptime check:

```bash
# Returns 200 for OK, anything else warrants investigation
curl -s -o /dev/null -w "%{http_code}\n" https://stellarwork.app
```

#### Stellar Network Status

- Stellar network status page: [https://status.stellar.org](https://status.stellar.org)
- Subscribe to status alerts for incidents affecting the public network or Soroban.
- Planned network upgrades (Protocol Votes) are announced on the [Stellar Blog](https://stellar.org/blog).

### 1.2 Alerting Setup

Recommended minimum alerting stack:

| What | Tool | Trigger |
|------|------|---------|
| Frontend uptime | [Uptime Robot](https://uptimerobot.com) (free) or [Better Uptime](https://betteruptime.com) | HTTP non-200 for 2+ minutes |
| Vercel deployment failure | Vercel email notifications | Deployment status = **Error** |
| Stellar network incident | status.stellar.org RSS → Slack/email | Any new incident |
| RPC errors in browser | Sentry (or similar) in Next.js | Uncaught exceptions / API errors |

To add Sentry to the Next.js frontend:

```bash
cd frontend
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

### 1.3 Transaction Success Rate

Freighter transaction submissions are visible in the Stellar Explorer. For bulk monitoring:

```bash
# Get recent contract events (requires Horizon or RPC event subscription)
soroban contract events \
  --id $CONTRACT_ID \
  --network mainnet \
  --start-ledger <LEDGER_NUMBER>
```

Events to watch for unexpected spikes:
- `job_disputed` — elevated dispute rate may indicate UX confusion or bad actors
- `deadline_enforced` — elevated rate may indicate unrealistic deadlines
- `upgrade_proposed` — should only appear when you initiate an upgrade

---

## 2. Backup Procedures

The escrow contract stores all financial state on-chain. Funds are never at risk from a server failure. However, certain operational data must be backed up to maintain admin control.

### 2.1 Critical Backups

| Item | Where it lives | Backup method | Frequency |
|------|---------------|---------------|-----------|
| **Admin secret key** | Hardware wallet or secrets manager | Offline, encrypted, geographically distributed | Once at creation; verify quarterly |
| **Contract ID** | Vercel env vars, deployment log | At least 3 independent locations | At deployment; verify monthly |
| **WASM artifact + hash** | Build output | S3/GCS versioned bucket or Git tag | Every contract release |
| **Admin address (public key)** | Vercel env vars, deployment log | At least 3 locations | At deployment |
| **Token allowlist** | On-chain (queryable) | Document in deployment log | When changed |
| **Fee tier configuration** | On-chain (queryable) | Document in deployment log | When changed |

### 2.2 Admin Key Backup Protocol

The admin key controls:
- Fee withdrawal (`withdraw_fees`)
- Dispute resolution (`resolve_dispute`)
- Contract upgrades (`propose_upgrade`, `execute_upgrade`)
- Token management (`add_allowed_token`, `remove_allowed_token`)
- Admin transfer (`transfer_admin`)

**Backup procedure:**

1. Generate the admin keypair offline (air-gapped machine if possible).
2. Write the secret key on paper (or metal) — do not save it in digital-only form.
3. Store copies in at least two physically separate, secure locations (e.g. office safe + home safe).
4. Verify the backup by importing the secret key into a test CLI profile and confirming the public key matches.
5. Record the date of backup and the verifying team member in the deployment log.

```bash
# Verify backup: import and check public key
soroban config identity add backup-verify --secret-key <SECRET_FROM_BACKUP>
soroban config identity address backup-verify
# Must match: $ADMIN_ADDRESS
soroban config identity rm backup-verify   # clean up
```

### 2.3 Contract State Snapshot

To snapshot all job state for offline analysis or disaster recovery:

```bash
#!/bin/bash
# snapshot-jobs.sh
CONTRACT_ID="<YOUR_CONTRACT_ID>"
NETWORK="mainnet"
OUTFILE="snapshot-$(date +%Y%m%d-%H%M%S).jsonl"

COUNT=$(soroban contract invoke --id $CONTRACT_ID --network $NETWORK -- get_job_count)
echo "Snapshotting $COUNT jobs..."

for i in $(seq 1 $COUNT); do
  soroban contract invoke \
    --id $CONTRACT_ID \
    --network $NETWORK \
    -- get_job --job_id $i >> $OUTFILE
done

echo "Snapshot written to $OUTFILE"
```

Run this before any planned maintenance or upgrade. Store snapshots in a versioned object storage bucket.

### 2.4 Configuration Backup

Record the current contract configuration in a text file and commit it to a private ops repository:

```bash
#!/bin/bash
# backup-config.sh
echo "Contract ID: $CONTRACT_ID"
echo "Admin: $(soroban contract invoke --id $CONTRACT_ID --network mainnet -- get_admin)"
echo "Fee BPS: $(soroban contract invoke --id $CONTRACT_ID --network mainnet -- get_fee_bps)"
echo "Version: $(soroban contract invoke --id $CONTRACT_ID --network mainnet -- get_contract_version)"
echo "Job count: $(soroban contract invoke --id $CONTRACT_ID --network mainnet -- get_job_count)"
echo "Snapshot date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

---

## 3. Incident Response

Follow the severity matrix in [production-escalation.md](./production-escalation.md) to determine priority. Use the procedures below for common scenarios. Every incident should be recorded using the [incident-runbook-template.md](./incident-runbook-template.md); completed runbooks go in `docs/incidents/` and drive the postmortem checklist.

### 3.1 Frontend Outage (HTTP errors / blank page)

**Symptoms:** Users report the site is down; uptime monitor fires; HTTP non-200.

**Steps:**

1. Check Vercel Dashboard → Deployments. Is the latest deployment **Ready**?
2. If the latest deployment has errors, roll back immediately:
   ```
   Vercel Dashboard → Deployments → [previous deployment] → Promote to Production
   ```
3. If all deployments show errors, check Vercel status: [https://www.vercel-status.com](https://www.vercel-status.com)
4. If Vercel is healthy, check the build log for the failing deployment. Common causes:
   - Missing `NEXT_PUBLIC_CONTRACT_ID` env var → add it and redeploy
   - TypeScript compile error from a recent merge → revert the PR and redeploy
5. Verify recovery:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://stellarwork.app
   # Should return 200
   ```

### 3.2 Elevated RPC Errors (Transactions Failing in UI)

**Symptoms:** Users report "Transaction failed" errors; `simulateTransaction` returns errors.

**Steps:**

1. Check Stellar network status: [https://status.stellar.org](https://status.stellar.org)
2. If a network-wide incident is active, no action needed — wait for resolution.
3. If the network is healthy, test the RPC endpoint directly:
   ```bash
   curl -s https://soroban-rpc.stellar.org \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger","params":{}}' \
     | jq '.result.sequence'
   ```
4. If the public RPC is degraded, update `NEXT_PUBLIC_SOROBAN_RPC` in Vercel to point to a backup provider and redeploy.
5. Monitor: watch for error resolution in Sentry or browser reports.

### 3.3 Suspected Unauthorised Admin Action

**Symptoms:** Admin address changed unexpectedly; fees withdrawn without authorisation; dispute resolved with wrong split.

**Steps:**

1. Immediately verify current admin address:
   ```bash
   soroban contract invoke --id $CONTRACT_ID --network mainnet -- get_admin
   ```
2. Compare with the expected admin address in your deployment log.
3. If the admin has changed, the admin key is compromised.
4. **If you still control the admin key:** transfer admin to a fresh keypair immediately:
   ```bash
   NEW_ADMIN=$(soroban config identity generate emergency-admin && \
               soroban config identity address emergency-admin)
   soroban contract invoke \
     --id $CONTRACT_ID \
     --source stellarwork-prod \
     --network mainnet \
     -- transfer_admin \
     --caller $ADMIN_ADDRESS \
     --new_admin $NEW_ADMIN
   ```
5. Update `NEXT_PUBLIC_ADMIN_ADDRESS` in Vercel env vars and redeploy.
6. Revoke/rotate all secrets in your secrets manager.
7. File a private security report per [SECURITY.md](../SECURITY.md).

### 3.4 Disputed Job with Missing Freelancer Address

**Symptoms:** `resolve_dispute` panics with `InvalidStatus (#3)` — freelancer is null.

**Steps:**

1. Retrieve the job state:
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --network mainnet \
     -- get_job --job_id <JOB_ID>
   ```
2. If `freelancer` is null, the job was never accepted — it cannot be in `Disputed` status under normal contract logic. This indicates data corruption or an unexpected state.
3. Escalate to SEV-1 per [production-escalation.md](./production-escalation.md).
4. Take a full job state snapshot (see Section 2.3).
5. Do not attempt further contract operations until the root cause is understood.

---

## 4. Emergency Contract Upgrade

The escrow contract supports a 24-hour timelock upgrade mechanism. Use this when a critical bug must be patched in production.

> **Warning:** Contract upgrades replace the WASM bytecode while preserving storage. All existing job state remains intact. Test the new WASM thoroughly before proposing an upgrade on mainnet.

### 4.1 Upgrade Process

**Step 1 — Build and test the fixed WASM:**

```bash
cd contracts/escrow
cargo test
soroban contract build
sha256sum target/wasm32-unknown-unknown/release/escrow.wasm
# Save the hash
```

**Step 2 — Upload the WASM to the network:**

```bash
soroban contract upload \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source stellarwork-prod \
  --network mainnet
# Returns a 32-byte WASM hash (hex)
```

**Step 3 — Propose the upgrade (starts 24-hour timelock):**

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source stellarwork-prod \
  --network mainnet \
  -- propose_upgrade \
  --admin $ADMIN_ADDRESS \
  --new_wasm_hash <WASM_HASH_FROM_STEP_2>
```

The contract stores the pending upgrade WASM hash and a deadline (current timestamp + 86,400 seconds). The `upgrade_proposed` event is emitted.

**Step 4 — Wait 24 hours.**

This window allows users to review the proposed upgrade on-chain via the `PendingUpgradeWasmHash` storage key or event log.

**Step 5 — Execute the upgrade (after timelock expires):**

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source stellarwork-prod \
  --network mainnet \
  -- execute_upgrade \
  --admin $ADMIN_ADDRESS
```

The `contract_upgraded` event is emitted. Verify the upgrade:

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- get_contract_version
# Should return the new version number
```

### 4.2 Cancelling a Proposed Upgrade

If you need to cancel a pending upgrade (e.g., the proposed WASM was found to be incorrect):

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source stellarwork-prod \
  --network mainnet \
  -- cancel_upgrade \
  --admin $ADMIN_ADDRESS
```

The `upgrade_cancelled` event is emitted. No new upgrade can be proposed until the cancellation is confirmed.

### 4.3 Emergency: Bypassing the Timelock

The current contract enforces the 24-hour timelock strictly — `execute_upgrade` will panic with `UpgradeTimelockPending (#19)` if called before the deadline. There is no admin bypass.

If a critical vulnerability requires immediate mitigation before the timelock expires:

1. **Remove the frontend** by deleting `NEXT_PUBLIC_CONTRACT_ID` from Vercel env vars and redeploying. This prevents users from interacting with the contract through the UI.
2. **Post a public notice** explaining the maintenance window using [maintenance-window-announcement-template.md](./maintenance-window-announcement-template.md).
3. Wait for the timelock and execute the upgrade.
4. Restore the frontend env vars and redeploy once the upgrade is confirmed.

---

## 5. Fund Recovery Procedures

Funds held in escrow are secure as long as the contract logic is correct and the admin key is not compromised. Use these procedures for edge cases.

### 5.1 Job Stuck in Disputed State

If a dispute was raised and the admin cannot resolve it (e.g., admin key lost):

1. Transfer the admin role to a recovery address (if you still hold the original admin key):
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --source stellarwork-prod \
     --network mainnet \
     -- transfer_admin \
     --caller $ADMIN_ADDRESS \
     --new_admin <RECOVERY_ADDRESS>
   ```
2. Use the recovery admin to call `resolve_dispute` with an appropriate split.

If the admin key is permanently lost and funds are stuck, this is a critical security incident. File a report per [SECURITY.md](../SECURITY.md) and engage Stellar development support.

### 5.2 Job TTL Expiry Risk

Soroban storage entries have a time-to-live (TTL). Active jobs have their TTL bumped automatically on every write operation. For jobs that have been open for an unusually long time without activity, call `extend_job_ttl` to prevent archival:

```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source stellarwork-prod \
  --network mainnet \
  -- extend_job_ttl \
  --caller $ADMIN_ADDRESS \
  --job_id <JOB_ID>
```

Check for at-risk jobs (those in non-terminal states for > 60 days) as part of monthly maintenance.

### 5.3 Freelancer Unreachable (InProgress Job)

If a freelancer stops responding and the job has a deadline:

1. Wait for the deadline to pass.
2. The client can call `enforce_deadline` to cancel the job and receive a full refund:
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --source <CLIENT_SECRET_OR_IDENTITY> \
     --network mainnet \
     -- enforce_deadline \
     --client <CLIENT_ADDRESS> \
     --job_id <JOB_ID>
   ```
3. If no deadline was set and the freelancer is unreachable, the client can raise a dispute via the admin resolution path.

---

## 6. Regular Maintenance Tasks

### 6.1 Weekly

- [ ] Check Vercel deployment status — confirm production deployment is **Ready**.
- [ ] Review Sentry (or equivalent) for new uncaught errors in the frontend.
- [ ] Check Stellar network status for upcoming planned maintenance.
- [ ] Review open GitHub issues labelled `bug` or `priority: high`.

### 6.2 Monthly

| Task | Command / Action |
|------|-----------------|
| Check accrued fees | `soroban contract invoke --id $CONTRACT_ID --network mainnet -- get_fees --token <TOKEN>` |
| Withdraw fees if above threshold | Admin panel → Withdraw Fees (or via CLI `withdraw_fees`) |
| Verify admin address on-chain | `soroban contract invoke -- get_admin` → compare with records |
| Check for long-running open jobs | Review job snapshots for jobs open > 60 days; consider `extend_job_ttl` |
| Dependency audit | `cd frontend && npm audit` — resolve critical/high severity issues |
| Soroban CLI update | `cargo install --locked soroban-cli` |
| Review active disputes | Admin panel → Disputes — resolve any stuck in **Active** or **UnderReview** |

### 6.3 Quarterly

| Task | Action |
|------|--------|
| Admin key rotation | Transfer admin to a freshly generated keypair. Update `NEXT_PUBLIC_ADMIN_ADDRESS` in Vercel. |
| Backup verification | Import admin key from backup and verify public key matches current admin. |
| Dependency update | `cd frontend && npm update` — review changelog for breaking changes before committing. |
| Security audit | Review contract for known Soroban vulnerability patterns. Check [Stellar security advisories](https://github.com/stellar/stellar-protocol/issues?q=label%3Asecurity). |
| Docs review | Verify [DEPLOYMENT.md](./DEPLOYMENT.md), [environments.md](./environments.md), and this runbook are accurate. |
| Contract TTL check | Ensure instance storage TTL is not at risk of expiry. Call any admin function to bump it if needed. |

### 6.4 Fee Withdrawal Procedure

Fees accrue in the contract as jobs are completed. Withdraw them periodically:

1. Check accrued fees:
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --network mainnet \
     -- get_fees \
     --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
   ```

2. If fees > 0, withdraw via the Admin panel or CLI:
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --source stellarwork-prod \
     --network mainnet \
     -- withdraw_fees \
     --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
   ```

3. Confirm admin wallet received the expected amount via Stellar Explorer.
4. Record the withdrawal in the ops log (amount, date, transaction hash).

### 6.5 Dependency Updates

```bash
cd frontend

# Check for outdated packages
npm outdated

# Run security audit
npm audit

# Update dependencies (review changelog before merging)
npm update

# For major version bumps, update manually and test
npm install @stellar/stellar-sdk@latest
npm install @stellar/freighter-api@latest

# Run tests after updating
npm run typecheck
npm run lint
npm run build
```

For Rust dependencies:

```bash
cd contracts/escrow
cargo update
cargo test
```

---

*Related: [DEPLOYMENT.md](./DEPLOYMENT.md) · [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) · [production-escalation.md](./production-escalation.md) · [release-checklist.md](./release-checklist.md)*
