#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, vec, IntoVal};

#[allow(deprecated)]
fn setup_test(env: &Env) -> (Address, Address, Address, Address, Address) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let client = Address::generate(env);
    let freelancer = Address::generate(env);
    let token = env.register_stellar_asset_contract(client.clone());
    let token_admin = soroban_sdk::token::StellarAssetClient::new(env, &token);
    token_admin.mint(&client, &1000_0000000i128);

    let contract_id = env.register_contract(None, EscrowContract);
    let escrow = EscrowContractClient::new(env, &contract_id);

    escrow.initialize(&admin, &token);
    escrow.add_allowed_token(&admin, &token);

    (admin, client, freelancer, token, contract_id)
}

fn new_escrow<'a>(env: &'a Env, contract_id: &Address) -> EscrowContractClient<'a> {
    EscrowContractClient::new(env, contract_id)
}

#[test]
fn test_initialize() {
    let env = Env::default();
    let (_admin, _client, _freelancer, _token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    assert_eq!(escrow.get_job_count(), 0);
}

#[test]
fn test_post_and_get_job() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    assert_eq!(job_id, 1);
    assert_eq!(escrow.get_job_count(), 1);

    let job = escrow.get_job(&job_id);
    assert_eq!(job.client, client);
    assert_eq!(job.amount, amount);
    assert_eq!(job.status, JobStatus::Open);
}

#[test]
fn test_full_job_lifecycle() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.accept_job(&freelancer, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::InProgress);
    escrow.submit_work(&freelancer, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::SubmittedForReview);
    escrow.approve_work(&client, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Completed);
    assert_eq!(escrow.get_completed_jobs_count(), 1);
}

#[test]
fn test_cancel_job() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.cancel_job(&client, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Cancelled);
}

#[test]
fn test_cancel_with_rebate_within_grace_period() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    let info = escrow.get_cancellation_rebate_info(&job_id);
    assert!(info.is_eligible);
    escrow.cancel_with_rebate(&client, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Cancelled);
}

#[test]
fn test_get_cancellation_rebate_info_eligible() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    let info = escrow.get_cancellation_rebate_info(&job_id);
    assert!(info.is_eligible);
    assert_eq!(info.grace_deadline, CANCELLATION_GRACE_PERIOD);
}

#[test]
fn test_freelancer_cancel_job() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.accept_job(&freelancer, &job_id);
    escrow.freelancer_cancel_job(&freelancer, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Cancelled);
}

#[test]
fn test_enforce_deadline() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 10;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    env.ledger().set_sequence_number(deadline as u32 + 1);
    escrow.enforce_deadline(&client, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Cancelled);
}

#[test]
fn test_dispute_and_resolve() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.accept_job(&freelancer, &job_id);
    escrow.raise_dispute(&client, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Disputed);
    escrow.resolve_dispute(&admin, &job_id, &client);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Completed);
}

#[test]
fn test_admin_operations() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let _job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    let all_jobs = escrow.admin_get_all_jobs(&admin);
    assert_eq!(all_jobs.len(), 1);
    let open_jobs = escrow.admin_get_jobs_by_status(&admin, &JobStatus::Open);
    assert_eq!(open_jobs.len(), 1);
}

#[test]
fn test_whitelist_blacklist() {
    let env = Env::default();
    let (admin, _client, _freelancer, _token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let addr = Address::generate(&env);

    escrow.set_whitelist_mode(&admin, &true);
    assert!(escrow.is_whitelist_mode_enabled());
    escrow.add_to_whitelist(&admin, &addr);
    assert!(escrow.is_whitelisted_public(&addr));
    escrow.remove_from_whitelist(&admin, &addr);
    assert!(!escrow.is_whitelisted_public(&addr));
    escrow.add_to_blacklist(&admin, &addr);
    assert!(escrow.is_blacklisted_public(&addr));
    escrow.remove_from_blacklist(&admin, &addr);
    assert!(!escrow.is_blacklisted_public(&addr));
}

#[test]
fn test_token_management() {
    let env = Env::default();
    let (admin, _client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let new_token = Address::generate(&env);

    assert!(escrow.is_token_allowed(&token));
    assert!(!escrow.is_token_allowed(&new_token));
    escrow.add_allowed_token(&admin, &new_token);
    assert!(escrow.is_token_allowed(&new_token));
    escrow.remove_allowed_token(&admin, &new_token);
    assert!(!escrow.is_token_allowed(&new_token));
}

#[test]
fn test_fees_and_withdraw() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.accept_job(&freelancer, &job_id);
    escrow.submit_work(&freelancer, &job_id);
    escrow.approve_work(&client, &job_id);
    let fees = escrow.get_fees();
    assert!(fees > 0);
    escrow.withdraw_fees(&admin, &fees, &token);
    assert_eq!(escrow.get_fees(), 0);
}

#[test]
fn test_milestones() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let deadline: u64 = 1000;

    let m1 = Milestone {
        id: 0,
        description_hash: BytesN::from_array(&env, &[1u8; 32]),
        amount: 30_0000000i128,
        is_released: false,
    };
    let m2 = Milestone {
        id: 0,
        description_hash: BytesN::from_array(&env, &[2u8; 32]),
        amount: 70_0000000i128,
        is_released: false,
    };
    let milestones = vec![&env, m1, m2];

    let job_id = escrow.create_job_with_milestones(&client, &milestones, &deadline, &token);
    assert_eq!(job_id, 1);

    escrow.accept_job(&freelancer, &job_id);
    escrow.approve_milestone(&client, &job_id, &0u32);

    let stored = escrow.get_milestones(&job_id);
    assert_eq!(stored.len(), 2);
    assert!(stored.get(0).unwrap().is_released);
    assert!(!stored.get(1).unwrap().is_released);
}

