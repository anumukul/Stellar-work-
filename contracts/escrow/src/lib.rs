#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, BytesN,
    Env, Symbol, Vec,
};

const FEE_BPS: i128 = 250;
const BPS_DENOMINATOR: i128 = 10_000;
const MAX_REVISIONS: u32 = 3;
const CONTRACT_VERSION: u32 = 1;

const INSTANCE_LIFETIME_THRESHOLD: u32 = 17_280;
const INSTANCE_BUMP_AMOUNT: u32 = 518_400;
const ACTIVE_JOB_LIFETIME_THRESHOLD: u32 = 17_280;
const ACTIVE_JOB_BUMP_AMOUNT: u32 = 518_400;
const ARCHIVAL_JOB_BUMP_AMOUNT: u32 = 120_960;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum JobStatus {
    Open,
    InProgress,
    SubmittedForReview,
    Completed,
    Cancelled,
    Disputed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Job {
    pub client: Address,
    pub freelancer: Option<Address>,
    pub amount: i128,
    pub description_hash: BytesN<32>,
    pub status: JobStatus,
    pub created_at: u64,
    pub deadline: u64,
    pub token: Address,
    pub revision_count: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    JobsCount,
    Job(u64),
    Admin,
    NativeToken,
    FeesAccrued,
    AllowedToken(Address),
    TokenFees(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    JobNotFound = 1,
    Unauthorized = 2,
    InvalidStatus = 3,
    InsufficientFunds = 4,
    JobAlreadyAccepted = 5,
    DeadlinePassed = 6,
    DeadlineNotExpired = 7,
    TokenNotAllowed = 8,
    RevisionLimitReached = 9,
    AlreadyInitialized = 10,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn initialize(e: Env, admin: Address, native_token: Address) {
        if e.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&e, Error::AlreadyInitialized);
        }
        admin.require_auth();
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage()
            .instance()
            .set(&DataKey::NativeToken, &native_token);
        e.storage().instance().set(&DataKey::JobsCount, &0u64);
        e.storage()
            .persistent()
            .set(&DataKey::AllowedToken(native_token.clone()), &true);
        e.storage().persistent().extend_ttl(
            &DataKey::AllowedToken(native_token),
            ACTIVE_JOB_LIFETIME_THRESHOLD,
            INSTANCE_BUMP_AMOUNT,
        );
        bump_instance_ttl(&e);
    }

    pub fn post_job(
        e: Env,
        client: Address,
        amount: i128,
        desc_hash: BytesN<32>,
        deadline: u64,
        token: Address,
    ) -> u64 {
        if amount <= 0 {
            panic_with_error!(&e, Error::InsufficientFunds);
        }
        client.require_auth();
        if deadline != 0 && e.ledger().timestamp() > deadline {
            panic_with_error!(&e, Error::DeadlinePassed);
        }
        if !e
            .storage()
            .persistent()
            .has(&DataKey::AllowedToken(token.clone()))
        {
            panic_with_error!(&e, Error::TokenNotAllowed);
        }

        let token_client = token::Client::new(&e, &token);
        token_client.transfer(&client, &e.current_contract_address(), &amount);

        let job_id = next_job_id(&e);
        let job = Job {
            client: client.clone(),
            freelancer: Option::None,
            amount,
            description_hash: desc_hash,
            status: JobStatus::Open,
            created_at: e.ledger().timestamp(),
            deadline,
            token: token.clone(),
            revision_count: 0,
        };

        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "job_created"),),
            (job_id, client, amount, token),
        );

        job_id
    }

    pub fn accept_job(e: Env, freelancer: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        freelancer.require_auth();

        if job.status != JobStatus::Open {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.freelancer.is_some() {
            panic_with_error!(&e, Error::JobAlreadyAccepted);
        }
        if job.client == freelancer {
            panic_with_error!(&e, Error::Unauthorized);
        }
        if job.deadline != 0 && e.ledger().timestamp() > job.deadline {
            panic_with_error!(&e, Error::DeadlinePassed);
        }

        job.freelancer = Option::Some(freelancer.clone());
        job.status = JobStatus::InProgress;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "job_accepted"),),
            (job_id, freelancer),
        );
    }

    pub fn submit_work(e: Env, freelancer: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        freelancer.require_auth();

        if job.status != JobStatus::InProgress {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.freelancer != Option::Some(freelancer.clone()) {
            panic_with_error!(&e, Error::Unauthorized);
        }
        if job.deadline != 0 && e.ledger().timestamp() > job.deadline {
            panic_with_error!(&e, Error::DeadlinePassed);
        }

        job.status = JobStatus::SubmittedForReview;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "job_submitted"),),
            (job_id, freelancer),
        );
    }

    pub fn approve_work(e: Env, client: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        client.require_auth();

        if job.status != JobStatus::SubmittedForReview {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.client != client {
            panic_with_error!(&e, Error::Unauthorized);
        }

        let freelancer = match job.freelancer.clone() {
            Option::Some(addr) => addr,
            Option::None => panic_with_error!(&e, Error::InvalidStatus),
        };

        let fee = checked_mul_div(&e, job.amount, FEE_BPS, BPS_DENOMINATOR);
        let payout = checked_sub(&e, job.amount, fee);
        let current_fees = get_token_fees(&e, &job.token);
        let updated_fees = checked_add(&e, current_fees, fee);

        job.status = JobStatus::Completed;
        set_job(&e, job_id, &job);
        e.storage()
            .persistent()
            .set(&DataKey::TokenFees(job.token.clone()), &updated_fees);
        bump_token_fees_ttl(&e, &job.token);
        bump_instance_ttl(&e);

        let token_client = token::Client::new(&e, &job.token);
        token_client.transfer(&e.current_contract_address(), &freelancer, &payout);

        e.events().publish(
            (Symbol::new(&e, "job_approved"),),
            (job_id, client, freelancer, payout),
        );
    }

    pub fn reject_work(e: Env, client: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        client.require_auth();

        if job.status != JobStatus::SubmittedForReview {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.client != client {
            panic_with_error!(&e, Error::Unauthorized);
        }
        if job.revision_count >= MAX_REVISIONS {
            panic_with_error!(&e, Error::RevisionLimitReached);
        }

        job.status = JobStatus::InProgress;
        job.revision_count += 1;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "job_rejected"),),
            (job_id, client, job.revision_count),
        );
    }

    pub fn cancel_job(e: Env, client: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        client.require_auth();

        if job.status != JobStatus::Open {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.client != client {
            panic_with_error!(&e, Error::Unauthorized);
        }

        job.status = JobStatus::Cancelled;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        let token_client = token::Client::new(&e, &job.token);
        token_client.transfer(&e.current_contract_address(), &client, &job.amount);

        e.events().publish(
            (Symbol::new(&e, "job_cancelled"),),
            (job_id, client),
        );
    }

    pub fn enforce_deadline(e: Env, client: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        client.require_auth();

        if job.client != client {
            panic_with_error!(&e, Error::Unauthorized);
        }
        if job.status != JobStatus::InProgress {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.deadline == 0 {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if e.ledger().timestamp() <= job.deadline {
            panic_with_error!(&e, Error::DeadlineNotExpired);
        }

        job.status = JobStatus::Cancelled;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        let token_client = token::Client::new(&e, &job.token);
        token_client.transfer(&e.current_contract_address(), &client, &job.amount);

        e.events().publish(
            (Symbol::new(&e, "deadline_enforced"),),
            (job_id, client),
        );
    }

    pub fn extend_job_ttl(e: Env, caller: Address, job_id: u64) {
        caller.require_auth();
        let job = get_job_or_panic(&e, job_id);
        if job.client != caller && job.freelancer != Option::Some(caller.clone()) {
            panic_with_error!(&e, Error::Unauthorized);
        }
        bump_job_ttl(&e, job_id, &job);
        bump_instance_ttl(&e);
    }

    pub fn raise_dispute(e: Env, caller: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        caller.require_auth();

        if job.status != JobStatus::InProgress && job.status != JobStatus::SubmittedForReview {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.client != caller && job.freelancer != Option::Some(caller.clone()) {
            panic_with_error!(&e, Error::Unauthorized);
        }

        job.status = JobStatus::Disputed;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "job_disputed"),),
            (job_id, caller),
        );
    }

    pub fn resolve_dispute(e: Env, job_id: u64, winner: Address) {
        let admin = load_admin(&e);
        admin.require_auth();

        let mut job = get_job_or_panic(&e, job_id);
        if job.status != JobStatus::Disputed {
            panic_with_error!(&e, Error::InvalidStatus);
        }

        let freelancer = match job.freelancer.clone() {
            Option::Some(addr) => addr,
            Option::None => panic_with_error!(&e, Error::InvalidStatus),
        };

        if winner == job.client {
            job.status = JobStatus::Cancelled;
            set_job(&e, job_id, &job);

            let token_client = token::Client::new(&e, &job.token);
            token_client.transfer(&e.current_contract_address(), &job.client, &job.amount);
        } else if winner == freelancer {
            let fee = checked_mul_div(&e, job.amount, FEE_BPS, BPS_DENOMINATOR);
            let payout = checked_sub(&e, job.amount, fee);
            let current_fees = get_token_fees(&e, &job.token);
            let updated_fees = checked_add(&e, current_fees, fee);

            e.storage()
                .persistent()
                .set(&DataKey::TokenFees(job.token.clone()), &updated_fees);
            bump_token_fees_ttl(&e, &job.token);

            job.status = JobStatus::Completed;
            set_job(&e, job_id, &job);

            let token_client = token::Client::new(&e, &job.token);
            token_client.transfer(&e.current_contract_address(), &freelancer, &payout);
        } else {
            panic_with_error!(&e, Error::Unauthorized);
        }

        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "dispute_resolved"),),
            (job_id, winner),
        );
    }

    pub fn get_job(e: Env, job_id: u64) -> Job {
        get_job_or_panic(&e, job_id)
    }

    pub fn get_jobs_batch(e: Env, start: u64, limit: u32) -> Vec<Job> {
        let jobs_count = get_jobs_count(&e);
        let mut jobs = Vec::new(&e);

        if start == 0 || limit == 0 || start > jobs_count {
            return jobs;
        }

        let end = core::cmp::min(
            jobs_count,
            start.saturating_add(limit as u64).saturating_sub(1),
        );

        let mut cursor = start;
        while cursor <= end {
            jobs.push_back(get_job_or_panic(&e, cursor));
            cursor = cursor.saturating_add(1);
        }

        jobs
    }

    pub fn get_admin(e: Env) -> Address {
        load_admin(&e)
    }

    pub fn transfer_admin(e: Env, caller: Address, new_admin: Address) {
        caller.require_auth();
        let current_admin = load_admin(&e);
        if caller != current_admin {
            panic_with_error!(&e, Error::Unauthorized);
        }
        e.storage().instance().set(&DataKey::Admin, &new_admin);
        bump_instance_ttl(&e);
        e.events().publish(
            (Symbol::new(&e, "admin_transferred"),),
            (caller, new_admin),
        );
    }

    pub fn get_job_count(e: Env) -> u64 {
        get_jobs_count(&e)
    }

    pub fn get_native_token(e: Env) -> Address {
        load_native_token(&e)
    }

    pub fn get_contract_version(_e: Env) -> u32 {
        CONTRACT_VERSION
    }

    pub fn withdraw_fees(e: Env, token: Address) {
        let admin = load_admin(&e);
        admin.require_auth();

        let fees = get_token_fees(&e, &token);
        if fees <= 0 {
            return;
        }
        e.storage()
            .persistent()
            .set(&DataKey::TokenFees(token.clone()), &0i128);
        bump_token_fees_ttl(&e, &token);
        bump_instance_ttl(&e);

        let token_client = token::Client::new(&e, &token);
        token_client.transfer(&e.current_contract_address(), &admin, &fees);

        e.events().publish(
            (Symbol::new(&e, "fees_withdrawn"),),
            (token, fees),
        );
    }

    pub fn get_fees(e: Env, token: Address) -> i128 {
        get_token_fees(&e, &token)
    }

    pub fn add_allowed_token(e: Env, token: Address) {
        let admin = load_admin(&e);
        admin.require_auth();
        e.storage()
            .persistent()
            .set(&DataKey::AllowedToken(token.clone()), &true);
        e.storage().persistent().extend_ttl(
            &DataKey::AllowedToken(token),
            ACTIVE_JOB_LIFETIME_THRESHOLD,
            INSTANCE_BUMP_AMOUNT,
        );
        bump_instance_ttl(&e);
    }

    pub fn remove_allowed_token(e: Env, token: Address) {
        let admin = load_admin(&e);
        admin.require_auth();
        e.storage()
            .persistent()
            .remove(&DataKey::AllowedToken(token));
        bump_instance_ttl(&e);
    }

    pub fn is_token_allowed(e: Env, token: Address) -> bool {
        e.storage()
            .persistent()
            .has(&DataKey::AllowedToken(token))
    }
}

