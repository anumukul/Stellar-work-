# Data Integrity QA Checklist for Contract State Transitions

This checklist validates data integrity across all contract state transitions to prevent balance corruption and status inconsistencies.

## Overview

State transition bugs can corrupt balances and statuses with no automated checks catching them in QA. This checklist provides a systematic approach to validate ledger state before and after each transition.

## State Transitions Covered

- **post_job** - Create new job and lock escrow
- **accept_job** - Freelancer accepts open job
- **submit_work** - Freelancer submits work for review
- **approve_work** - Client approves work and releases payment
- **reject_work** - Client rejects work, requests revision
- **cancel_job** - Client cancels open job
- **freelancer_cancel_job** - Freelancer cancels in-progress job
- **mutual_cancel** - Both parties agree to cancel with split
- **enforce_deadline** - Client enforces passed deadline
- **top_up_escrow** - Client adds funds to existing job
- **raise_dispute** - Either party raises dispute
- **resolve_dispute** - Admin resolves disputed job

---

## Pre-Transition Validation (All Transitions)

Before any state transition, verify:

- [ ] **Job exists** - `get_job(job_id)` returns valid job struct
- [ ] **Caller authorization** - Verify caller is authorized (client, freelancer, or admin)
- [ ] **Current status is valid** - Job is in expected status for this transition
- [ ] **Token balances sufficient** - Caller has enough token balance for required transfers
- [ ] **Token is whitelisted** - Verify token address is in allowed token whitelist
- [ ] **No deadline conflicts** - If deadline exists, verify it hasn't expired (unless transition allows it)
- [ ] **Contract not paused** - Verify contract is operational (if pause mechanism exists)

---

## Transition-Specific Checklists

### 1. post_job

**Purpose:** Create new job and transfer escrow amount from client to contract

**Pre-State:**
- [ ] Client token balance >= amount
- [ ] Token is whitelisted
- [ ] Description hash is not all zeros
- [ ] Description payload length > 0 and <= max
- [ ] Deadline is not in the past (or 0 for no deadline)
- [ ] Client active jobs count < max limit (if limit configured)

**Post-State Validation:**
- [ ] **Job created** - `get_job(job_id)` returns job with correct fields
- [ ] **Job ID increment** - `get_job_count()` increased by 1
- [ ] **Status is Open** - `job.status == JobStatus::Open`
- [ ] **Client balance decreased** - Client token balance decreased by `amount`
- [ ] **Contract escrow increased** - Contract token balance increased by `amount`
- [ ] **Freelancer is None** - `job.freelancer == None`
- [ ] **Revision count is 0** - `job.revision_count == 0`
- [ ] **Created timestamp set** - `job.created_at` matches ledger timestamp
- [ ] **Event emitted** - `job_created` event with correct data `(job_id, client, amount, token)`
- [ ] **Client active jobs count incremented** - If limit is configured

**Automated Assertions:**
```rust
assert_eq!(escrow.get_job_count(), pre_count + 1);
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::Open);
assert_eq!(job.amount, amount);
assert_eq!(job.client, client);
assert!(job.freelancer.is_none());
assert_eq!(job.revision_count, 0);
// Verify token balances
assert_eq!(token_client.balance(&client), pre_client_balance - amount);
assert_eq!(token_client.balance(&contract_id), pre_contract_balance + amount);
```

**Edge Cases:**
- [ ] Replayed call with same parameters - Should fail with duplicate job ID
- [ ] Amount = 0 - Should fail with InvalidAmount
- [ ] Amount negative - Should fail with InvalidAmount
- [ ] Description hash all zeros - Should fail with InvalidDescriptionHash
- [ ] Deadline in past - Should fail with InvalidDeadline
- [ ] Token not whitelisted - Should fail with TokenNotAllowed
- [ ] Exceed active job limit - Should fail with ActiveJobLimitExceeded

---

### 2. accept_job

**Purpose:** Freelancer accepts open job, transitions to InProgress

**Pre-State:**
- [ ] Job exists and status is Open
- [ ] Freelancer is not the client
- [ ] Deadline has not passed (if deadline exists)
- [ ] Job has no assigned freelancer