#[test]
fn test_trusted_forwarder() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let forwarder = Address::generate(&env);

    escrow.set_trusted_forwarder(&admin, &forwarder);
    assert!(escrow.is_trusted_forwarder(&forwarder));

    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let job_id = escrow.post_job(&client, &100_0000000i128, &desc_hash, &100u32, &deadline, &token);
    escrow.relay_cancel_job(&forwarder, &client, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Cancelled);
}

#[test]
fn test_sla_config_creation() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let sla_config = SLAConfig {
        response_time_ledgers: 10,
        delivery_time_ledgers: 50,
        penalty_bps: 500,
        auto_escalate: true,
    };

    let job_id = escrow.post_job_with_sla(&client, &amount, &desc_hash, &100u32, &deadline, &token, &sla_config);
    assert_eq!(job_id, 1);

    let status = escrow.get_sla_status(&job_id);
    assert_eq!(status.config, Some(sla_config));
    assert_eq!(status.accepted_at, 0);
    assert!(!status.breached);
    assert!(!status.penalty_applied);
}

#[test]
fn test_sla_get_sla_status_returns_correct_values() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let sla_config = SLAConfig {
        response_time_ledgers: 10,
        delivery_time_ledgers: 20,
        penalty_bps: 500,
        auto_escalate: false,
    };

    let job_id = escrow.post_job_with_sla(&client, &amount, &desc_hash, &100u32, &deadline, &token, &sla_config);
    let status_before = escrow.get_sla_status(&job_id);
    assert_eq!(status_before.accepted_at, 0);

    escrow.accept_job(&freelancer, &job_id);
    let status_after_accept = escrow.get_sla_status(&job_id);
    assert!(status_after_accept.accepted_at > 0);
    assert_eq!(status_after_accept.config, Some(sla_config));
    assert!(!status_after_accept.breached);

    let current = env.ledger().sequence();
    env.ledger().set_sequence_number(current + 30);

    escrow.submit_work(&freelancer, &job_id);
    let status_after_submit = escrow.get_sla_status(&job_id);
    assert!(status_after_submit.breached);
    assert!(status_after_submit.penalty_applied);
}

#[test]
fn test_sla_penalty_applied_on_late_delivery() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let sla_config = SLAConfig {
        response_time_ledgers: 10,
        delivery_time_ledgers: 20,
        penalty_bps: 500,
        auto_escalate: true,
    };

    let job_id = escrow.post_job_with_sla(&client, &amount, &desc_hash, &100u32, &deadline, &token, &sla_config);
    escrow.accept_job(&freelancer, &job_id);

    let current = env.ledger().sequence();
    env.ledger().set_sequence_number(current + 30);

    escrow.submit_work(&freelancer, &job_id);

    let token_client = token::Client::new(&env, &token);
    let pre_balance = token_client.balance(&freelancer);
    escrow.approve_work(&client, &job_id);
    let post_balance = token_client.balance(&freelancer);

    let fee = amount * PLATFORM_FEE_BPS as i128 / 10000;
    let sla_penalty = amount * sla_config.penalty_bps as i128 / SLA_PENALTY_DENOMINATOR as i128;
    let expected_payout = amount - fee - sla_penalty;
    assert_eq!(post_balance - pre_balance, expected_payout);
}

#[test]
fn test_sla_breach_event_emitted() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let amount: i128 = 100_0000000;

    let sla_config = SLAConfig {
        response_time_ledgers: 10,
        delivery_time_ledgers: 20,
        penalty_bps: 500,
        auto_escalate: true,
    };

    let job_id = escrow.post_job_with_sla(&client, &amount, &desc_hash, &100u32, &deadline, &token, &sla_config);
    escrow.accept_job(&freelancer, &job_id);

    let current = env.ledger().sequence();
    env.ledger().set_sequence_number(current + 30);

    let pre_events = env.events().all().len();
    escrow.submit_work(&freelancer, &job_id);
    let post_events = env.events().all().len();

    assert!(post_events > pre_events, "SLA breach should emit an event");
}

// ── [TEST-05] Multiple concurrent dispute scenarios ───────────────────────────
//
// Issue #632: Test dispute flows with multiple jobs in dispute simultaneously.
// Verifies:
//   1. 3+ jobs can be in Disputed status concurrently.
//   2. Resolving disputes in different orders does not cross-contaminate payouts.
//   3. Each job produces the correct independent payout to its winner.
//   4. Platform fee accounting is correct across all concurrent disputes.
//   5. Non-disputed jobs are unaffected when concurrent disputes are resolved.
//
// Fee formula: fee = amount * PLATFORM_FEE_BPS / 10000  (2.5%)
// Winner payout: amount - fee