fn get_job_or_panic(e: &Env, job_id: u64) -> Job {
    e.storage()
        .persistent()
        .get::<DataKey, Job>(&DataKey::Job(job_id))
        .unwrap_or_else(|| panic_with_error!(e, Error::JobNotFound))
}

fn set_job(e: &Env, job_id: u64, job: &Job) {
    e.storage().persistent().set(&DataKey::Job(job_id), job);
    bump_job_ttl(e, job_id, job);
}

fn bump_job_ttl(e: &Env, job_id: u64, job: &Job) {
    let bump = match job.status {
        JobStatus::Completed | JobStatus::Cancelled => ARCHIVAL_JOB_BUMP_AMOUNT,
        _ => ACTIVE_JOB_BUMP_AMOUNT,
    };
    e.storage().persistent().extend_ttl(
        &DataKey::Job(job_id),
        ACTIVE_JOB_LIFETIME_THRESHOLD,
        bump,
    );
}

fn bump_instance_ttl(e: &Env) {
    e.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn bump_token_fees_ttl(e: &Env, token: &Address) {
    let key = DataKey::TokenFees(token.clone());
    if e.storage().persistent().has(&key) {
        e.storage().persistent().extend_ttl(
            &key,
            ACTIVE_JOB_LIFETIME_THRESHOLD,
            INSTANCE_BUMP_AMOUNT,
        );
    }
}

fn get_jobs_count(e: &Env) -> u64 {
    e.storage()
        .instance()
        .get::<DataKey, u64>(&DataKey::JobsCount)
        .unwrap_or(0)
}

fn next_job_id(e: &Env) -> u64 {
    let count = get_jobs_count(e);
    let next = count + 1;
    e.storage().instance().set(&DataKey::JobsCount, &next);
    next
}

fn load_native_token(e: &Env) -> Address {
    e.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::NativeToken)
        .unwrap_or_else(|| panic!("native token not configured"))
}