**Post-State Validation:**
- [ ] **Status is InProgress** - `job.status == JobStatus::InProgress`
- [ ] **Freelancer assigned** - `job.freelancer == freelancer`
- [ ] **Other fields unchanged** - amount, description_hash, deadline, token unchanged
- [ ] **Event emitted** - `job_accepted` event with `(job_id, freelancer)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::InProgress);
assert_eq!(job.freelancer, Some(freelancer));
assert_eq!(job.amount, pre_amount); // Unchanged
```

**Edge Cases:**
- [ ] Double accept by same freelancer - Should fail with JobAlreadyAccepted
- [ ] Accept by different freelancer - Should fail with JobAlreadyAccepted
- [ ] Accept after deadline - Should fail with DeadlinePassed
- [ ] Client accepts own job - Should fail with Unauthorized (or specific error)
- [ ] Accept non-existent job - Should fail with JobNotFound
- [ ] Accept already in-progress job - Should fail with InvalidStatus

---

### 3. submit_work

**Purpose:** Freelancer submits completed work, transitions to SubmittedForReview

**Pre-State:**
- [ ] Job exists and status is InProgress
- [ ] Caller is the assigned freelancer
- [ ] Deadline has not passed (if deadline exists)

**Post-State Validation:**
- [ ] **Status is SubmittedForReview** - `job.status == JobStatus::SubmittedForReview`
- [ ] **Freelancer unchanged** - Still assigned to same freelancer
- [ ] **Amount unchanged** - Escrow amount unchanged
- [ ] **Event emitted** - `job_submitted` event with `(job_id, freelancer)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::SubmittedForReview);
assert_eq!(job.freelancer, Some(freelancer));
assert_eq!(job.amount, pre_amount);
```

**Edge Cases:**
- [ ] Submit by wrong freelancer - Should fail with Unauthorized
- [ ] Submit by client - Should fail with Unauthorized
- [ ] Submit after deadline - Should fail with DeadlinePassed
- [ ] Submit open job - Should fail with InvalidStatus
- [ ] Submit already submitted job - Should fail with InvalidStatus
- [ ] Submit completed job - Should fail with InvalidStatus

---

### 4. approve_work

**Purpose:** Client approves work, deducts fee, pays freelancer, transitions to Completed

**Pre-State:**
- [ ] Job exists and status is SubmittedForReview
- [ ] Caller is the client
- [ ] Contract holds the escrow amount

**Post-State Validation:**
- [ ] **Status is Completed** - `job.status == JobStatus::Completed`
- [ ] **Freelancer paid** - Freelancer token balance increased by `amount - fee`
- [ ] **Platform fee collected** - Contract fee balance increased by `fee`
- [ ] **Contract escrow decreased** - Contract token balance decreased by `amount`
- [ ] **Completed jobs count incremented** - `get_completed_jobs_count()` increased by 1
- [ ] **Event emitted** - `job_approved` event with `(job_id, client, freelancer, payout)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::Completed);
let fee = amount * fee_bps / 10_000;
let payout = amount - fee;
assert_eq!(token_client.balance(&freelancer), pre_freelancer_balance + payout);
assert_eq!(escrow.get_fees(&token), pre_fees + fee);
assert_eq!(escrow.get_completed_jobs_count(), pre_completed_count + 1);
```

**Edge Cases:**
- [ ] Double approval - Should fail with InvalidStatus
- [ ] Approve by freelancer - Should fail with Unauthorized
- [ ] Approve open job - Should fail with InvalidStatus
- [ ] Approve in-progress job - Should fail with InvalidStatus
- [ ] Approve disputed job - Should fail with InvalidStatus
- [ ] Approve with zero fee - Should calculate correctly
- [ ] Approve with max fee - Should calculate correctly

---

### 5. reject_work

**Purpose:** Client rejects work, requests revision, transitions back to InProgress

**Pre-State:**
- [ ] Job exists and status is SubmittedForReview
- [ ] Caller is the client
- [ ] Revision count < MAX_REVISIONS (3)

**Post-State Validation:**
- [ ] **Status is InProgress** - `job.status == JobStatus::InProgress`
- [ ] **Revision count incremented** - `job.revision_count == pre_count + 1`
- [ ] **Amount unchanged** - Escrow amount unchanged
- [ ] **Freelancer unchanged** - Still assigned to same freelancer
- [ ] **Event emitted** - `job_rejected` event with `(job_id, client, revision_count)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::InProgress);
assert_eq!(job.revision_count, pre_revision_count + 1);
assert_eq!(job.amount, pre_amount);
```