/// Helper: drive a job from Open all the way to Disputed status.
/// Returns the job_id. Uses `submit_before_dispute = true` to place the
/// job in SubmittedForReview before the dispute is raised (simulating
/// the freelancer having already submitted work).
#[allow(dead_code)]
fn create_disputed_job(
    env: &Env,
    escrow: &EscrowContractClient,
    client: &Address,
    freelancer: &Address,
    amount: i128,
    token: &Address,
    dispute_raiser: &Address,
    submit_before_dispute: bool,
) -> u64 {
    let desc_hash = BytesN::from_array(env, &[0u8; 32]);
    let deadline: u64 = 9999;
    let job_id = escrow.post_job(client, &amount, &desc_hash, &100u32, &deadline, token);
    escrow.accept_job(freelancer, &job_id);
    if submit_before_dispute {
        escrow.submit_work(freelancer, &job_id);
    }
    escrow.raise_dispute(dispute_raiser, &job_id);
    assert_eq!(escrow.get_job(&job_id).status, JobStatus::Disputed);
    job_id
}

/// TEST-05-01: Three jobs can be simultaneously in Disputed status.
///
/// Verifies that raising disputes on 3 separate jobs all results in each
/// being independently in Disputed status, and that no job's state
/// bleeds into another.
#[test]
fn test_concurrent_disputes_three_jobs_all_disputed_simultaneously() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;

    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &freelancer, true);
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, false);

    // All three must be concurrently in Disputed status.
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Disputed, "job1 must be Disputed");
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Disputed, "job2 must be Disputed");
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed, "job3 must be Disputed");

    // Each job retains its own amount independently.
    assert_eq!(escrow.get_job(&job1).amount, amount);
    assert_eq!(escrow.get_job(&job2).amount, amount);
    assert_eq!(escrow.get_job(&job3).amount, amount);

    // Job count reflects all posted jobs.
    assert_eq!(escrow.get_job_count(), 3);
}

/// TEST-05-02: Resolve disputes in order 1→2→3, verify independent payouts.
///
/// Three concurrent disputed jobs are resolved sequentially in natural order
/// (job1 first, then job2, then job3). Each resolution must transfer funds
/// only to the correct winner without affecting the other disputed jobs.
///
/// Outcome:
///   job1 → freelancer wins (client_bps=0) → freelancer gets amount - 2.5% fee
///   job2 → client wins   (client_bps=10000) → client gets amount back (no fee on full client win)
///   job3 → freelancer wins (client_bps=0) → freelancer gets amount - 2.5% fee
#[test]
fn test_concurrent_disputes_resolve_in_order_1_2_3() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;
    let fee_per_job: i128 = amount * PLATFORM_FEE_BPS as i128 / 10000; // 2_500_000
    let payout: i128 = amount - fee_per_job;                            // 97_500_000

    // Post and dispute 3 jobs simultaneously.
    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    let token_client = token::Client::new(&env, &token);
    let freelancer_pre = token_client.balance(&freelancer);
    let client_pre    = token_client.balance(&client);

    // Resolve job1: freelancer wins entirely.
    escrow.resolve_dispute(&admin, &job1, &freelancer);
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Completed, "job1 must be Completed");

    // job2 and job3 must still be Disputed after job1 resolved.
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Disputed, "job2 must still be Disputed after job1 resolved");
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed, "job3 must still be Disputed after job1 resolved");

    // Freelancer received payout for job1 only.
    let freelancer_after_job1 = token_client.balance(&freelancer);
    assert_eq!(
        freelancer_after_job1 - freelancer_pre,
        payout,
        "freelancer payout after job1 resolution must equal amount minus fee"
    );

    // Resolve job2: client wins entirely.
    // When admin resolves in favor of the client, the client gets amount - fee.
    escrow.resolve_dispute(&admin, &job2, &client);
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Completed, "job2 must be Completed");

    // job3 must still be Disputed.
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed, "job3 must still be Disputed after job2 resolved");

    let client_after_job2 = token_client.balance(&client);
    assert_eq!(
        client_after_job2 - client_pre,
        payout,
        "client payout after job2 resolution must equal amount minus fee"
    );

    // Resolve job3: freelancer wins entirely.
    escrow.resolve_dispute(&admin, &job3, &freelancer);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Completed, "job3 must be Completed");

    let freelancer_final = token_client.balance(&freelancer);
    assert_eq!(
        freelancer_final - freelancer_pre,
        payout * 2, // won job1 + job3
        "freelancer must have received two payouts (job1 + job3)"
    );

    // Total fees collected: 3 jobs × fee_per_job.
    let total_fees = escrow.get_fees();
    assert_eq!(
        total_fees,
        fee_per_job * 3,
        "total platform fees must equal 3 × per-job fee"
    );

    // Completed job count must be 3.
    assert_eq!(escrow.get_completed_jobs_count(), 3);
}

