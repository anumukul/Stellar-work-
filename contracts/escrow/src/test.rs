#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::Address as _,
    testutils::Events,
    testutils::Ledger as _,
    vec,
    IntoVal,
};

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

fn dummy_title(env: &Env) -> BytesN<64> {
    BytesN::from_array(env, &[0u8; 64])
}

fn dummy_category(env: &Env) -> Symbol {
    Symbol::new(env, "development")
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let _job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.create_job_with_milestones(&client, &milestones, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
    assert_eq!(job_id, 1);

    escrow.accept_job(&freelancer, &job_id);
    escrow.approve_milestone(&client, &job_id, &0u32);

    let stored = escrow.get_milestones(&job_id);
    assert_eq!(stored.len(), 2);
    assert!(stored.get(0).unwrap().is_released);
    assert!(!stored.get(1).unwrap().is_released);
}

#[test]
fn test_complete_milestone_with_fees() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let deadline: u64 = 1000;

    let m1 = Milestone {
        id: 0,
        description_hash: BytesN::from_array(&env, &[1u8; 32]),
        amount: 50_0000000i128,
        is_released: false,
    };
    let m2 = Milestone {
        id: 0,
        description_hash: BytesN::from_array(&env, &[2u8; 32]),
        amount: 50_0000000i128,
        is_released: false,
    };
    let milestones = vec![&env, m1, m2];

    let job_id = escrow.create_job_with_milestones(&client, &milestones, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
    assert_eq!(job_id, 1);

    escrow.accept_job(&freelancer, &job_id);

    let token_client = token::Client::new(&env, &token);
    let pre_balance = token_client.balance(&freelancer);
    let pre_fees = escrow.get_fees();

    // Complete the first milestone — should deduct platform fee
    escrow.complete_milestone(&client, &job_id, &0u32);

    let post_balance = token_client.balance(&freelancer);
    let post_fees = escrow.get_fees();

    let expected_fee = 50_0000000i128 * PLATFORM_FEE_BPS as i128 / 10000;
    let expected_payout = 50_0000000i128 - expected_fee;

    assert_eq!(post_balance - pre_balance, expected_payout);
    assert_eq!(post_fees - pre_fees, expected_fee);

    let stored = escrow.get_milestones(&job_id);
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
    let job_id = escrow.post_job(&client, &100_0000000i128, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
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

    let job_id = escrow.post_job_with_sla(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env), &sla_config);
    assert_eq!(job_id, 1);

    let status = escrow.get_sla_status(&job_id);
    assert!(status.has_config);
    assert_eq!(status.response_time_ledgers, sla_config.response_time_ledgers);
    assert_eq!(status.delivery_time_ledgers, sla_config.delivery_time_ledgers);
    assert_eq!(status.penalty_bps, sla_config.penalty_bps);
    assert_eq!(status.auto_escalate, sla_config.auto_escalate);
    assert_eq!(status.accepted_at, 0);
    assert!(!status.breached);
    assert!(!status.penalty_applied);
}

#[test]
fn test_sla_get_sla_status_returns_correct_values() {
    let env = Env::default();
    env.ledger().set_sequence_number(1);
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

    let job_id = escrow.post_job_with_sla(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env), &sla_config);
    let status_before = escrow.get_sla_status(&job_id);
    assert_eq!(status_before.accepted_at, 0);

    escrow.accept_job(&freelancer, &job_id);
    let status_after_accept = escrow.get_sla_status(&job_id);
    assert!(status_after_accept.accepted_at > 0);
    assert!(status_after_accept.has_config);
    assert_eq!(status_after_accept.response_time_ledgers, sla_config.response_time_ledgers);
    assert_eq!(status_after_accept.delivery_time_ledgers, sla_config.delivery_time_ledgers);
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
    env.ledger().set_sequence_number(1);
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

    let job_id = escrow.post_job_with_sla(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env), &sla_config);
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
    env.ledger().set_sequence_number(1);
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

    let job_id = escrow.post_job_with_sla(&client, &amount, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env), &sla_config);
    escrow.accept_job(&freelancer, &job_id);

    let current = env.ledger().sequence();
    env.ledger().set_sequence_number(current + 30);

    let pre_events = env.events().all().len();
    escrow.submit_work(&freelancer, &job_id);
    let post_events = env.events().all().len();

    assert!(post_events > pre_events, "SLA breach should emit an event");
}