**Edge Cases:**
- [ ] Reject beyond revision limit (4th rejection) - Should fail with RevisionLimitReached
- [ ] Reject by freelancer - Should fail with Unauthorized
- [ ] Reject open job - Should fail with InvalidStatus
- [ ] Reject in-progress job - Should fail with InvalidStatus
- [ ] Reject completed job - Should fail with InvalidStatus

---

### 6. cancel_job

**Purpose:** Client cancels open job, refunds full escrow

**Pre-State:**
- [ ] Job exists and status is Open
- [ ] Caller is the client

**Post-State Validation:**
- [ ] **Status is Cancelled** - `job.status == JobStatus::Cancelled`
- [ ] **Client refunded** - Client token balance increased by `amount`
- [ ] **Contract escrow decreased** - Contract token balance decreased by `amount`
- [ ] **Cancelled jobs count incremented** - `get_cancelled_jobs_count()` increased by 1
- [ ] **Event emitted** - `job_cancelled` event with `(job_id, client)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::Cancelled);
assert_eq!(token_client.balance(&client), pre_client_balance + amount);
assert_eq!(token_client.balance(&contract_id), pre_contract_balance - amount);
assert_eq!(escrow.get_cancelled_jobs_count(), pre_cancelled_count + 1);
```

**Edge Cases:**
- [ ] Cancel in-progress job - Should fail with InvalidStatus
- [ ] Cancel submitted job - Should fail with InvalidStatus
- [ ] Cancel by freelancer - Should fail with Unauthorized
- [ ] Cancel completed job - Should fail with InvalidStatus
- [ ] Double cancel - Should fail with InvalidStatus

---

### 7. freelancer_cancel_job

**Purpose:** Freelancer cancels in-progress job, refunds escrow to client

**Pre-State:**
- [ ] Job exists and status is InProgress
- [ ] Caller is the assigned freelancer

**Post-State Validation:**
- [ ] **Status is Cancelled** - `job.status == JobStatus::Cancelled`
- [ ] **Client refunded** - Client token balance increased by `amount`
- [ ] **Contract escrow decreased** - Contract token balance decreased by `amount
- [ ] **Event emitted** - `job_freelancer_cancelled` event with `(job_id, freelancer, client, amount)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::Cancelled);
assert_eq!(token_client.balance(&client), pre_client_balance + amount);
assert_eq!(token_client.balance(&contract_id), pre_contract_balance - amount);
```

**Edge Cases:**
- [ ] Cancel open job - Should fail with InvalidStatus
- [ ] Cancel submitted job - Should fail with InvalidStatus
- [ ] Cancel by client - Should fail with Unauthorized
- [ ] Cancel by wrong freelancer - Should fail with Unauthorized
- [ ] Cancel completed job - Should fail with InvalidStatus

---

### 8. mutual_cancel

**Purpose:** Both parties agree to cancel with custom split

**Pre-State:**
- [ ] Job exists and status is InProgress or SubmittedForReview
- [ ] Caller is client
- [ ] Freelancer authorizes (dual signature)
- [ ] client_share_bps is between 0 and 10,000

**Post-State Validation:**
- [ ] **Status is Cancelled** - `job.status == JobStatus::Cancelled`
- [ ] **Client receives share** - Client balance increased by `amount * client_share_bps / 10,000`
- [ ] **Freelancer receives remainder** - Freelancer balance increased by `amount * (10,000 - client_share_bps) / 10,000`
- [ ] **Contract escrow emptied** - Contract balance decreased by `amount`
- [ ] **Event emitted** - `job_mutually_cancelled` event with correct shares

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::Cancelled);
let client_share = amount * client_share_bps / 10_000;
let freelancer_share = amount - client_share;
assert_eq!(token_client.balance(&client), pre_client_balance + client_share);
assert_eq!(token_client.balance(&freelancer), pre_freelancer_balance + freelancer_share);
```

**Edge Cases:**
- [ ] Invalid share_bps (> 10,000 or < 0) - Should fail with InvalidAmount
- [ ] Cancel open job - Should fail with InvalidStatus
- [ ] Only client authorizes - Should fail with Unauthorized
- [ ] Only freelancer authorizes - Should fail with Unauthorized
- [ ] Cancel completed job - Should fail with InvalidStatus

---

### 9. enforce_deadline

**Purpose:** Client enforces passed deadline, cancels and refunds