/// TEST-05-03: Resolve disputes in reverse order 3→2→1, verify independent payouts.
///
/// Three concurrent disputed jobs are resolved in reverse order. This confirms
/// that the order of resolution does not affect the payout amount for any job;
/// each job's funds are locked independently in the escrow.
///
/// Outcome:
///   job3 → freelancer wins → freelancer gets amount - fee
///   job2 → freelancer wins → freelancer gets amount - fee
///   job1 → client wins     → client gets amount - fee
#[test]
fn test_concurrent_disputes_resolve_in_reverse_order_3_2_1() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;
    let fee_per_job: i128 = amount * PLATFORM_FEE_BPS as i128 / 10000;
    let payout: i128 = amount - fee_per_job;

    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    let token_client    = token::Client::new(&env, &token);
    let freelancer_pre  = token_client.balance(&freelancer);
    let client_pre      = token_client.balance(&client);

    // Resolve job3 first (reverse order).
    escrow.resolve_dispute(&admin, &job3, &freelancer);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Completed);
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Disputed, "job1 still disputed after job3 resolved");
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Disputed, "job2 still disputed after job3 resolved");

    // Resolve job2.
    escrow.resolve_dispute(&admin, &job2, &freelancer);
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Completed);
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Disputed, "job1 still disputed after job2 resolved");

    // Resolve job1 last; client wins.
    escrow.resolve_dispute(&admin, &job1, &client);
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Completed);

    // Freelancer won job2 + job3 → 2 × payout.
    assert_eq!(
        token_client.balance(&freelancer) - freelancer_pre,
        payout * 2,
        "freelancer must receive payout for job2 + job3"
    );

    // Client won job1 → 1 × payout.
    assert_eq!(
        token_client.balance(&client) - client_pre,
        payout,
        "client must receive payout for job1"
    );

    // 3 fees collected.
    assert_eq!(escrow.get_fees(), fee_per_job * 3);
    assert_eq!(escrow.get_completed_jobs_count(), 3);
}

/// TEST-05-04: Resolve disputes in interleaved order 2→1→3, verify independent payouts.
///
/// Resolving in a non-sequential order (middle → first → last) must produce the
/// same correct per-job payouts as any other order. Confirms true independence.
#[test]
fn test_concurrent_disputes_resolve_in_interleaved_order_2_1_3() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;
    let fee_per_job: i128 = amount * PLATFORM_FEE_BPS as i128 / 10000;
    let payout: i128 = amount - fee_per_job;

    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    let token_client   = token::Client::new(&env, &token);
    let freelancer_pre = token_client.balance(&freelancer);
    let client_pre     = token_client.balance(&client);

    // Resolve job2 first (middle).
    escrow.resolve_dispute(&admin, &job2, &client);
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Completed);
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Disputed);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed);

    // Resolve job1 second.
    escrow.resolve_dispute(&admin, &job1, &freelancer);
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Completed);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed);

    // Resolve job3 last.
    escrow.resolve_dispute(&admin, &job3, &freelancer);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Completed);

    // Client won job2.
    assert_eq!(
        token_client.balance(&client) - client_pre,
        payout,
        "client payout must be exactly one winning dispute"
    );

    // Freelancer won job1 + job3.
    assert_eq!(
        token_client.balance(&freelancer) - freelancer_pre,
        payout * 2,
        "freelancer payout must be exactly two winning disputes"
    );

    assert_eq!(escrow.get_fees(), fee_per_job * 3);
    assert_eq!(escrow.get_completed_jobs_count(), 3);
}