#[test]
fn test_get_client_jobs_returns_correct_ids() {
    let env = Env::default();
    let (_admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;

    // 1. Verify initially empty
    let initial_jobs = escrow.get_client_jobs(&client);
    assert_eq!(initial_jobs.len(), 0);

    // 2. Post two jobs
    let id1 = escrow.post_job(
        &client,
        &100_0000000i128,
        &desc_hash,
        &100u32,
        &deadline,
        &token,
        &dummy_title(&env),
        &dummy_category(&env),
    );
    let id2 = escrow.post_job(
        &client,
        &200_0000000i128,
        &desc_hash,
        &100u32,
        &deadline,
        &token,
        &dummy_title(&env),
        &dummy_category(&env),
    );

    // 3. Verify indexed jobs match posted job IDs
    let client_jobs = escrow.get_client_jobs(&client);
    assert_eq!(client_jobs.len(), 2);
    assert_eq!(client_jobs.get(0).unwrap(), id1);
    assert_eq!(client_jobs.get(1).unwrap(), id2);
fn test_discount_tiers_and_high_volume_fee() {
    let env = Env::default();
    let (admin, client, freelancer, _token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);

    // 1. Initial effective fee without completed jobs or configured tiers (e.g. 250 bps = 2.5%)
    let initial_fee = escrow.calculate_effective_fee_bps(&freelancer);
    assert_eq!(initial_fee, 250);

    // 2. Admin configures discount tiers (e.g. 5 jobs completed = 50 bps discount)
    let tiers = vec![
        &env,
        DiscountTier {
            min_completed_jobs: 5,
            discount_bps: 50,
        },
        DiscountTier {
            min_completed_jobs: 10,
            discount_bps: 100,
        },
    ];
    escrow.set_discount_tiers(&admin, &tiers);

    // 3. User initial completed job count is zero
    assert_eq!(escrow.get_user_completed_jobs(&freelancer), 0);

    // 4. Verify effective fee drops when completed jobs threshold is reached (250 - 50 = 200 bps = 2.0%)
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::UserCompletedJobs(freelancer.clone()), &5u32);
    });

    let discounted_fee = escrow.calculate_effective_fee_bps(&freelancer);
    assert_eq!(discounted_fee, 200);
}