**Pre-State:**
- [ ] Job exists and status is InProgress
- [ ] Caller is the client
- [ ] Deadline is non-zero and has passed
- [ ] Current ledger timestamp > deadline

**Post-State Validation:**
- [ ] **Status is Cancelled** - `job.status == JobStatus::Cancelled`
- [ ] **Client refunded** - Client balance increased by `amount`
- [ ] **Contract escrow decreased** - Contract balance decreased by `amount`
- [ ] **Event emitted** - `deadline_enforced` event with `(job_id, client)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::Cancelled);
assert_eq!(token_client.balance(&client), pre_client_balance + amount);
assert_eq!(token_client.balance(&contract_id), pre_contract_balance - amount);
```

**Edge Cases:**
- [ ] Enforce before deadline - Should fail with DeadlineNotExpired
- [ ] Enforce with zero deadline - Should fail with DeadlineNotExpired
- [ ] Enforce by freelancer - Should fail with Unauthorized
- [ ] Enforce open job - Should fail with InvalidStatus
- [ ] Enforce submitted job - Should fail with InvalidStatus

---

### 10. top_up_escrow

**Purpose:** Client adds funds to existing job escrow

**Pre-State:**
- [ ] Job exists and status is Open, InProgress, or SubmittedForReview
- [ ] Caller is the client
- [ ] Client has sufficient balance for additional_amount

**Post-State Validation:**
- [ ] **Job amount increased** - `job.amount == pre_amount + additional_amount`
- [ ] **Client balance decreased** - Client balance decreased by `additional_amount`
- [ ] **Contract escrow increased** - Contract balance increased by `additional_amount`
- [ ] **Status unchanged** - Job status remains the same
- [ ] **Event emitted** - `EscrowToppedUp` event with `(job_id, old_amount, new_amount)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.amount, pre_amount + additional_amount);
assert_eq!(job.status, pre_status);
assert_eq!(token_client.balance(&client), pre_client_balance - additional_amount);
assert_eq!(token_client.balance(&contract_id), pre_contract_balance + additional_amount);
```

**Edge Cases:**
- [ ] Top up with zero amount - Should fail with InvalidAmount
- [ ] Top up with negative amount - Should fail with InvalidAmount
- [ ] Top up by freelancer - Should fail with Unauthorized
- [ ] Top up cancelled job - Should fail with InvalidStatus
- [ ] Top up completed job - Should fail with InvalidStatus
- [ ] Top up disputed job - Should fail with InvalidStatus

---

### 11. raise_dispute

**Purpose:** Either party raises dispute, transitions to Disputed

**Pre-State:**
- [ ] Job exists and status is InProgress or SubmittedForReview
- [ ] Caller is client or freelancer

**Post-State Validation:**
- [ ] **Status is Disputed** - `job.status == JobStatus::Disputed`
- [ ] **Amount unchanged** - Escrow remains locked
- [ ] **Event emitted** - `job_disputed` event with `(job_id, caller)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
assert_eq!(job.status, JobStatus::Disputed);
assert_eq!(job.amount, pre_amount);
```

**Edge Cases:**
- [ ] Dispute by unauthorized party - Should fail with Unauthorized
- [ ] Dispute open job - Should fail with InvalidStatus
- [ ] Dispute completed job - Should fail with InvalidStatus
- [ ] Dispute cancelled job - Should fail with InvalidStatus
- [ ] Double dispute - Should fail with InvalidStatus

---

### 12. resolve_dispute

**Purpose:** Admin resolves disputed job with custom split

**Pre-State:**
- [ ] Job exists and status is Disputed
- [ ] Caller is admin
- [ ] client_bps is between 0 and 10,000

**Post-State Validation:**
- [ ] **Status transitions correctly**:
  - If `client_bps == 10,000` → Cancelled (full refund to client, no fee)
  - If `client_bps == 0` → Completed (full payout to freelancer minus fee)
  - If `0 < client_bps < 10,000` → Cancelled (split: client gets share no fee, freelancer gets remainder minus fee)
- [ ] **Client receives correct share** - Based on client_bps
- [ ] **Freelancer receives correct share** - Remainder minus platform fee
- [ ] **Platform fee collected** - Only on freelancer portion (unless client_bps == 10,000)
- [ ] **Contract escrow emptied** - Contract balance decreased by `amount`
- [ ] **Event emitted** - `dispute_resolved` event with `(job_id, client_bps)`