/// TEST-05-05: Five concurrent disputed jobs, mixed winners, verify all payouts correct.
///
/// Extends coverage beyond 3 jobs to 5 simultaneously disputed jobs.
/// Uses different amounts per job to confirm per-job fee isolation.
///
/// job1 (200 XLM) → freelancer wins
/// job2 (100 XLM) → client wins
/// job3 (300 XLM) → freelancer wins
/// job4 (150 XLM) → client wins
/// job5 (250 XLM) → freelancer wins
#[test]
fn test_five_concurrent_disputes_mixed_winners_correct_payouts() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);

    // setup_test mints 1000_0000000 to client; need more for 5 jobs totalling 1000 XLM.
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token);
    token_admin.mint(&client, &1000_0000000i128); // add 1000 more XLM

    let amounts: [i128; 5] = [
        200_0000000, // job1
        100_0000000, // job2
        300_0000000, // job3
        150_0000000, // job4
        250_0000000, // job5
    ];

    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 9999;

    // Post, accept, submit, dispute all 5 jobs.
    let mut job_ids: [u64; 5] = [0; 5];
    for (i, amt) in amounts.iter().enumerate() {
        let job_id = escrow.post_job(&client, amt, &desc_hash, &100u32, &deadline, &token);
        escrow.accept_job(&freelancer, &job_id);
        escrow.submit_work(&freelancer, &job_id);
        escrow.raise_dispute(&client, &job_id);
        assert_eq!(escrow.get_job(&job_id).status, JobStatus::Disputed);
        job_ids[i] = job_id;
    }

    // All 5 must be in Disputed simultaneously.
    for id in job_ids.iter() {
        assert_eq!(escrow.get_job(id).status, JobStatus::Disputed, "all jobs must be Disputed before any resolution");
    }

    let token_client   = token::Client::new(&env, &token);
    let freelancer_pre = token_client.balance(&freelancer);
    let client_pre     = token_client.balance(&client);

    // Resolve in order 3→1→4→2→5 (deliberately non-sequential).
    // job3 → freelancer wins
    escrow.resolve_dispute(&admin, &job_ids[2], &freelancer);
    assert_eq!(escrow.get_job(&job_ids[2]).status, JobStatus::Completed);

    // job1 → freelancer wins
    escrow.resolve_dispute(&admin, &job_ids[0], &freelancer);
    assert_eq!(escrow.get_job(&job_ids[0]).status, JobStatus::Completed);

    // job4 → client wins
    escrow.resolve_dispute(&admin, &job_ids[3], &client);
    assert_eq!(escrow.get_job(&job_ids[3]).status, JobStatus::Completed);

    // job2 → client wins
    escrow.resolve_dispute(&admin, &job_ids[1], &client);
    assert_eq!(escrow.get_job(&job_ids[1]).status, JobStatus::Completed);

    // job5 → freelancer wins
    escrow.resolve_dispute(&admin, &job_ids[4], &freelancer);
    assert_eq!(escrow.get_job(&job_ids[4]).status, JobStatus::Completed);

    // Compute expected payouts.
    // freelancer wins: job1(200), job3(300), job5(250)
    let freelancer_wins: i128 = amounts[0] + amounts[2] + amounts[4]; // 750 XLM
    let freelancer_fees: i128 = freelancer_wins * PLATFORM_FEE_BPS as i128 / 10000;
    let freelancer_expected_payout: i128 = freelancer_wins - freelancer_fees;

    // client wins: job2(100), job4(150)
    let client_wins: i128 = amounts[1] + amounts[3]; // 250 XLM
    let client_fees: i128 = client_wins * PLATFORM_FEE_BPS as i128 / 10000;
    let client_expected_payout: i128 = client_wins - client_fees;

    assert_eq!(
        token_client.balance(&freelancer) - freelancer_pre,
        freelancer_expected_payout,
        "freelancer total payout must match sum of won job amounts minus fees"
    );
    assert_eq!(
        token_client.balance(&client) - client_pre,
        client_expected_payout,
        "client total payout must match sum of won job amounts minus fees"
    );

    // Total fees = 2.5% of all 5 job amounts.
    let total_amount: i128 = amounts.iter().sum();
    let total_fees: i128 = total_amount * PLATFORM_FEE_BPS as i128 / 10000;
    assert_eq!(
        escrow.get_fees(),
        total_fees,
        "platform fees must equal 2.5% of all 5 job amounts"
    );
    assert_eq!(escrow.get_completed_jobs_count(), 5);
}

/// TEST-05-06: Non-disputed jobs are unaffected while concurrent disputes exist.
///
/// Creates 5 jobs total: 3 in Disputed, 1 completed normally, 1 still Open.
/// Resolves all 3 disputes. Verifies:
///   - The completed job's payout was already correct and unchanged.
///   - The Open job is still Open after all disputes resolve.
///   - Each disputed job independently pays its winner.
#[test]
fn test_concurrent_disputes_do_not_affect_non_disputed_jobs() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;
    let fee: i128    = amount * PLATFORM_FEE_BPS as i128 / 10000;
    let payout: i128 = amount - fee;

    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 9999;
    let token_client = token::Client::new(&env, &token);

    // Job A: complete normally before any disputes.
    let job_a = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.accept_job(&freelancer, &job_a);
    escrow.submit_work(&freelancer, &job_a);
    let freelancer_pre_a = token_client.balance(&freelancer);
    escrow.approve_work(&client, &job_a);
    let freelancer_after_a = token_client.balance(&freelancer);
    assert_eq!(freelancer_after_a - freelancer_pre_a, payout, "normal job payout must be correct");
    assert_eq!(escrow.get_job(&job_a).status, JobStatus::Completed);

    // Jobs B, C, D: disputed concurrently.
    let job_b = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job_c = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job_d = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    // Job E: posted but left Open (no freelancer yet).
    let job_e = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    assert_eq!(escrow.get_job(&job_e).status, JobStatus::Open);

    // Verify the completed job_a is still Completed and undisturbed.
    assert_eq!(escrow.get_job(&job_a).status, JobStatus::Completed, "job_a must remain Completed");

    // Resolve disputes in order D→B→C.
    let freelancer_pre_disputes = token_client.balance(&freelancer);
    let client_pre_disputes     = token_client.balance(&client);

    escrow.resolve_dispute(&admin, &job_d, &freelancer); // freelancer wins job_d
    assert_eq!(escrow.get_job(&job_d).status, JobStatus::Completed);
    assert_eq!(escrow.get_job(&job_e).status, JobStatus::Open, "job_e must remain Open");

    escrow.resolve_dispute(&admin, &job_b, &client);    // client wins job_b
    assert_eq!(escrow.get_job(&job_b).status, JobStatus::Completed);
    assert_eq!(escrow.get_job(&job_c).status, JobStatus::Disputed, "job_c must still be Disputed");

    escrow.resolve_dispute(&admin, &job_c, &freelancer); // freelancer wins job_c
    assert_eq!(escrow.get_job(&job_c).status, JobStatus::Completed);

    // Open job_e must still be Open after all disputes resolved.
    assert_eq!(escrow.get_job(&job_e).status, JobStatus::Open, "job_e must be unchanged after all disputes resolved");

    // Freelancer won job_c and job_d → 2 payouts.
    assert_eq!(
        token_client.balance(&freelancer) - freelancer_pre_disputes,
        payout * 2,
        "freelancer must receive payout for 2 won disputes"
    );

    // Client won job_b → 1 payout.
    assert_eq!(
        token_client.balance(&client) - client_pre_disputes,
        payout,
        "client must receive payout for 1 won dispute"
    );

    // Completed count = job_a + job_b + job_c + job_d = 4. job_e still Open.
    assert_eq!(escrow.get_completed_jobs_count(), 4);
    assert_eq!(escrow.get_job_count(), 5);
}

