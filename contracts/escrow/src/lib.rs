#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, BytesN,
    Env,
};

const FEE_BPS: i128 = 250;
const BPS_DENOMINATOR: i128 = 10_000;

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
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    JobsCount,
    Job(u64),
    Admin,
    NativeToken,
    FeesAccrued,
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
    AlreadyInitialized = 7,
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
        e.storage().instance().set(&DataKey::NativeToken, &native_token);
        e.storage().instance().set(&DataKey::JobsCount, &0u64);
        e.storage().instance().set(&DataKey::FeesAccrued, &0i128);
    }

    pub fn post_job(e: Env, client: Address, amount: i128, desc_hash: BytesN<32>, deadline: u64) -> u64 {
        if amount <= 0 {
            panic_with_error!(&e, Error::InsufficientFunds);
        }

        client.require_auth();
        if deadline != 0 && e.ledger().timestamp() > deadline {
            panic_with_error!(&e, Error::DeadlinePassed);
        }

        let native_token = get_native_token(&e);
        let token_client = token::Client::new(&e, &native_token);
        token_client.transfer(&client, &e.current_contract_address(), &amount);

        let job_id = next_job_id(&e);
        let job = Job {
            client,
            freelancer: Option::None,
            amount,
            description_hash: desc_hash,
            status: JobStatus::Open,
            created_at: e.ledger().timestamp(),
            deadline,
        };

        set_job(&e, job_id, &job);
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

        job.freelancer = Option::Some(freelancer);
        job.status = JobStatus::InProgress;
        set_job(&e, job_id, &job);
    }

    pub fn submit_work(e: Env, freelancer: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        freelancer.require_auth();

        if job.status != JobStatus::InProgress {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.freelancer != Option::Some(freelancer) {
            panic_with_error!(&e, Error::Unauthorized);
        }

        job.status = JobStatus::SubmittedForReview;
        set_job(&e, job_id, &job);
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
        let updated_fees = checked_add(&e, get_fees_accrued(&e), fee);

        job.status = JobStatus::Completed;
        set_job(&e, job_id, &job);
        e.storage().instance().set(&DataKey::FeesAccrued, &updated_fees);

        let native_token = get_native_token(&e);
        let token_client = token::Client::new(&e, &native_token);
        token_client.transfer(&e.current_contract_address(), &freelancer, &payout);
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

        let native_token = get_native_token(&e);
        let token_client = token::Client::new(&e, &native_token);
        token_client.transfer(&e.current_contract_address(), &job.client, &job.amount);
    }

    pub fn get_job(e: Env, job_id: u64) -> Job {
        get_job_or_panic(&e, job_id)
    }

    pub fn get_job_count(e: Env) -> u64 {
        get_jobs_count(&e)
    }

    pub fn raise_dispute(_e: Env, _job_id: u64) {
        panic!("not implemented");
    }

    pub fn resolve_dispute(_e: Env, _job_id: u64, _winner: Address) {
        panic!("not implemented");
    }

    pub fn withdraw_fees(e: Env) {
        let admin = get_admin(&e);
        admin.require_auth();

        let fees = get_fees_accrued(&e);
        if fees <= 0 {
            return;
        }
        e.storage().instance().set(&DataKey::FeesAccrued, &0i128);

        let native_token = get_native_token(&e);
        let token_client = token::Client::new(&e, &native_token);
        token_client.transfer(&e.current_contract_address(), &admin, &fees);
    }

    pub fn get_fees(e: Env) -> i128 {
        get_fees_accrued(&e)
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

fn get_native_token(e: &Env) -> Address {
    e.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::NativeToken)
        .unwrap_or_else(|| panic!("native token not configured"))
}

fn get_admin(e: &Env) -> Address {
    e.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Admin)
        .unwrap_or_else(|| panic!("admin not configured"))
}

fn get_fees_accrued(e: &Env) -> i128 {
    e.storage()
        .instance()
        .get::<DataKey, i128>(&DataKey::FeesAccrued)
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
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{Address, BytesN, Env};

    fn setup() -> (Env, EscrowContractClient<'static>, Address, Address, Address) {
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

        (env, client, user, freelancer, native_token)
    }

    fn hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[7; 32])
    }

    #[test]
    fn post_job_increments_count() {
        let (env, client, user, _, _) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64);
        assert_eq!(job_id, 1);
        assert_eq!(client.get_job_count(), 1);
        let posted = client.get_job(&job_id);
        assert_eq!(posted.status, JobStatus::Open);
        assert_eq!(posted.client, user);
    }

    #[test]
    fn accept_and_approve_happy_path() {
        let (env, client, user, freelancer, native_token) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);

        client.approve_work(&user, &job_id);

        let post_balance = token_client.balance(&freelancer);
        assert_eq!(post_balance - pre_balance, 975_000);
        assert_eq!(client.get_fees(), 25_000);

        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Completed);
    }

    #[test]
    fn cancel_job_refunds_client() {
        let (env, client, user, _, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);

        let job_id = client.post_job(&user, &500_000i128, &hash(&env), &0u64);
        client.cancel_job(&user, &job_id);

        let post_balance = token_client.balance(&user);
        assert_eq!(post_balance, pre_balance);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    #[should_panic]
    fn approve_fails_in_wrong_status() {
        let (env, client, user, _, _) = setup();
        let job_id = client.post_job(&user, &1_000_000i128, &hash(&env), &0u64);
        client.approve_work(&user, &job_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, Address};

    #[test]
    #[should_panic]
    fn test_double_initialize_fails() {
        let e = Env::default();
        let admin = Address::generate(&e);
        let token = Address::generate(&e);

        EscrowContract::initialize(e.clone(), admin.clone(), token.clone());
        // second call should panic
        EscrowContract::initialize(e.clone(), admin, token);
    }

    #[test]
    fn test_initialize_once_works() {
        let e = Env::default();
        let admin = Address::generate(&e);
        let token = Address::generate(&e);

        EscrowContract::initialize(e.clone(), admin.clone(), token.clone());

        let stored_admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        assert_eq!(stored_admin, admin);
    }
}