**Automated Assertions:**
```rust
let job = escrow.get_job(&job_id);
match client_bps {
    10_000 => {
        assert_eq!(job.status, JobStatus::Cancelled);
        assert_eq!(token_client.balance(&client), pre_client_balance + amount);
        assert_eq!(escrow.get_fees(&token), pre_fees); // No fee
    }
    0 => {
        assert_eq!(job.status, JobStatus::Completed);
        let fee = amount * fee_bps / 10_000;
        assert_eq!(token_client.balance(&freelancer), pre_freelancer_balance + amount - fee);
        assert_eq!(escrow.get_fees(&token), pre_fees + fee);
    }
    _ => {
        assert_eq!(job.status, JobStatus::Cancelled);
        let client_share = amount * client_bps / 10_000;
        let freelancer_share = amount - client_share;
        let fee = freelancer_share * fee_bps / 10_000;
        assert_eq!(token_client.balance(&client), pre_client_balance + client_share);
        assert_eq!(token_client.balance(&freelancer), pre_freelancer_balance + freelancer_share - fee);
        assert_eq!(escrow.get_fees(&token), pre_fees + fee);
    }
}
```

**Edge Cases:**
- [ ] Invalid client_bps (> 10,000 or < 0) - Should fail with InvalidAmount
- [ ] Resolve by non-admin - Should fail with UnauthorizedAdmin
- [ ] Resolve undisputed job - Should fail with InvalidStatus
- [ ] Resolve cancelled job - Should fail with InvalidStatus
- [ ] Resolve completed job - Should fail with InvalidStatus

---

## Cross-Transition Integrity Checks

### Balance Conservation

For every transition that involves token transfers:

- [ ] **Total tokens conserved** - Sum of all balances before = sum after (excluding fees)
- [ ] **Fee accounting correct** - Fees only go to contract fee account
- [ ] **No token creation/destruction** - Total supply is constant

### Status Flow Validation

- [ ] **Status transitions are valid** - Only allowed transitions occur
- [ ] **No status regression** - Jobs don't move from final states back to active states
- [ ] **Final states are terminal** - Completed/Cancelled jobs cannot transition further

### Event History

- [ ] **Event emitted for every transition** - Check event logs
- [ ] **Event data matches state** - Event fields match post-transition state
- [ ] **No duplicate events** - Each transition emits exactly one event

### Storage TTL

- [ ] **Active jobs TTL extended** - Active jobs get longer bump
- [ ] **Archived jobs TTL shorter** - Completed/Cancelled get shorter bump
- [ ] **Instance storage extended** - Updated on every state change

---

## Automated Test Template

```rust
#[test]
fn test_state_transition_data_integrity() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let token_client = StellarAssetClient::new(&env, &token);
    
    // Capture pre-state
    let pre_client_balance = token_client.balance(&client);
    let pre_freelancer_balance = token_client.balance(&freelancer);
    let pre_contract_balance = token_client.balance(&contract_id);
    let pre_fees = escrow.get_fees(&token);
    let pre_job_count = escrow.get_job_count();
    
    // Execute transition
    let job_id = escrow.post_job(&client, &100_0000000i128, &desc_hash, &100u32, &deadline, &token);
    
    // Validate post-state
    assert_eq!(escrow.get_job_count(), pre_job_count + 1);
    assert_eq!(token_client.balance(&client), pre_client_balance - 100_0000000i128);
    assert_eq!(token_client.balance(&contract_id), pre_contract_balance + 100_0000000i128);
    
    let job = escrow.get_job(&job_id);
    assert_eq!(job.status, JobStatus::Open);
    assert_eq!(job.amount, 100_0000000i128);
    
    // Verify event
    let events = env.events().all();
    assert!(events.iter().any(|e| e.topic.contains(&Symbol::new(&env, "job_created"))));
}
```

---

## Integration with Existing Tests

This checklist should be integrated into:

1. **Contract test suite** (`contracts/escrow/src/test.rs`) - Add data integrity assertions to existing tests
2. **Release checklist** (`docs/release-checklist.md`) - Reference this checklist before releases
3. **CI/CD pipeline** - Run automated assertions as part of test suite

---

## References

- Contract documentation: `docs/CONTRACT.md`
- Contract tests: `contracts/escrow/src/test.rs`
- Release checklist: `docs/release-checklist.md`
- Contract upgrade runbook: `docs/contract-upgrade-runbook.md`
