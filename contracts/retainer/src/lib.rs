#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, Env, String,
    Vec,
};

// Keep rate-limit state alive for the whole configurable window. The values are
// in ledgers (roughly 30 days at a five-second ledger cadence).
const RATE_LIMIT_STATE_TTL_THRESHOLD: u32 = 17_280;
const RATE_LIMIT_STATE_TTL_BUMP: u32 = 518_400;
const MAX_RATE_LIMIT_WINDOW_SECONDS: u64 = 2_592_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    NotFound = 2,
    InvalidStatus = 3,
    IntervalNotPassed = 4,
    MaxRenewalsReached = 5,
    AlreadyInitialized = 6,
    NotInitialized = 7,
    InvalidRateLimitConfig = 8,
    RateLimitExceeded = 9,
}

/// Per-address call limit. A `max_calls` value of zero disables rate limiting.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitConfig {
    pub max_calls: u32,
    pub window_seconds: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitState {
    pub window_started_at: u64,
    pub calls_in_window: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RetainerStatus {
    Active,
    Completed,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Retainer {
    pub client: Address,
    pub freelancer: Address,
    pub amount: i128,
    pub interval_ledgers: u64,
    pub max_renewals: u32,
    pub current_renewal: u32,
    pub status: RetainerStatus,
    pub created_at: u64,
    pub token: Address,
    pub last_renewed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossChainJob {
    pub source_chain: String,
    pub source_job_id: u64,
    pub origin_contract: Address,
    pub freelancer: Address,
    pub amount: i128,
    pub token: Address,
    pub exported: bool,
    pub imported: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Retainer(u64),
    RetainerCount,
    CrossChainJob(u64),
    CrossChainJobCount,
    NativeToken,
    RateLimitConfig,
    RateLimitState(Address),
    TrustedAddress(Address),
}

fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
    admin.require_auth();
    let stored_admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)?;
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }
    Ok(())
}

/// Counts an authenticated caller's state-changing request unless the caller is
/// trusted or rate limiting has been disabled. State is keyed by address so one
/// user cannot consume another user's quota.
fn enforce_rate_limit(env: &Env, caller: &Address) -> Result<(), Error> {
    if env
        .storage()
        .persistent()
        .get::<_, bool>(&DataKey::TrustedAddress(caller.clone()))
        .unwrap_or(false)
    {
        return Ok(());
    }

    let config: RateLimitConfig = env
        .storage()
        .instance()
        .get(&DataKey::RateLimitConfig)
        .unwrap_or(RateLimitConfig {
            max_calls: 0,
            window_seconds: 0,
        });
    if config.max_calls == 0 {
        return Ok(());
    }

    let now = env.ledger().timestamp();
    let key = DataKey::RateLimitState(caller.clone());
    let mut state: RateLimitState = env.storage().persistent().get(&key).unwrap_or(RateLimitState {
        window_started_at: now,
        calls_in_window: 0,
    });

    if now.saturating_sub(state.window_started_at) >= config.window_seconds {
        state.window_started_at = now;
        state.calls_in_window = 0;
    }
    if state.calls_in_window >= config.max_calls {
        return Err(Error::RateLimitExceeded);
    }

    state.calls_in_window += 1;
    env.storage().persistent().set(&key, &state);
    env.storage().persistent().extend_ttl(
        &key,
        RATE_LIMIT_STATE_TTL_THRESHOLD,
        RATE_LIMIT_STATE_TTL_BUMP,
    );
    Ok(())
}

#[contract]
pub struct RetainerContract;

#[contractimpl]
impl RetainerContract {
    pub fn initialize(env: Env, admin: Address, native_token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
        env.storage().instance().set(&DataKey::RetainerCount, &0u64);
        env.storage().instance().set(&DataKey::CrossChainJobCount, &0u64);
        // Disabled by default so deploying this upgrade does not change existing
        // call behaviour until the administrator configures a policy.
        env.storage().instance().set(
            &DataKey::RateLimitConfig,
            &RateLimitConfig {
                max_calls: 0,
                window_seconds: 0,
            },
        );
        env.events().publish((symbol_short!("init"),), (admin, native_token));
        Ok(())
    }