#[test]
fn test_get_freelancer_jobs() {
    let env = Env::default();
    let (_admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;

    // No jobs initially
    let initial_jobs = escrow.get_freelancer_jobs(&freelancer);
    assert_eq!(initial_jobs.len(), 0);

    // Post and accept first job
    let job_id_1 = escrow.post_job(&client, &100_0000000i128, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
    escrow.accept_job(&freelancer, &job_id_1);
    let jobs_after_one = escrow.get_freelancer_jobs(&freelancer);
    assert_eq!(jobs_after_one.len(), 1);
    assert_eq!(jobs_after_one.get(0).unwrap(), job_id_1);

    // Post and accept second job
    let job_id_2 = escrow.post_job(&client, &200_0000000i128, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
    escrow.accept_job(&freelancer, &job_id_2);
    let jobs_after_two = escrow.get_freelancer_jobs(&freelancer);
    assert_eq!(jobs_after_two.len(), 2);
    assert_eq!(jobs_after_two.get(0).unwrap(), job_id_1);
    assert_eq!(jobs_after_two.get(1).unwrap(), job_id_2);

    // Different freelancer should have empty jobs
    let other_freelancer = Address::generate(&env);
    let other_jobs = escrow.get_freelancer_jobs(&other_freelancer);
    assert_eq!(other_jobs.len(), 0);
}

#[test]
fn test_get_job_status_counts() {
    let env = Env::default();
    let (admin, client, freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;

    // Empty state
    let counts = escrow.get_job_status_counts();
    assert_eq!(counts.total, 0);
    assert_eq!(counts.open, 0);

    // One Open job
    let job1 = escrow.post_job(&client, &100_0000000i128, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
    let counts = escrow.get_job_status_counts();
    assert_eq!(counts.total, 1);
    assert_eq!(counts.open, 1);
    assert_eq!(counts.in_progress, 0);

    // Accept → InProgress
    escrow.accept_job(&freelancer, &job1);
    let counts = escrow.get_job_status_counts();
    assert_eq!(counts.total, 1);
    assert_eq!(counts.open, 0);
    assert_eq!(counts.in_progress, 1);

    // Submit → SubmittedForReview
    escrow.submit_work(&freelancer, &job1);
    let counts = escrow.get_job_status_counts();
    assert_eq!(counts.submitted_for_review, 1);

    // Second job: Open → Cancelled
    let job2 = escrow.post_job(&client, &50_0000000i128, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
    escrow.cancel_job(&client, &job2);
    let counts = escrow.get_job_status_counts();
    assert_eq!(counts.total, 2);
    assert_eq!(counts.submitted_for_review, 1);
    assert_eq!(counts.cancelled, 1);

    // Third job: Open → Disputed via accept+raise
    let job3 = escrow.post_job(&client, &75_0000000i128, &desc_hash, &100u32, &deadline, &token, &dummy_title(&env), &dummy_category(&env));
    escrow.accept_job(&freelancer, &job3);
    escrow.raise_dispute(&client, &job3);
    let counts = escrow.get_job_status_counts();
    assert_eq!(counts.total, 3);
    assert_eq!(counts.disputed, 1);
}

#[test]
fn test_job_initial_version_is_one() {
    let env = Env::default();
    let (_admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;

    let job_id = escrow.post_job(
        &client,
        &100_0000000i128,
        &desc_hash,
        &100u32,
        &deadline,
        &token,
        &dummy_title(&env),
        &dummy_category(&env),
    );
    assert_eq!(escrow.get_job_version(&job_id), 1);
    let job = escrow.get_job(&job_id);
    assert_eq!(job.version, 1);
}

#[test]
fn test_migrate_job_version_success() {
    let env = Env::default();
    let (admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;

    let job_id = escrow.post_job(
        &client,
        &100_0000000i128,
        &desc_hash,
        &100u32,
        &deadline,
        &token,
        &dummy_title(&env),
        &dummy_category(&env),
    );

    // Client migrates version to 2
    let new_ver = escrow.migrate_job_version(&client, &job_id, &2u32);
    assert_eq!(new_ver, 2);
    assert_eq!(escrow.get_job_version(&job_id), 2);
    let job = escrow.get_job(&job_id);
    assert_eq!(job.version, 2);

    // Admin migrates version to 3
    let admin_ver = escrow.migrate_job_version(&admin, &job_id, &3u32);
    assert_eq!(admin_ver, 3);
    assert_eq!(escrow.get_job_version(&job_id), 3);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_migrate_job_version_rejects_unauthorized() {
    let env = Env::default();
    let (_admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);
    let desc_hash = BytesN::from_array(&env, &[0u8; 32]);
    let deadline: u64 = 1000;
    let stranger = Address::generate(&env);

    let job_id = escrow.post_job(
        &client,
        &100_0000000i128,
        &desc_hash,
        &100u32,
        &deadline,
        &token,
        &dummy_title(&env),
        &dummy_category(&env),
    );

    escrow.migrate_job_version(&stranger, &job_id, &2u32);
}

// ── Issue #439: min/max job duration limits ───────────────────────────────────

#[test]
fn test_get_set_min_job_duration() {
    let env = Env::default();
    let (_admin, _client, _freelancer, _token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);

    // Default: 0 = no restriction
    assert_eq!(escrow.get_min_job_duration(), 0);

    escrow.set_min_job_duration(&MIN_JOB_DURATION_LEDGERS);
    assert_eq!(escrow.get_min_job_duration(), MIN_JOB_DURATION_LEDGERS);
}

#[test]
fn test_get_set_max_job_duration() {
    let env = Env::default();
    let (_admin, _client, _freelancer, _token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);

    // Default: 0 = no restriction
    assert_eq!(escrow.get_max_job_duration(), 0);

    escrow.set_max_job_duration(&MAX_JOB_DURATION_LEDGERS);
    assert_eq!(escrow.get_max_job_duration(), MAX_JOB_DURATION_LEDGERS);
}

#[test]
#[should_panic]
fn test_post_job_below_min_duration_panics() {
    let env = Env::default();
    let (_admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);

    // Set min to 720 ledgers (~1 hour)
    escrow.set_min_job_duration(&720u64);

    // deadline = 100, ledger = 0 → duration 100 < 720 → panic
    escrow.post_job(
        &client,
        &100_0000000i128,
        &BytesN::from_array(&env, &[0u8; 32]),
        &100u32,
        &100u64,
        &token,
        &dummy_title(&env),
        &dummy_category(&env),
    );
}

#[test]
#[should_panic]
fn test_post_job_above_max_duration_panics() {
    let env = Env::default();
    let (_admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);

    // Cap at 1000 ledgers
    escrow.set_max_job_duration(&1000u64);

    // deadline = 5000, ledger = 0 → duration 5000 > 1000 → panic
    escrow.post_job(
        &client,
        &100_0000000i128,
        &BytesN::from_array(&env, &[0u8; 32]),
        &100u32,
        &5000u64,
        &token,
        &dummy_title(&env),
        &dummy_category(&env),
    );
}

#[test]
fn test_post_job_valid_duration_within_bounds() {
    let env = Env::default();
    let (_admin, client, _freelancer, token, contract_id) = setup_test(&env);
    let escrow = new_escrow(&env, &contract_id);

    escrow.set_min_job_duration(&720u64);
    escrow.set_max_job_duration(&6_307_200u64);

    // deadline = 1000, ledger = 0 → duration 1000 — within [720, 6_307_200]
    let job_id = escrow.post_job(
        &client,
        &100_0000000i128,
        &BytesN::from_array(&env, &[0u8; 32]),
        &100u32,
        &1000u64,
        &token,
        &dummy_title(&env),
        &dummy_category(&env),
    );
    assert_eq!(job_id, 1);
}