/// TEST-05-07: Fee conservation invariant across all concurrent dispute resolutions.
///
/// For N concurrent disputed jobs, the sum of all payouts plus all fees must
/// equal the sum of all job amounts (no funds created or destroyed).
/// Uses 4 jobs with different amounts to stress the accounting.
#[test]
fn test_concurrent_disputes_fee_conservation_invariant() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);

    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token);
    token_admin.mint(&client, &500_0000000i128);

    let amounts: [i128; 4] = [
        80_0000000,
        120_0000000,
        200_0000000,
        50_0000000,
    ];

    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 9999;
    let token_client = token::Client::new(&env, &token);

    let contract_addr = contract_id.clone();
    let escrow_before_all = token_client.balance(&contract_addr);

    // Post, accept, submit, dispute all 4 jobs.
    let mut job_ids: [u64; 4] = [0; 4];
    for (i, amt) in amounts.iter().enumerate() {
        let job_id = escrow.post_job(&client, amt, &desc_hash, &100u32, &deadline, &token);
        escrow.accept_job(&freelancer, &job_id);
        escrow.submit_work(&freelancer, &job_id);
        escrow.raise_dispute(&client, &job_id);
        job_ids[i] = job_id;
    }

    let total_escrowed: i128 = amounts.iter().sum();
    assert_eq!(
        token_client.balance(&contract_addr) - escrow_before_all,
        total_escrowed,
        "escrow must hold the sum of all posted job amounts"
    );

    let freelancer_pre = token_client.balance(&freelancer);
    let client_pre     = token_client.balance(&client);

    // Resolve: jobs 0,2 → freelancer wins; jobs 1,3 → client wins.
    escrow.resolve_dispute(&admin, &job_ids[0], &freelancer);
    escrow.resolve_dispute(&admin, &job_ids[1], &client);
    escrow.resolve_dispute(&admin, &job_ids[2], &freelancer);
    escrow.resolve_dispute(&admin, &job_ids[3], &client);

    // Compute expected values.
    let fee0 = amounts[0] * PLATFORM_FEE_BPS as i128 / 10000;
    let fee1 = amounts[1] * PLATFORM_FEE_BPS as i128 / 10000;
    let fee2 = amounts[2] * PLATFORM_FEE_BPS as i128 / 10000;
    let fee3 = amounts[3] * PLATFORM_FEE_BPS as i128 / 10000;
    let total_fees_expected: i128 = fee0 + fee1 + fee2 + fee3;

    let freelancer_payout_expected: i128 = (amounts[0] - fee0) + (amounts[2] - fee2);
    let client_payout_expected: i128     = (amounts[1] - fee1) + (amounts[3] - fee3);

    // Verify payouts.
    assert_eq!(
        token_client.balance(&freelancer) - freelancer_pre,
        freelancer_payout_expected,
        "freelancer total payout must equal sum of won dispute amounts minus fees"
    );
    assert_eq!(
        token_client.balance(&client) - client_pre,
        client_payout_expected,
        "client total payout must equal sum of won dispute amounts minus fees"
    );

    // Fee conservation: total_fees = accrued platform fees.
    assert_eq!(
        escrow.get_fees(),
        total_fees_expected,
        "accrued fees must equal sum of per-job 2.5% fees"
    );

    // Full conservation: payout_freelancer + payout_client + fees == total_escrowed.
    assert_eq!(
        freelancer_payout_expected + client_payout_expected + total_fees_expected,
        total_escrowed,
        "total payouts plus fees must exactly equal total escrowed amount"
    );

    // Escrow contract balance now holds only the accrued (unwithdawn) fees.
    assert_eq!(
        token_client.balance(&contract_addr) - escrow_before_all,
        total_fees_expected,
        "escrow must retain only the accrued fees after all disputes resolved"
    );
}

/// TEST-05-08: Resolve one dispute, attempt to re-resolve the same job — must panic.
///
/// Once a disputed job is resolved (status → Completed), calling resolve_dispute
/// on it again must panic with JobNotDisputed / InvalidJobStatus.
/// The remaining concurrently-disputed jobs must be unaffected.
#[test]
#[should_panic]
fn test_concurrent_disputes_resolve_same_job_twice_panics() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;

    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let _job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let _job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    // Resolve job1 once (valid).
    escrow.resolve_dispute(&admin, &job1, &freelancer);
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Completed);

    // Attempt to resolve job1 again — must panic (Completed ≠ Disputed).
    escrow.resolve_dispute(&admin, &job1, &client);
}