    pub fn create_retainer(
        env: Env,
        client: Address,
        freelancer: Address,
        amount: i128,
        interval_ledgers: u64,
        max_renewals: u32,
        token: Address,
    ) -> Result<u64, Error> {
        client.require_auth();
        enforce_rate_limit(&env, &client)?;
        let count: u64 = env.storage().instance().get(&DataKey::RetainerCount).unwrap_or(0);
        let retainer_id = count + 1;
        env.storage().instance().set(&DataKey::RetainerCount, &retainer_id);
        let retainer = Retainer {
            client: client.clone(),
            freelancer: freelancer.clone(),
            amount,
            interval_ledgers,
            max_renewals,
            current_renewal: 0,
            status: RetainerStatus::Active,
            created_at: env.ledger().timestamp(),
            token: token.clone(),
            last_renewed_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Retainer(retainer_id), &retainer);
        env.events().publish(
            (symbol_short!("ret_crtd"),),
            (retainer_id, client, freelancer, amount, max_renewals),
        );
        Ok(retainer_id)
    }

    pub fn renew_retainer(env: Env, caller: Address, retainer_id: u64) -> Result<u64, Error> {
        caller.require_auth();
        enforce_rate_limit(&env, &caller)?;
        let mut retainer: Retainer = env.storage().persistent().get(&DataKey::Retainer(retainer_id)).ok_or(Error::NotFound)?;
        if retainer.status != RetainerStatus::Active {
            return Err(Error::InvalidStatus);
        }
        let now = env.ledger().timestamp();
        if now < retainer.last_renewed_at + retainer.interval_ledgers {
            return Err(Error::IntervalNotPassed);
        }
        if retainer.current_renewal >= retainer.max_renewals {
            retainer.status = RetainerStatus::Completed;
            env.storage().persistent().set(&DataKey::Retainer(retainer_id), &retainer);
            env.events().publish(
                (symbol_short!("ret_cmpl"),),
                (retainer_id, retainer.client, retainer.freelancer),
            );
            return Ok(retainer_id);
        }
        retainer.current_renewal += 1;
        retainer.last_renewed_at = now;
        env.storage().persistent().set(&DataKey::Retainer(retainer_id), &retainer);
        env.events().publish(
            (symbol_short!("ret_rnwd"),),
            (retainer_id, retainer.client, retainer.freelancer, retainer.amount),
        );
        Ok(retainer_id)
    }