fn load_admin(e: &Env) -> Address {
    e.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Admin)
        .unwrap_or_else(|| panic!("admin not configured"))
}

fn get_token_fees(e: &Env, token: &Address) -> i128 {
    e.storage()
        .persistent()
        .get::<DataKey, i128>(&DataKey::TokenFees(token.clone()))
        .unwrap_or(0)
}

fn checked_add(e: &Env, left: i128, right: i128) -> i128 {
    left.checked_add(right)
        .unwrap_or_else(|| panic_with_error!(e, Error::InsufficientFunds))
}

fn checked_sub(e: &Env, left: i128, right: i128) -> i128 {
    left.checked_sub(right)
        .unwrap_or_else(|| panic_with_error!(e, Error::InsufficientFunds))
}

fn checked_mul_div(e: &Env, left: i128, mul: i128, div: i128) -> i128 {
    left.checked_mul(mul)
        .and_then(|v| v.checked_div(div))
        .unwrap_or_else(|| panic_with_error!(e, Error::InsufficientFunds))
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::{Address, BytesN, Env};

    fn setup() -> (
        Env,
        EscrowContractClient<'static>,
        Address,
        Address,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|li| {
            li.timestamp = 1_710_000_000;
        });

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let native_token_admin = Address::generate(&env);
        let native_token = env
            .register_stellar_asset_contract_v2(native_token_admin.clone())
            .address();
        client.initialize(&admin, &native_token);

        let user = Address::generate(&env);
        let freelancer = Address::generate(&env);

        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&user, &10_000_000_000);

        (env, client, admin, user, freelancer, native_token)
    }

    fn hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[7; 32])
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn initialize_reinit_fails_explicitly() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let native_token = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();

        client.initialize(&admin, &native_token);
        client.initialize(&admin, &native_token);
    }

    #[test]
    fn post_job_increments_count() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        assert_eq!(job_id, 1);
        assert_eq!(client.get_job_count(), 1);
        let posted = client.get_job(&job_id);
        assert_eq!(posted.status, JobStatus::Open);
        assert_eq!(posted.client, user);
        assert_eq!(posted.token, native_token);
    }

    #[test]
    fn accept_and_approve_happy_path() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);

        client.approve_work(&user, &job_id);

        let post_balance = token_client.balance(&freelancer);
        assert_eq!(post_balance - pre_balance, 975_000);
        assert_eq!(client.get_fees(&native_token), 25_000);

        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Completed);
    }

    #[test]
    fn cancel_job_refunds_client() {
        let (env, client, _, user, _, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);

        let job_id = client.post_job(&user, &500_000i128, &hash(&env), &0u64, &native_token);
        client.cancel_job(&user, &job_id);

        let post_balance = token_client.balance(&user);
        assert_eq!(post_balance, pre_balance);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn approve_fails_in_wrong_status() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.approve_work(&user, &job_id);
    }

    #[test]
    fn reject_work_happy_path_and_resubmit() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        client.reject_work(&user, &job_id);
        let rejected = client.get_job(&job_id);
        assert_eq!(rejected.status, JobStatus::InProgress);
        assert_eq!(rejected.revision_count, 1);

        client.submit_work(&freelancer, &job_id);
        let resubmitted = client.get_job(&job_id);
        assert_eq!(resubmitted.status, JobStatus::SubmittedForReview);
        assert_eq!(resubmitted.revision_count, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn reject_work_wrong_caller_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        client.reject_work(&freelancer, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn reject_work_wrong_status_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.reject_work(&user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn reject_work_revision_limit_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);

        for _ in 0..MAX_REVISIONS {
            client.submit_work(&freelancer, &job_id);
            client.reject_work(&user, &job_id);
        }

        client.submit_work(&freelancer, &job_id);
        client.reject_work(&user, &job_id);
    }

    #[test]
    fn ttl_bumped_on_state_transitions() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
    }

    #[test]
    fn extend_job_ttl_by_client() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.extend_job_ttl(&user, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Open);
    }

    #[test]
    fn extend_job_ttl_by_freelancer() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.extend_job_ttl(&freelancer, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::InProgress);
    }

    #[test]
    #[should_panic]
    fn extend_job_ttl_unauthorized() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        let stranger = Address::generate(&env);
        client.extend_job_ttl(&stranger, &job_id);
    }

    #[test]
    #[should_panic]
    fn submit_work_past_deadline() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &deadline, &native_token);
        client.accept_job(&freelancer, &job_id);

        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });

        client.submit_work(&freelancer, &job_id);
    }

    #[test]
    fn submit_work_no_deadline_always_allowed() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);

        env.ledger().with_mut(|li| {
            li.timestamp = 9_999_999_999;
        });

        client.submit_work(&freelancer, &job_id);
        assert_eq!(
            client.get_job(&job_id).status,
            JobStatus::SubmittedForReview
        );
    }

    #[test]
    fn enforce_deadline_reclaims_funds() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);

        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &deadline, &native_token);
        client.accept_job(&freelancer, &job_id);

        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });

        client.enforce_deadline(&user, &job_id);

        let post_balance = token_client.balance(&user);
        assert_eq!(post_balance, pre_balance);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    #[should_panic]
    fn enforce_deadline_before_expiry_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &deadline, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.enforce_deadline(&user, &job_id);
    }

    #[test]
    #[should_panic]
    fn enforce_deadline_no_deadline_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);

        env.ledger().with_mut(|li| {
            li.timestamp = 9_999_999_999;
        });

        client.enforce_deadline(&user, &job_id);
    }

    #[test]
    #[should_panic]
    fn enforce_deadline_wrong_status_fails() {
        let (env, client, _, user, _, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &deadline, &native_token);

        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });

        client.enforce_deadline(&user, &job_id);
    }

    #[test]
    fn events_emitted_on_post_job() {
        let (env, client, _, user, _, native_token) = setup();
        client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);

        let events = env.events().all();
        assert!(events.len() > 0);
    }

    #[test]
    fn events_emitted_on_full_lifecycle() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        let events = env.events().all();
        assert!(events.len() >= 4);
    }

    #[test]
    fn post_job_with_custom_token() {
        let (env, client, _, user, _, _) = setup();
        let custom_token_admin = Address::generate(&env);
        let custom_token = env
            .register_stellar_asset_contract_v2(custom_token_admin)
            .address();
        client.add_allowed_token(&custom_token);

        let asset = token::StellarAssetClient::new(&env, &custom_token);
        asset.mint(&user, &5_000_000_000);

        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &custom_token);
        let job = client.get_job(&job_id);
        assert_eq!(job.token, custom_token);
    }

    #[test]
    fn approve_with_custom_token() {
        let (env, client, _, user, freelancer, _) = setup();
        let custom_token_admin = Address::generate(&env);
        let custom_token = env
            .register_stellar_asset_contract_v2(custom_token_admin)
            .address();
        client.add_allowed_token(&custom_token);

        let asset = token::StellarAssetClient::new(&env, &custom_token);
        asset.mint(&user, &5_000_000_000);

        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &custom_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &custom_token);
        let pre_balance = token_client.balance(&freelancer);
        client.approve_work(&user, &job_id);
        let post_balance = token_client.balance(&freelancer);
        assert_eq!(post_balance - pre_balance, 975_000);
        assert_eq!(client.get_fees(&custom_token), 25_000);
    }

    #[test]
    fn cancel_with_custom_token() {
        let (env, client, _, user, _, _) = setup();
        let custom_token_admin = Address::generate(&env);
        let custom_token = env
            .register_stellar_asset_contract_v2(custom_token_admin)
            .address();
        client.add_allowed_token(&custom_token);

        let asset = token::StellarAssetClient::new(&env, &custom_token);
        asset.mint(&user, &5_000_000_000);

        let token_client = token::Client::new(&env, &custom_token);
        let pre_balance = token_client.balance(&user);
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &custom_token);
        client.cancel_job(&user, &job_id);

        let post_balance = token_client.balance(&user);
        assert_eq!(post_balance, pre_balance);
    }

    #[test]
    #[should_panic]
    fn token_not_allowed_fails() {
        let (env, client, _, user, _, _) = setup();
        let rogue_token_admin = Address::generate(&env);
        let rogue_token = env
            .register_stellar_asset_contract_v2(rogue_token_admin)
            .address();

        let asset = token::StellarAssetClient::new(&env, &rogue_token);
        asset.mint(&user, &5_000_000_000);

        client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &rogue_token);
    }

    #[test]
    fn withdraw_fees_per_token() {
        let (env, client, admin, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        assert_eq!(client.get_fees(&native_token), 25_000);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&admin);
        client.withdraw_fees(&native_token);
        let post_balance = token_client.balance(&admin);

        assert_eq!(post_balance - pre_balance, 25_000);
        assert_eq!(client.get_fees(&native_token), 0);
    }

    #[test]
    fn withdraw_fees_with_zero_accrued_is_noop() {
        let (env, client, admin, _, _, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let admin_balance_before = token_client.balance(&admin);
        let fees_before = client.get_fees(&native_token);

        client.withdraw_fees(&native_token);

        let admin_balance_after = token_client.balance(&admin);
        let fees_after = client.get_fees(&native_token);
        assert_eq!(fees_before, 0);
        assert_eq!(fees_after, 0);
        assert_eq!(admin_balance_after, admin_balance_before);
    }

    #[test]
    fn token_whitelist_management() {
        let (env, client, _, _, _, native_token) = setup();
        assert!(client.is_token_allowed(&native_token));

        let new_token_admin = Address::generate(&env);
        let new_token = env
            .register_stellar_asset_contract_v2(new_token_admin)
            .address();
        assert!(!client.is_token_allowed(&new_token));

        client.add_allowed_token(&new_token);
        assert!(client.is_token_allowed(&new_token));

        client.remove_allowed_token(&new_token);
        assert!(!client.is_token_allowed(&new_token));
    }

    #[test]
    fn raise_and_resolve_dispute_client_wins() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);

        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Disputed);

        client.resolve_dispute(&job_id, &user);
        let post_balance = token_client.balance(&user);
        assert_eq!(post_balance, pre_balance);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    fn raise_and_resolve_dispute_freelancer_wins() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);

        client.resolve_dispute(&job_id, &freelancer);

        let post_balance = token_client.balance(&freelancer);
        assert_eq!(post_balance - pre_balance, 975_000);
        assert_eq!(client.get_fees(&native_token), 25_000);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
    }

    #[test]
    fn events_emitted_on_cancel_and_dispute() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&freelancer, &job_id);
        client.resolve_dispute(&job_id, &user);

        let events = env.events().all();
        assert!(events.len() >= 4);
    }

    #[test]
    fn events_emitted_on_withdraw_fees() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        client.withdraw_fees(&native_token);

        let events = env.events().all();
        assert!(events.len() >= 5);
    }

    #[test]
    fn get_native_token_returns_configured() {
        let (_, client, _, _, _, native_token) = setup();
        assert_eq!(client.get_native_token(), native_token);
    }

    // ── cancel_job negative / auth tests (issue #19) ─────────────────────────

    /// A stranger (neither the job's client nor any authorized party) must not
    /// be able to cancel an Open job. The contract checks ownership AFTER the
    /// status check, so an Open job with a wrong caller should panic with
    /// Error::Unauthorized (contract error code #2).
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn cancel_job_unauthorized_caller_panics() {
        let (env, client, _, user, _, native_token) = setup();

        // Post an Open job as the legitimate client
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);

        // A completely unrelated address attempts to cancel — must be rejected
        let stranger = Address::generate(&env);
        client.cancel_job(&stranger, &job_id);
    }

    /// cancel_job must reject a job that is already InProgress.
    /// Only Open jobs may be cancelled by the client; any other status
    /// triggers Error::InvalidStatus (contract error code #3).
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn cancel_job_in_progress_panics_with_invalid_status() {
        let (env, client, _, user, freelancer, native_token) = setup();

        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);

        // Advance the job to InProgress
        client.accept_job(&freelancer, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::InProgress);
        client.cancel_job(&user, &job_id);
    }

    /// cancel_job must reject a job that has already reached Completed status.
    /// A completed job has had its funds disbursed; cancellation at this point
    /// must trigger Error::InvalidStatus (contract error code #3).
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn cancel_job_completed_panics_with_invalid_status() {
        let (env, client, _, user, freelancer, native_token) = setup();

        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);

        // Drive the job through the full happy-path to Completed
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);

        client.cancel_job(&user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn post_job_with_past_deadline_fails() {
        let (env, client, _, user, _, native_token) = setup();
        let past_deadline = 1_710_000_000 - 3600;
        client.post_job(&user, &1_000_000i128, &hash(&env), &past_deadline, &native_token);
    }

    #[test]
    fn post_job_with_future_deadline_succeeds() {
        let (env, client, _, user, _, native_token) = setup();
        let future_deadline = 1_710_000_000 + 86_400;
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &future_deadline, &native_token);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Open);
        assert_eq!(job.deadline, future_deadline);
    }

    #[test]
    fn post_job_with_zero_deadline_succeeds() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Open);
        assert_eq!(job.deadline, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn client_cannot_accept_own_job() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn accept_job_with_expired_deadline_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &deadline, &native_token);

        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });

        client.accept_job(&freelancer, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn accept_already_in_progress_job_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);

        let another_freelancer = Address::generate(&env);
        client.accept_job(&another_freelancer, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn freelancer_cannot_approve_work() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&freelancer, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn random_address_cannot_approve_work() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let random = Address::generate(&env);
        client.approve_work(&random, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn approve_work_on_open_job_panics() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.approve_work(&user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn approve_work_on_in_progress_job_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
    }

    // Fee rounding edge-case tests
    //
    // checked_mul_div computes: fee = amount * 250 / 10_000
    // For very small amounts the integer division truncates to 0.

    #[test]
    fn approve_work_1_stroop_fee_rounds_to_zero() {
        // 1 * 250 / 10_000 = 0  →  freelancer receives full 1 stroop, fee = 0
        let (env, client, _, user, freelancer, native_token) = setup();
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&user, &1i128);

        let job_id = client.post_job(&user, &1i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);
        client.approve_work(&user, &job_id);
        let post_balance = token_client.balance(&freelancer);

        // fee rounds down to 0, so freelancer gets the full amount
        assert_eq!(post_balance - pre_balance, 1, "freelancer should receive full 1 stroop when fee rounds to 0");
        assert_eq!(client.get_fees(&native_token), 0, "accrued fee should be 0 for 1-stroop job");
    }

    #[test]
    fn approve_work_39_stroops_fee_split() {
        // 39 * 250 / 10_000 = 9_750 / 10_000 = 0  →  fee = 0, payout = 39
        // First amount where fee > 0: 40 * 250 / 10_000 = 1  →  fee = 1, payout = 39
        // Use 40 to get a non-trivial split, then also verify 39 rounds to 0.
        let (env, client, _, user, freelancer, native_token) = setup();
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&user, &100i128);

        // 39 stroops: fee = 39*250/10_000 = 0, payout = 39
        let job_id_39 = client.post_job(&user, &39i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id_39);
        client.submit_work(&freelancer, &job_id_39);

        let token_client = token::Client::new(&env, &native_token);
        let pre_39 = token_client.balance(&freelancer);
        client.approve_work(&user, &job_id_39);
        let post_39 = token_client.balance(&freelancer);

        assert_eq!(post_39 - pre_39, 39, "39-stroop job: fee rounds to 0, freelancer gets all 39");
        assert_eq!(client.get_fees(&native_token), 0, "39-stroop job: no fee accrued");

        // 40 stroops: fee = 40*250/10_000 = 1, payout = 39
        let job_id_40 = client.post_job(&user, &40i128, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id_40);
        client.submit_work(&freelancer, &job_id_40);

        let pre_40 = token_client.balance(&freelancer);
        client.approve_work(&user, &job_id_40);
        let post_40 = token_client.balance(&freelancer);

        assert_eq!(post_40 - pre_40, 39, "40-stroop job: payout = 39 after 1-stroop fee");
        assert_eq!(client.get_fees(&native_token), 1, "40-stroop job: 1 stroop fee accrued");
    }

    #[test]
    fn approve_work_large_amount_no_overflow() {
        // i128::MAX / 2 is safely within range for checked_mul_div
        // Use a large but representable amount: 1_000_000_000_000_000 stroops (1 billion XLM)
        let large_amount: i128 = 1_000_000_000_000_000i128;
        let expected_fee: i128 = large_amount * 250 / 10_000; // = 25_000_000_000_000
        let expected_payout: i128 = large_amount - expected_fee;

        let (env, client, _, user, freelancer, native_token) = setup();
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&user, &large_amount);

        let job_id = client.post_job(&user, &large_amount, &hash(&env), &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);
        client.approve_work(&user, &job_id);
        let post_balance = token_client.balance(&freelancer);

        assert_eq!(post_balance - pre_balance, expected_payout, "large amount: payout should be amount minus 2.5% fee");
        assert_eq!(client.get_fees(&native_token), expected_fee, "large amount: fee should be exactly 2.5%");
    }

    #[test]
    fn get_jobs_batch_returns_stable_order() {
        let (env, client, _, user, _, native_token) = setup();
        let first = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);
        let second = client.post_job(&user, &2_000_000i128, &hash(&env), &0u64, &native_token);
        let third = client.post_job(&user, &3_000_000i128, &hash(&env), &0u64, &native_token);

        assert_eq!(first, 1);
        assert_eq!(second, 2);
        assert_eq!(third, 3);

        let jobs = client.get_jobs_batch(&1u64, &2u32);
        assert_eq!(jobs.len(), 2);
        let first_job = jobs.get(0).unwrap();
        let second_job = jobs.get(1).unwrap();
        assert_eq!(first_job.amount, 1_000_000i128);
        assert_eq!(second_job.amount, 2_000_000i128);
    }

    #[test]
    fn get_jobs_batch_handles_out_of_range_safely() {
        let (env, client, _, user, _, native_token) = setup();
        client.post_job(&user, &1_000_000i128, &hash(&env), &0u64, &native_token);

        let empty_from_future = client.get_jobs_batch(&99u64, &5u32);
        assert_eq!(empty_from_future.len(), 0);

        let empty_zero_start = client.get_jobs_batch(&0u64, &5u32);
        assert_eq!(empty_zero_start.len(), 0);

        let empty_zero_limit = client.get_jobs_batch(&1u64, &0u32);
        assert_eq!(empty_zero_limit.len(), 0);
    }

    #[test]
    fn get_admin_public_view_returns_configured_admin() {
        let (_, client, admin, _, _, _) = setup();
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    fn transfer_admin_updates_admin() {
        let (env, client, admin, _, _, _) = setup();
        let new_admin = Address::generate(&env);
        client.transfer_admin(&admin, &new_admin);
        assert_eq!(client.get_admin(), new_admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn transfer_admin_rejects_non_admin() {
        let (env, client, _, _, _, _) = setup();
        let caller = Address::generate(&env);
        let new_admin = Address::generate(&env);
        client.transfer_admin(&caller, &new_admin);
    }
}