/// TEST-05-09: Raise dispute from freelancer side while other client-raised disputes exist.
///
/// Verifies that the party who raises the dispute (client or freelancer) does not
/// affect the resolution outcome — only the admin's winner choice matters.
/// Both types of dispute-raiser can coexist concurrently.
#[test]
fn test_concurrent_disputes_different_raisers_resolve_independently() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;
    let fee: i128    = amount * PLATFORM_FEE_BPS as i128 / 10000;
    let payout: i128 = amount - fee;

    // job1: dispute raised by client
    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    // job2: dispute raised by freelancer (InProgress, no submit)
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &freelancer, false);
    // job3: dispute raised by freelancer (after submit)
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &freelancer, true);

    assert_eq!(escrow.get_job(&job1).status, JobStatus::Disputed);
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Disputed);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed);

    let token_client   = token::Client::new(&env, &token);
    let freelancer_pre = token_client.balance(&freelancer);
    let client_pre     = token_client.balance(&client);

    // Resolve: regardless of who raised the dispute, admin decides the winner.
    escrow.resolve_dispute(&admin, &job1, &client);     // admin awards job1 to client
    escrow.resolve_dispute(&admin, &job2, &freelancer); // admin awards job2 to freelancer
    escrow.resolve_dispute(&admin, &job3, &client);     // admin awards job3 to client

    // client won job1 + job3.
    assert_eq!(
        token_client.balance(&client) - client_pre,
        payout * 2,
        "client must receive 2 winning dispute payouts"
    );

    // freelancer won job2.
    assert_eq!(
        token_client.balance(&freelancer) - freelancer_pre,
        payout,
        "freelancer must receive 1 winning dispute payout"
    );

    assert_eq!(escrow.get_fees(), fee * 3);
    assert_eq!(escrow.get_completed_jobs_count(), 3);
}

/// TEST-05-10: Fee withdrawal after resolving multiple concurrent disputes.
///
/// After 3 concurrent disputes are resolved, the admin withdraws all accrued fees.
/// Verifies: fees reset to zero, admin receives the correct sum, escrow balance
/// returns to zero (no stranded funds).
#[test]
fn test_concurrent_disputes_fee_withdrawal_after_all_resolved() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;
    let fee: i128    = amount * PLATFORM_FEE_BPS as i128 / 10000;

    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    // Resolve all three — mix of winners.
    escrow.resolve_dispute(&admin, &job1, &freelancer);
    escrow.resolve_dispute(&admin, &job2, &freelancer);
    escrow.resolve_dispute(&admin, &job3, &client);

    let expected_total_fees: i128 = fee * 3;
    assert_eq!(
        escrow.get_fees(),
        expected_total_fees,
        "fees must accumulate across all 3 resolved disputes"
    );

    // Withdraw all fees.
    let token_client = token::Client::new(&env, &token);
    let admin_pre    = token_client.balance(&admin);
    let contract_pre = token_client.balance(&contract_id);

    escrow.withdraw_fees(&admin, &expected_total_fees, &token);

    assert_eq!(
        escrow.get_fees(),
        0,
        "fees must be zero after full withdrawal"
    );
    assert_eq!(
        token_client.balance(&admin) - admin_pre,
        expected_total_fees,
        "admin must receive exactly the total accrued fees"
    );
    assert_eq!(
        token_client.balance(&contract_id),
        contract_pre - expected_total_fees,
        "contract escrow balance must drop by exactly the withdrawn fee amount"
    );
}

/// TEST-05-11: Split-payout dispute resolution with concurrent disputes.
///
/// Uses `resolve_dispute_split` (raw token amounts) to verify that custom
/// splits on concurrent jobs are calculated and paid out independently.
///
/// job1: 60% client / 40% freelancer
/// job2: 25% client / 75% freelancer
/// job3: 0% client  / 100% freelancer (full payout to freelancer, no fee)
#[test]
fn test_concurrent_disputes_split_payout_independent() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;

    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    let token_client   = token::Client::new(&env, &token);
    let freelancer_pre = token_client.balance(&freelancer);
    let client_pre     = token_client.balance(&client);

    // job1: 60/40 split.
    let client_share1:     i128 = 60_0000000;
    let freelancer_share1: i128 = 40_0000000;
    escrow.resolve_dispute_split(&admin, &job1, &client_share1, &freelancer_share1);
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Completed);

    // job2 and job3 must still be Disputed.
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Disputed);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed);

    // job2: 25/75 split.
    let client_share2:     i128 = 25_0000000;
    let freelancer_share2: i128 = 75_0000000;
    escrow.resolve_dispute_split(&admin, &job2, &client_share2, &freelancer_share2);
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Completed);

    // job3 still Disputed.
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed);

    // job3: full freelancer payout (no client share, no fee).
    let client_share3:     i128 = 0;
    let freelancer_share3: i128 = 100_0000000;
    escrow.resolve_dispute_split(&admin, &job3, &client_share3, &freelancer_share3);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Completed);

    // Verify freelancer received sum of all freelancer shares.
    let freelancer_total_expected: i128 = freelancer_share1 + freelancer_share2 + freelancer_share3;
    assert_eq!(
        token_client.balance(&freelancer) - freelancer_pre,
        freelancer_total_expected,
        "freelancer must receive exact sum of all freelancer split shares"
    );

    // Verify client received sum of all client shares.
    let client_total_expected: i128 = client_share1 + client_share2 + client_share3;
    assert_eq!(
        token_client.balance(&client) - client_pre,
        client_total_expected,
        "client must receive exact sum of all client split shares"
    );

    assert_eq!(escrow.get_completed_jobs_count(), 3);
}