    pub fn cancel_retainer(env: Env, client: Address, retainer_id: u64) -> Result<(), Error> {
        client.require_auth();
        enforce_rate_limit(&env, &client)?;
        let mut retainer: Retainer = env.storage().persistent().get(&DataKey::Retainer(retainer_id)).ok_or(Error::NotFound)?;
        if retainer.client != client {
            return Err(Error::Unauthorized);
        }
        if retainer.status != RetainerStatus::Active {
            return Err(Error::InvalidStatus);
        }
        retainer.status = RetainerStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Retainer(retainer_id), &retainer);
        env.events().publish(
            (symbol_short!("ret_cncl"),),
            (retainer_id, client, retainer.freelancer),
        );
        Ok(())
    }

    pub fn get_retainer(env: Env, retainer_id: u64) -> Retainer {
        env.storage().persistent().get(&DataKey::Retainer(retainer_id)).expect("Retainer not found")
    }

    pub fn export_job(
        env: Env,
        admin: Address,
        source_job_id: u64,
        freelancer: Address,
        amount: i128,
        token: Address,
        target_chain: String,
        target_contract: Address,
    ) -> Result<u64, Error> {
        require_admin(&env, &admin)?;
        let count: u64 = env.storage().instance().get(&DataKey::CrossChainJobCount).unwrap_or(0);
        let cc_id = count + 1;
        env.storage().instance().set(&DataKey::CrossChainJobCount, &cc_id);
        let cross = CrossChainJob {
            source_chain: String::from_str(&env, "stellar"),
            source_job_id,
            origin_contract: target_contract,
            freelancer: freelancer.clone(),
            amount,
            token: token.clone(),
            exported: true,
            imported: false,
        };
        env.storage().persistent().set(&DataKey::CrossChainJob(cc_id), &cross);
        env.events().publish(
            (symbol_short!("j_xport"),),
            (cc_id, source_job_id, freelancer, amount, target_chain),
        );
        Ok(cc_id)
    }

    pub fn import_job(
        env: Env,
        admin: Address,
        cross_chain_id: u64,
        source_chain: String,
        source_job_id: u64,
        freelancer: Address,
        amount: i128,
        token: Address,
    ) -> Result<u64, Error> {
        require_admin(&env, &admin)?;
        let mut cross: CrossChainJob = env.storage().persistent().get(&DataKey::CrossChainJob(cross_chain_id)).ok_or(Error::NotFound)?;
        cross.imported = true;
        env.storage().persistent().set(&DataKey::CrossChainJob(cross_chain_id), &cross);
        env.events().publish(
            (symbol_short!("j_import"),),
            (cross_chain_id, source_chain, source_job_id, freelancer, amount),
        );
        Ok(cross_chain_id)
    }

    pub fn get_cross_chain_job(env: Env, cross_chain_id: u64) -> CrossChainJob {
        env.storage().persistent().get(&DataKey::CrossChainJob(cross_chain_id)).expect("Cross-chain job not found")
    }

    /// Sets the maximum number of state-changing calls one untrusted address may
    /// make during `window_seconds`. Pass `(0, 0)` to disable the limiter.
    pub fn set_rate_limit(
        env: Env,
        admin: Address,
        max_calls: u32,
        window_seconds: u64,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        if (max_calls == 0) != (window_seconds == 0)
            || window_seconds > MAX_RATE_LIMIT_WINDOW_SECONDS
        {
            return Err(Error::InvalidRateLimitConfig);
        }
        env.storage().instance().set(
            &DataKey::RateLimitConfig,
            &RateLimitConfig {
                max_calls,
                window_seconds,
            },
        );
        env.events()
            .publish((symbol_short!("rl_cfg"),), (max_calls, window_seconds));
        Ok(())
    }

    pub fn get_rate_limit(env: Env) -> RateLimitConfig {
        env.storage()
            .instance()
            .get(&DataKey::RateLimitConfig)
            .unwrap_or(RateLimitConfig {
                max_calls: 0,
                window_seconds: 0,
            })
    }

    /// Trusted addresses do not consume quota. This is intentionally an
    /// explicit administrator action rather than an implicit admin exemption.
    pub fn set_trusted_address(
        env: Env,
        admin: Address,
        address: Address,
        trusted: bool,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        let key = DataKey::TrustedAddress(address.clone());
        if trusted {
            env.storage().persistent().set(&key, &true);
        } else {
            env.storage().persistent().remove(&key);
        }
        env.events()
            .publish((symbol_short!("trusted"),), (address, trusted));
        Ok(())
    }

    pub fn is_trusted_address(env: Env, address: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::TrustedAddress(address))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    fn setup() -> (Env, RetainerContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, RetainerContract);
        let client = RetainerContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let native_token = Address::generate(&env);
        client.initialize(&admin, &native_token);
        let user = Address::generate(&env);
        let freelancer = Address::generate(&env);
        (env, client, admin, user, freelancer)
    }

    #[test]
    fn test_create_retainer() {
        let (env, client, _, user, freelancer) = setup();
        let token = Address::generate(&env);
        let rid = client.create_retainer(&user, &freelancer, &1_000_000i128, &1000u64, &12u32, &token);
        let retainer = client.get_retainer(&rid);
        assert_eq!(retainer.client, user);
        assert_eq!(retainer.freelancer, freelancer);
        assert_eq!(retainer.amount, 1_000_000);
        assert_eq!(retainer.current_renewal, 0);
        assert_eq!(retainer.status, RetainerStatus::Active);
    }

    #[test]
    fn test_retainer_renew_lifecycle() {
        let (env, client, _, user, freelancer) = setup();
        let token = Address::generate(&env);
        let rid = client.create_retainer(&user, &freelancer, &500_000i128, &10u64, &3u32, &token);
        
        env.ledger().with_mut(|li| {
            li.timestamp = 100;
        });
        client.renew_retainer(&user, &rid);
        let retainer = client.get_retainer(&rid);
        assert_eq!(retainer.current_renewal, 1);

        env.ledger().with_mut(|li| {
            li.timestamp = 200;
        });
        client.renew_retainer(&user, &rid);
        let retainer = client.get_retainer(&rid);
        assert_eq!(retainer.current_renewal, 2);
    }

    #[test]
    fn test_retainer_completes_at_max_renewals() {
        let (env, client, _, user, freelancer) = setup();
        let token = Address::generate(&env);
        let rid = client.create_retainer(&user, &freelancer, &500_000i128, &10u64, &2u32, &token);

        env.ledger().with_mut(|li| { li.timestamp = 100; });
        client.renew_retainer(&user, &rid);

        env.ledger().with_mut(|li| { li.timestamp = 200; });
        client.renew_retainer(&user, &rid);

        let retainer = client.get_retainer(&rid);
        assert_eq!(retainer.status, RetainerStatus::Completed);
    }

    #[test]
    fn test_cancel_retainer() {
        let (env, client, _, user, freelancer) = setup();
        let token = Address::generate(&env);
        let rid = client.create_retainer(&user, &freelancer, &500_000i128, &10u64, &12u32, &token);
        client.cancel_retainer(&user, &rid);
        let retainer = client.get_retainer(&rid);
        assert_eq!(retainer.status, RetainerStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_cancel_completed_retainer_fails() {
        let (env, client, _, user, freelancer) = setup();
        let token = Address::generate(&env);
        let rid = client.create_retainer(&user, &freelancer, &500_000i128, &10u64, &1u32, &token);
        env.ledger().with_mut(|li| { li.timestamp = 100; });
        client.renew_retainer(&user, &rid);
        client.cancel_retainer(&user, &rid);
    }

    #[test]
    fn test_export_and_import_job() {
        let (env, client, admin, _, freelancer) = setup();
        let token = Address::generate(&env);
        let target = Address::generate(&env);
        let cc_id = client.export_job(
            &admin, &1u64, &freelancer, &1_000_000i128, &token,
            &String::from_str(&env, "futurenet"), &target,
        );
        let cross = client.get_cross_chain_job(&cc_id);
        assert!(cross.exported);
        assert!(!cross.imported);

        client.import_job(
            &admin, &cc_id,
            &String::from_str(&env, "futurenet"), &1u64,
            &freelancer, &1_000_000i128, &token,
        );
        let cross = client.get_cross_chain_job(&cc_id);
        assert!(cross.imported);
    }

    #[test]
    fn test_renew_fails_before_interval() {
        let (env, client, _, user, freelancer) = setup();
        let token = Address::generate(&env);
        let rid = client.create_retainer(&user, &freelancer, &500_000i128, &100u64, &12u32, &token);
        env.ledger().with_mut(|li| { li.timestamp = 10; });
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.renew_retainer(&user, &rid);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn test_rate_limit_blocks_calls_until_the_window_resets() {
        let (env, client, admin, user, freelancer) = setup();
        let token = Address::generate(&env);
        client.set_rate_limit(&admin, &2u32, &100u64);

        client.create_retainer(&user, &freelancer, &1i128, &1u64, &1u32, &token);
        client.create_retainer(&user, &freelancer, &1i128, &1u64, &1u32, &token);
        let limited = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.create_retainer(&user, &freelancer, &1i128, &1u64, &1u32, &token);
        }));
        assert!(limited.is_err());

        env.ledger().with_mut(|li| li.timestamp = 100);
        client.create_retainer(&user, &freelancer, &1i128, &1u64, &1u32, &token);
    }

    #[test]
    fn test_trusted_address_is_exempt_from_rate_limit() {
        let (env, client, admin, user, freelancer) = setup();
        let token = Address::generate(&env);
        client.set_rate_limit(&admin, &1u32, &100u64);
        client.set_trusted_address(&admin, &user, &true);
        assert!(client.is_trusted_address(&user));

        client.create_retainer(&user, &freelancer, &1i128, &1u64, &1u32, &token);
        client.create_retainer(&user, &freelancer, &1i128, &1u64, &1u32, &token);
        assert_eq!(client.get_retainer(&2u64).client, user);
    }
}