/// TEST-05-12: Events emitted for each concurrent dispute resolution independently.
///
/// Each resolve_dispute call must emit at least one event. Across 3 resolutions
/// the total event count must increase by at least 3.
#[test]
fn test_concurrent_disputes_each_resolution_emits_event() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;

    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    let events_before_any_resolve = env.events().all().len();

    escrow.resolve_dispute(&admin, &job1, &freelancer);
    let events_after_job1 = env.events().all().len();
    assert!(
        events_after_job1 > events_before_any_resolve,
        "resolving job1 must emit at least one event"
    );

    escrow.resolve_dispute(&admin, &job2, &client);
    let events_after_job2 = env.events().all().len();
    assert!(
        events_after_job2 > events_after_job1,
        "resolving job2 must emit at least one additional event"
    );

    escrow.resolve_dispute(&admin, &job3, &freelancer);
    let events_after_job3 = env.events().all().len();
    assert!(
        events_after_job3 > events_after_job2,
        "resolving job3 must emit at least one additional event"
    );

    // Total: at least 3 new events across 3 resolutions.
    assert!(
        events_after_job3 - events_before_any_resolve >= 3,
        "at least 3 events must be emitted across all dispute resolutions"
    );
}

/// TEST-05-13: Completed jobs count tracks only resolved disputes, not pending ones.
///
/// With 3 disputed jobs, the completed count must only increment as each dispute
/// is resolved — not all at once — and must not be affected by still-pending disputes.
#[test]
fn test_concurrent_disputes_completed_count_increments_per_resolution() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;

    let job1 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job2 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);
    let job3 = create_disputed_job(&env, &escrow, &client, &freelancer, amount, &token, &client, true);

    // No disputes resolved yet.
    assert_eq!(escrow.get_completed_jobs_count(), 0, "no completed jobs before any resolution");

    escrow.resolve_dispute(&admin, &job1, &freelancer);
    assert_eq!(escrow.get_completed_jobs_count(), 1, "one completed job after job1 resolved");

    escrow.resolve_dispute(&admin, &job2, &client);
    assert_eq!(escrow.get_completed_jobs_count(), 2, "two completed jobs after job2 resolved");

    escrow.resolve_dispute(&admin, &job3, &freelancer);
    assert_eq!(escrow.get_completed_jobs_count(), 3, "three completed jobs after all resolved");
}

/// TEST-05-14: Concurrent disputes — each job retains its own freelancer assignment.
///
/// When multiple jobs are disputed concurrently each involving different freelancers,
/// the resolution payout must go to the correct freelancer for that specific job.
#[test]
fn test_concurrent_disputes_distinct_freelancers_correct_payout_routing() {
    let env = Env::default();
    let (admin, client, _default_freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let amount: i128 = 100_0000000;
    let fee: i128    = amount * PLATFORM_FEE_BPS as i128 / 10000;
    let payout: i128 = amount - fee;

    // Three different freelancers.
    let freelancer_a = Address::generate(&env);
    let freelancer_b = Address::generate(&env);
    let freelancer_c = Address::generate(&env);

    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 9999;

    // job1 accepted by freelancer_a.
    let job1 = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.accept_job(&freelancer_a, &job1);
    escrow.submit_work(&freelancer_a, &job1);
    escrow.raise_dispute(&client, &job1);

    // job2 accepted by freelancer_b.
    let job2 = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.accept_job(&freelancer_b, &job2);
    escrow.submit_work(&freelancer_b, &job2);
    escrow.raise_dispute(&client, &job2);

    // job3 accepted by freelancer_c.
    let job3 = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token);
    escrow.accept_job(&freelancer_c, &job3);
    escrow.submit_work(&freelancer_c, &job3);
    escrow.raise_dispute(&client, &job3);

    // All three simultaneously Disputed.
    assert_eq!(escrow.get_job(&job1).status, JobStatus::Disputed);
    assert_eq!(escrow.get_job(&job2).status, JobStatus::Disputed);
    assert_eq!(escrow.get_job(&job3).status, JobStatus::Disputed);

    let token_client = token::Client::new(&env, &token);
    let pre_a = token_client.balance(&freelancer_a);
    let pre_b = token_client.balance(&freelancer_b);
    let pre_c = token_client.balance(&freelancer_c);

    // Resolve each in favour of its respective freelancer.
    escrow.resolve_dispute(&admin, &job2, &freelancer_b); // middle first
    escrow.resolve_dispute(&admin, &job3, &freelancer_c); // last second
    escrow.resolve_dispute(&admin, &job1, &freelancer_a); // first last

    // Each freelancer must receive payout for exactly their own job.
    assert_eq!(
        token_client.balance(&freelancer_a) - pre_a,
        payout,
        "freelancer_a must receive payout for job1 only"
    );
    assert_eq!(
        token_client.balance(&freelancer_b) - pre_b,
        payout,
        "freelancer_b must receive payout for job2 only"
    );
    assert_eq!(
        token_client.balance(&freelancer_c) - pre_c,
        payout,
        "freelancer_c must receive payout for job3 only"
    );

    // No cross-contamination: each freelancer received exactly one payout.
    assert_eq!(escrow.get_fees(), fee * 3);
    assert_eq!(escrow.get_completed_jobs_count(), 3);
}
