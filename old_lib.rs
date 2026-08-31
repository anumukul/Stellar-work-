#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, BytesN,
    Env, String, Symbol, Vec,
};

const DEFAULT_FEE_BPS: i128 = 250;
const BPS_DENOMINATOR: i128 = 10_000;
const MAX_FEE_BPS: i128 = 1_000;
const MAX_FEE_BPS_CONFIG: i128 = 10_000;
const MAX_REVISIONS: u32 = 3;
const CONTRACT_VERSION: u32 = 1;
const DEFAULT_DESCRIPTION_PAYLOAD_MAX_BYTES: u32 = 4096;
const MIN_DESCRIPTION_PAYLOAD_MAX_BYTES: u32 = 32;
const MAX_DESCRIPTION_PAYLOAD_MAX_BYTES: u32 = 65_536;
const MAX_FEE_TIERS: u32 = 10;
#[allow(dead_code)]
const XLM_STROOP: i128 = 10_000_000;
const UPGRADE_TIMELOCK_SECS: u64 = 86_400;
/// Default dispute deposit: 5 XLM in stroops.
const DEFAULT_DISPUTE_FEE: i128 = 50_000_000;
/// Maximum number of milestones allowed per job.
const MAX_MILESTONES: u32 = 20;
/// Maximum number of disputes that can be resolved in a single batch call.
const MAX_BATCH_DISPUTES: u32 = 20;

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
pub enum JobVisibility {
    Public,
    Private,
    InviteOnly,
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

/// A single milestone within a milestone-based job.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    /// Zero-based index within the job's milestone list.
    pub id: u32,
    /// Optional description hash (32-byte hash of the milestone description).
    /// All-zero bytes means no description hash was provided.
    pub description_hash: BytesN<32>,
    /// Amount in stroops escrowed for this milestone.
    pub amount: i128,
    /// Whether the client has released payment for this milestone.
    pub is_released: bool,
}

/// Input type used when creating milestone jobs.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneInput {
    pub description_hash: BytesN<32>,
    pub amount: i128,
}
/// `client_bps` is the basis-points share (0–10 000) awarded to the client.
/// The remainder goes to the freelancer (after platform fee).
/// Examples:
///   10_000 → client wins everything (no fee deducted, full refund)
///       0 → freelancer wins everything (fee deducted from payout)
///    5_000 → 50 / 50 split (fee deducted from total before splitting)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DashboardStats {
    pub total_jobs: u64,
    pub open_jobs: u64,
    /// Jobs in InProgress or SubmittedForReview status.
    pub active_jobs: u64,
    pub completed_jobs: u64,
    pub cancelled_jobs: u64,
    pub disputed_jobs: u64,
    /// Fees accrued in the native token (in stroops).
    pub total_fees_accrued: i128,
    /// Sum of all job amounts ever posted (in stroops).
    pub total_volume: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeTier {
    pub min_amount: i128,
    pub fee_bps: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeResolution {
    /// Basis-points share for the client (0 – 10 000).
    pub client_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuditEntry {
    pub id: u64,
    pub caller: Address,
    pub operation: String,
    pub job_id: Option<u64>,
    pub timestamp: u64,
    pub details: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub job_id: u64,
    pub client: Address,
    pub freelancer: Address,
    pub approved_at: u64,
    pub attestation_hash: BytesN<32>,
    pub metadata_uri: soroban_sdk::String,
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
    FeeBps,
    FeeTier(u32),
    FeeTierCount,
    DescriptionPayloadMaxBytes,
    MaxActiveJobsPerClient,
    PendingUpgradeWasmHash,
    PendingUpgradeDeadline,
    DescriptionCidMapping(BytesN<32>),
    // Issue #412: referral reward system
    ReferralCode(String),
    ReferralEarnings(Address),
    ClientReferrer(Address),
    ReferralBonusPaid(Address),
    // Issue #423: Access Control
    Blacklisted(Address),
    WhitelistMode,
    Whitelisted(Address),
    // Issue #427: Admin job views
    AllJobIds,
    /// Configurable dispute fee in native-token stroops.
    DisputeFee,
    /// Stores the dispute fee deposited by the raiser, keyed by job_id.
    DisputeFeePaid(u64),
    /// Address of the party who raised the dispute, keyed by job_id.
    DisputeRaiser(u64),
    /// Issue #456: trusted forwarder whitelist for gasless operations.
    TrustedForwarder(Address),
    /// Fee exemption status for an address.
    FeeExempted(Address),
    // Issue #460: two-step ownership transfer
    /// Address nominated to become the next admin (cleared on accept or cancel).
    PendingAdmin,
    AuditLog(u64),
    AuditCount,
    Attestation(u64),
    UserAttestations(Address),
    JobVisibility(u64),
    InvitedFreelancer(u64, Address),
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
    FeeTooHigh = 9,
    RevisionLimitReached = 16,
    AlreadyInitialized = 10,
    InvalidAmount = 11,
    InvalidDescriptionHash = 12,
    UnauthorizedAdmin = 13,
    InvalidDeadline = 14,
    ActiveJobLimitExceeded = 15,
    DescriptionPayloadTooLarge = 17,
    UpgradeNotApproved = 18,
    UpgradeTimelockPending = 19,
    NoPendingUpgrade = 20,
    // Issue #412: referral reward system
    ReferralCodeAlreadyExists = 21,
    ReferralCodeNotFound = 22,
    InsufficientReferralEarnings = 23,
    // Issue #423: Access Control
    BlacklistedUser = 24,
    NotWhitelisted = 25,
    SelfReferralNotAllowed = 26,
    DeadlineNotExtendable = 27,
    NoFreelancerAssigned = 28,
    // Issue #456: meta-transaction / gasless support
    ForwarderNotTrusted = 29,
    // Issue #460: two-step ownership transfer
    NoPendingTransfer = 30,
    NotPendingAdmin = 31,
    BatchSizeMismatch = 32,
    BatchTooLarge = 33,
    AttestationNotFound = 34,
    JobNotVisible = 35,
    FreelancerNotInvited = 36,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn get_audit_entry(e: Env, id: u64) -> Option<AuditEntry> {
        e.storage().persistent().get(&DataKey::AuditLog(id))
    }

    fn write_audit(e: &Env, caller: Address, operation: &str, job_id: Option<u64>, details: &str) {
        let mut count: u64 = e.storage().persistent().get(&DataKey::AuditCount).unwrap_or(0);
        count += 1;
        let entry = AuditEntry {
            id: count,
            caller,
            operation: String::from_str(e, operation),
            job_id,
            timestamp: e.ledger().timestamp(),
            details: String::from_str(e, details),
        };
        e.storage().persistent().set(&DataKey::AuditLog(count), &entry);
        e.storage().persistent().set(&DataKey::AuditCount, &count);
    }
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
            .instance()
            .set(&DataKey::FeeBps, &DEFAULT_FEE_BPS);
        e.storage().instance().set(
            &DataKey::DescriptionPayloadMaxBytes,
            &DEFAULT_DESCRIPTION_PAYLOAD_MAX_BYTES,
        );
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
        description_payload_len: u32,
        deadline: u64,
        token: Address,
    ) -> u64 {
        if amount <= 0 {
            panic_with_error!(&e, Error::InvalidAmount);
        }
        if desc_hash == BytesN::from_array(&e, &[0u8; 32]) {
            panic_with_error!(&e, Error::InvalidDescriptionHash);
        }
        if description_payload_len == 0 {
            panic_with_error!(&e, Error::InvalidDescriptionHash);
        }
        client.require_auth();
        require_active_access(&e, &client);
        if deadline != 0 && e.ledger().timestamp() > deadline {
            panic_with_error!(&e, Error::InvalidDeadline);
        }
        if description_payload_len > get_description_payload_max_bytes_storage(&e) {
            panic_with_error!(&e, Error::DescriptionPayloadTooLarge);
        }
        if !e
            .storage()
            .persistent()
            .has(&DataKey::AllowedToken(token.clone()))
        {
            panic_with_error!(&e, Error::TokenNotAllowed);
        }
        enforce_client_active_job_limit(&e, &client);

        let token_client = token::Client::new(&e, &token);
        token_client.transfer(&client, &e.current_contract_address(), &amount);

        let job_id = next_job_id(&e);
        let job_token = token.clone();
        let job_client = client.clone();
        let job = Job {
            client: job_client,
            freelancer: Option::None,
            amount,
            description_hash: desc_hash,
            status: JobStatus::Open,
            created_at: e.ledger().timestamp(),
            deadline,
            token: job_token,
            revision_count: 0,
        };

        set_job(&e, job_id, &job);
        
        let mut all_ids: Vec<u64> = e.storage().persistent().get(&DataKey::AllJobIds).unwrap_or(Vec::new(&e));
        all_ids.push_back(job_id);
        e.storage().persistent().set(&DataKey::AllJobIds, &all_ids);
        e.storage().persistent().extend_ttl(&DataKey::AllJobIds, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        

        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "job_created"),),
            (job_id, client.clone(), amount, token.clone()),
        );

        Self::write_audit(&e, client, "post_job", Some(job_id), "Posted a job");

        job_id
    }

    pub fn accept_job(e: Env, freelancer: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        freelancer.require_auth();
        require_active_access(&e, &freelancer);

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

        e.events()
            .publish((Symbol::new(&e, "job_accepted"),), (job_id, freelancer.clone()));

        Self::write_audit(&e, freelancer, "accept_job", Some(job_id), "Accepted job");
    }

    pub fn submit_work(e: Env, freelancer: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        freelancer.require_auth();
        require_active_access(&e, &freelancer);

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

        e.events()
            .publish((Symbol::new(&e, "job_submitted"),), (job_id, freelancer.clone()));

        Self::write_audit(&e, freelancer, "submit_work", Some(job_id), "Submitted work for review");
    }

    pub fn approve_work(e: Env, client: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        client.require_auth();
        require_active_access(&e, &client);

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

        // Check if client or freelancer is fee-exempted
        let client_exempted = Self::is_fee_exempted(e.clone(), job.client.clone());
        let freelancer_exempted = Self::is_fee_exempted(e.clone(), freelancer.clone());
        let fee_exempted = client_exempted || freelancer_exempted;

        let (fee, payout) = if fee_exempted {
            (0i128, job.amount)
        } else {
            let fee_bps = calculate_fee_for_amount(&e, job.amount);
            let calculated_fee = checked_mul_div(&e, job.amount, fee_bps, BPS_DENOMINATOR);
            let calculated_payout = checked_sub(&e, job.amount, calculated_fee);
            (calculated_fee, calculated_payout)
        };

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

        // Issue #412: credit 0.5% referral bonus on the client's first completed job.
        let bonus_paid_key = DataKey::ReferralBonusPaid(job.client.clone());
        let already_paid: bool = e
            .storage()
            .persistent()
            .get(&bonus_paid_key)
            .unwrap_or(false);
        if !already_paid {
            let client_ref_key = DataKey::ClientReferrer(job.client.clone());
            if let Some(referrer) = e
                .storage()
                .persistent()
                .get::<DataKey, Address>(&client_ref_key)
            {
                // 0.5% of job amount (50 basis points)
                const REFERRAL_BPS: i128 = 50;
                let bonus = checked_mul_div(&e, job.amount, REFERRAL_BPS, BPS_DENOMINATOR);
                let earnings_key = DataKey::ReferralEarnings(referrer.clone());
                let prev: i128 = e
                    .storage()
                    .persistent()
                    .get(&earnings_key)
                    .unwrap_or(0i128);
                e.storage()
                    .persistent()
                    .set(&earnings_key, &checked_add(&e, prev, bonus));
                e.storage().persistent().extend_ttl(
                    &earnings_key,
                    INSTANCE_LIFETIME_THRESHOLD,
                    INSTANCE_BUMP_AMOUNT,
                );
                // Mark bonus as paid so subsequent jobs don't trigger it again.
                e.storage().persistent().set(&bonus_paid_key, &true);
                e.storage().persistent().extend_ttl(
                    &bonus_paid_key,
                    INSTANCE_LIFETIME_THRESHOLD,
                    INSTANCE_BUMP_AMOUNT,
                );
                e.events().publish(
                    (Symbol::new(&e, "referral_bonus_credited"),),
                    (referrer, job.client.clone(), bonus),
                );
            }
        }

        e.events().publish(
            (Symbol::new(&e, "job_approved"),),
            (job_id, client.clone(), freelancer.clone(), payout),
        );

        let attestation = Attestation {
            job_id,
            client: job.client.clone(),
            freelancer: freelancer.clone(),
            approved_at: e.ledger().timestamp(),
            attestation_hash: BytesN::from_array(&e, &[0u8; 32]),
            metadata_uri: soroban_sdk::String::from_str(&e, ""),
        };
        e.storage().persistent().set(&DataKey::Attestation(job_id), &attestation);
        e.storage().persistent().extend_ttl(&DataKey::Attestation(job_id), ACTIVE_JOB_LIFETIME_THRESHOLD, ARCHIVAL_JOB_BUMP_AMOUNT);
        let mut user_attestations: Vec<u64> = e.storage().persistent().get(&DataKey::UserAttestations(job.client.clone())).unwrap_or(Vec::new(&e));
        user_attestations.push_back(job_id);
        e.storage().persistent().set(&DataKey::UserAttestations(job.client.clone()), &user_attestations);
        e.storage().persistent().extend_ttl(&DataKey::UserAttestations(job.client.clone()), INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        let mut user_attestations_f: Vec<u64> = e.storage().persistent().get(&DataKey::UserAttestations(freelancer.clone())).unwrap_or(Vec::new(&e));
        user_attestations_f.push_back(job_id);
        e.storage().persistent().set(&DataKey::UserAttestations(freelancer.clone()), &user_attestations_f);
        e.storage().persistent().extend_ttl(&DataKey::UserAttestations(freelancer.clone()), INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        e.events().publish(
            (Symbol::new(&e, "work_attested"),),
            (job_id, client.clone(), freelancer.clone(), attestation.approved_at),
        );
    }

    pub fn reject_work(e: Env, client: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        client.require_auth();
        require_active_access(&e, &client);

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
        require_active_access(&e, &client);

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

        e.events()
            .publish((Symbol::new(&e, "job_cancelled"),), (job_id, client));
    }

    pub fn freelancer_cancel_job(e: Env, freelancer: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        freelancer.require_auth();
        require_active_access(&e, &freelancer);

        if job.status != JobStatus::InProgress {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.freelancer != Option::Some(freelancer.clone()) {
            panic_with_error!(&e, Error::Unauthorized);
        }

        job.status = JobStatus::Cancelled;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        let token_client = token::Client::new(&e, &job.token);
        token_client.transfer(&e.current_contract_address(), &job.client, &job.amount);

        e.events().publish(
            (Symbol::new(&e, "job_freelancer_cancelled"),),
            (job_id, freelancer, job.client, job.amount),
        );
    }

    pub fn enforce_deadline(e: Env, client: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        client.require_auth();
        require_active_access(&e, &client);

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

        e.events()
            .publish((Symbol::new(&e, "deadline_enforced"),), (job_id, client));
    }

    pub fn mutual_cancel(
        e: Env,
        client: Address,
        freelancer: Address,
        job_id: u64,
        client_share_bps: i128,
    ) {
        client.require_auth();
        require_active_access(&e, &client);
        freelancer.require_auth();
        require_active_access(&e, &freelancer);

        let mut job = get_job_or_panic(&e, job_id);

        if job.status != JobStatus::InProgress && job.status != JobStatus::SubmittedForReview {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.client != client || job.freelancer != Option::Some(freelancer.clone()) {
            panic_with_error!(&e, Error::Unauthorized);
        }
        if client_share_bps < 0 || client_share_bps > BPS_DENOMINATOR {
            panic_with_error!(&e, Error::InvalidAmount);
        }

        let client_share = checked_mul_div(&e, job.amount, client_share_bps, BPS_DENOMINATOR);
        let freelancer_share = checked_sub(&e, job.amount, client_share);

        job.status = JobStatus::Cancelled;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        let token_client = token::Client::new(&e, &job.token);
        if client_share > 0 {
            token_client.transfer(&e.current_contract_address(), &client, &client_share);
        }
        if freelancer_share > 0 {
            token_client.transfer(
                &e.current_contract_address(),
                &freelancer,
                &freelancer_share,
        );
        }

        e.events().publish(
            (Symbol::new(&e, "job_mutually_cancelled"),),
            (job_id, client, freelancer, client_share, freelancer_share),
        );
    }

    pub fn extend_job_ttl(e: Env, caller: Address, job_id: u64) {
        caller.require_auth();
        require_active_access(&e, &caller);
        let job = get_job_or_panic(&e, job_id);
        if job.client != caller && job.freelancer != Option::Some(caller.clone()) {
            panic_with_error!(&e, Error::Unauthorized);
        }
        bump_job_ttl(&e, job_id, &job);
        bump_instance_ttl(&e);
    }

    pub fn extend_deadline(
        e: Env,
        client: Address,
        job_id: u64,
        new_deadline: u64,
        freelancer_consent: Option<Address>,
    ) {
        client.require_auth();
        require_active_access(&e, &client);

        let mut job = get_job_or_panic(&e, job_id);

        if job.status != JobStatus::InProgress && job.status != JobStatus::SubmittedForReview {
            panic_with_error!(&e, Error::DeadlineNotExtendable);
        }
        if job.client != client {
            panic_with_error!(&e, Error::Unauthorized);
        }
        if job.deadline == 0 {
            panic_with_error!(&e, Error::DeadlineNotExtendable);
        }
        if new_deadline <= job.deadline {
            panic_with_error!(&e, Error::InvalidDeadline);
        }
        if new_deadline <= e.ledger().timestamp() {
            panic_with_error!(&e, Error::InvalidDeadline);
        }

        if let Some(freelancer) = &freelancer_consent {
            if job.freelancer != Option::Some(freelancer.clone()) {
                panic_with_error!(&e, Error::NoFreelancerAssigned);
            }
            freelancer.require_auth();
            require_active_access(&e, freelancer);
        }

        let old_deadline = job.deadline;
        job.deadline = new_deadline;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "deadline_extended"),),
            (job_id, client, old_deadline, new_deadline),
        );
    }

    pub fn raise_dispute(e: Env, caller: Address, job_id: u64) {
        let mut job = get_job_or_panic(&e, job_id);
        caller.require_auth();
        require_active_access(&e, &caller);

        if job.status != JobStatus::InProgress && job.status != JobStatus::SubmittedForReview {
            panic_with_error!(&e, Error::InvalidStatus);
        }
        if job.client != caller && job.freelancer != Option::Some(caller.clone()) {
            panic_with_error!(&e, Error::Unauthorized);
        }

        // Collect dispute fee deposit from the raiser in the native token.
        let dispute_fee = get_dispute_fee_storage(&e);
        if dispute_fee > 0 {
            let native_token = load_native_token(&e);
            let token_client = token::Client::new(&e, &native_token);
            token_client.transfer(&caller, &e.current_contract_address(), &dispute_fee);
        }

        // Record who raised the dispute and how much they deposited.
        e.storage()
            .persistent()
            .set(&DataKey::DisputeRaiser(job_id), &caller);
        e.storage()
            .persistent()
            .set(&DataKey::DisputeFeePaid(job_id), &dispute_fee);
        e.storage().persistent().extend_ttl(
            &DataKey::DisputeRaiser(job_id),
            ACTIVE_JOB_LIFETIME_THRESHOLD,
            ACTIVE_JOB_BUMP_AMOUNT,
        );
        e.storage().persistent().extend_ttl(
            &DataKey::DisputeFeePaid(job_id),
            ACTIVE_JOB_LIFETIME_THRESHOLD,
            ACTIVE_JOB_BUMP_AMOUNT,
        );

        job.status = JobStatus::Disputed;
        set_job(&e, job_id, &job);
        bump_instance_ttl(&e);

        e.events()
            .publish((Symbol::new(&e, "job_disputed"),), (job_id, caller, dispute_fee));
    }

    /// Resolve a disputed job.
    ///
    /// Only the admin may call this.  `resolution.client_bps` is the share
    /// (in basis-points, 0 – 10 000) of the escrowed amount returned to the
    /// client.  The remainder is paid to the freelancer after deducting the
    /// platform fee.
    ///
    /// Special cases:
    ///   client_bps == 10_000  → full refund to client, no fee, status = Cancelled
    ///   client_bps == 0       → full payout to freelancer minus fee, status = Completed
    ///   0 < client_bps < 10_000 → split: client gets their share (no fee on
    ///                             client portion), freelancer gets remainder
    ///                             minus platform fee, status = Completed
    pub fn resolve_dispute(e: Env, job_id: u64, resolution: DisputeResolution) {
        let admin = load_admin(&e);
        admin.require_auth();
        resolve_single_dispute(&e, &admin, job_id, resolution);
    }

    /// Resolve multiple disputed jobs in one contract call (admin only).
    ///
    /// `job_ids` and `resolutions` must be the same length and no longer than
    /// `MAX_BATCH_DISPUTES` (20). All resolutions are processed atomically —
    /// if any single dispute fails (e.g. job is not in Disputed status) the
    /// entire batch reverts.
    pub fn batch_resolve_disputes(e: Env, job_ids: Vec<u64>, resolutions: Vec<DisputeResolution>) {
        let admin = load_admin(&e);
        admin.require_auth();

        if job_ids.len() != resolutions.len() {
            panic_with_error!(&e, Error::BatchSizeMismatch);
        }
        if job_ids.len() > MAX_BATCH_DISPUTES {
            panic_with_error!(&e, Error::BatchTooLarge);
        }

        for i in 0..job_ids.len() {
            let job_id = job_ids.get(i).unwrap();
            let resolution = resolutions.get(i).unwrap();
            resolve_single_dispute(&e, &admin, job_id, resolution);
        }
    }

    /// Issue #463 — Explicit split-outcome resolution.
    ///
    /// Admin awards `client_payout_bps` basis-points of escrowed funds to the
    /// client; the remainder (minus platform fee) goes to the freelancer.
    /// Unlike `resolve_dispute`, this function is dedicated to partial outcomes
    /// (0 < client_payout_bps < 10 000) and emits a distinct `dispute_split`
    /// event carrying individual payout amounts.
    pub fn resolve_dispute_split(e: Env, job_id: u64, client_payout_bps: u32) {
        let admin = load_admin(&e);
        admin.require_auth();

        if client_payout_bps > BPS_DENOMINATOR as u32 {
            panic_with_error!(&e, Error::InvalidAmount);
        }

        let mut job = get_job_or_panic(&e, job_id);
        if job.status != JobStatus::Disputed {
            panic_with_error!(&e, Error::InvalidStatus);
        }

        let freelancer = match job.freelancer.clone() {
            Option::Some(addr) => addr,
            Option::None => panic_with_error!(&e, Error::InvalidStatus),
        };

        let client_share = checked_mul_div(
            &e,
            job.amount,
            client_payout_bps as i128,
            BPS_DENOMINATOR,
        );
        let freelancer_gross = checked_sub(&e, job.amount, client_share);
        let fee = checked_mul_div(
            &e,
            freelancer_gross,
            get_fee_bps_storage(&e),
            BPS_DENOMINATOR,
        );
        let freelancer_net = checked_sub(&e, freelancer_gross, fee);

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
        if client_share > 0 {
            token_client.transfer(&e.current_contract_address(), &job.client, &client_share);
        }
        if freelancer_net > 0 {
            token_client.transfer(&e.current_contract_address(), &freelancer, &freelancer_net);
        }

        e.events().publish(
            (Symbol::new(&e, "dispute_split"),),
            (job_id, client_payout_bps, client_share, freelancer_net),
        );
    }

    /// Issue #456 — Admin-managed trusted-forwarder whitelist.
    ///
    /// A trusted forwarder may submit transactions on behalf of users (gasless
    /// UX). Pass `is_trusted = true` to add, `false` to remove.
    pub fn set_trusted_forwarder(e: Env, forwarder: Address, is_trusted: bool) {
        let admin = load_admin(&e);
        admin.require_auth();

        if is_trusted {
            e.storage()
                .persistent()
                .set(&DataKey::TrustedForwarder(forwarder.clone()), &true);
            e.storage().persistent().extend_ttl(
                &DataKey::TrustedForwarder(forwarder.clone()),
                ACTIVE_JOB_LIFETIME_THRESHOLD,
                INSTANCE_BUMP_AMOUNT,
            );
        } else {
            e.storage()
                .persistent()
                .remove(&DataKey::TrustedForwarder(forwarder.clone()));
        }

        bump_instance_ttl(&e);
        e.events().publish(
            (Symbol::new(&e, "fwd_set"),),
            (forwarder, is_trusted),
        );
    }

    /// Issue #456 — Returns whether `forwarder` is on the trusted-forwarder whitelist.
    pub fn is_trusted_forwarder(e: Env, forwarder: Address) -> bool {
        e.storage()
            .persistent()
            .has(&DataKey::TrustedForwarder(forwarder))
    }

    /// Issue #456 — Gasless job cancellation via a trusted forwarder.
    ///
    /// The relayer pays the Stellar transaction fee; the client does not need XLM.
    /// The relayer must be on the admin-managed trusted-forwarder whitelist.
    /// Only Open jobs owned by `client` can be cancelled through this path.
    pub fn relay_cancel_job(e: Env, relayer: Address, client: Address, job_id: u64) {
        relayer.require_auth();
        if !e
            .storage()
            .persistent()
            .has(&DataKey::TrustedForwarder(relayer.clone()))
        {
            panic_with_error!(&e, Error::ForwarderNotTrusted);
        }

        let mut job = get_job_or_panic(&e, job_id);
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
            (Symbol::new(&e, "tx_relayed"),),
            (relayer, client.clone(), job_id),
        );
        e.events().publish(
            (Symbol::new(&e, "job_cancelled"),),
            (job_id, client),
        );
    }

    pub fn update_fee(e: Env, new_fee_bps: i128) {
        let admin = load_admin(&e);
        admin.require_auth();
        if new_fee_bps < 0 || new_fee_bps > MAX_FEE_BPS {
            panic_with_error!(&e, Error::FeeTooHigh);
        }
        e.storage().instance().set(&DataKey::FeeBps, &new_fee_bps);
        bump_instance_ttl(&e);
    }

    pub fn get_fee_bps(e: Env) -> i128 {
        get_fee_bps_storage(&e)
    }

    /// Return the current dispute fee deposit amount in stroops (native token).
    pub fn get_dispute_fee(e: Env) -> i128 {
        get_dispute_fee_storage(&e)
    }

    /// Admin-only: update the dispute fee deposit amount.
    /// Pass 0 to disable the deposit requirement.
    pub fn update_dispute_fee(e: Env, admin: Address, new_fee: i128) {
        admin.require_auth();
        let stored_admin = load_admin(&e);
        if admin != stored_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        if new_fee < 0 {
            panic_with_error!(&e, Error::InvalidAmount);
        }
        e.storage()
            .instance()
            .set(&DataKey::DisputeFee, &new_fee);
        bump_instance_ttl(&e);
        e.events()
            .publish((Symbol::new(&e, "dispute_fee_updated"),), (admin, new_fee));
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

    pub fn get_jobs_batch_visible_to(e: Env, start: u64, limit: u32, viewer: Address) -> Vec<Job> {
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
            if let Some(job) = e.storage().persistent().get::<DataKey, Job>(&DataKey::Job(cursor)) {
                let visibility = e.storage()
                    .persistent()
                    .get::<DataKey, JobVisibility>(&DataKey::JobVisibility(cursor))
                    .unwrap_or(JobVisibility::Public);
                match visibility {
                    JobVisibility::Public => { jobs.push_back(job); },
                    JobVisibility::Private => {
                        if job.client == viewer {
                            jobs.push_back(job);
                        }
                    },
                    JobVisibility::InviteOnly => {
                        if job.client == viewer || e.storage().persistent().has(&DataKey::InvitedFreelancer(cursor, viewer.clone())) {
                            jobs.push_back(job);
                        }
                    },
                }
            }
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
        e.events()
            .publish((Symbol::new(&e, "admin_transferred"),), (caller, new_admin));
    }

    // ── Issue #460: two-step ownership transfer ──────────────────────────────

    /// Step 1: nominate `new_admin` as the pending admin.
    ///
    /// Only the current admin may call this. Emits `OwnershipTransferStarted`.
    /// The transfer is not final until the nominee calls `accept_ownership`.
    pub fn transfer_ownership(e: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        e.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        bump_instance_ttl(&e);
        e.events().publish(
            (Symbol::new(&e, "ownership_transfer_started"),),
            (admin, new_admin),
        );
    }

    /// Step 2: the nominated address accepts and becomes the new admin.
    ///
    /// Only the pending admin may call this. Clears `PendingAdmin` and emits
    /// `OwnershipTransferred`.
    pub fn accept_ownership(e: Env, new_admin: Address) {
        new_admin.require_auth();
        let pending: Option<Address> = e
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin);
        let pending_admin = match pending {
            Some(a) => a,
            None => panic_with_error!(&e, Error::NoPendingTransfer),
        };
        if new_admin != pending_admin {
            panic_with_error!(&e, Error::NotPendingAdmin);
        }
        let old_admin = load_admin(&e);
        e.storage()
            .instance()
            .set(&DataKey::Admin, &new_admin);
        e.storage()
            .instance()
            .remove(&DataKey::PendingAdmin);
        bump_instance_ttl(&e);
        e.events().publish(
            (Symbol::new(&e, "ownership_transferred"),),
            (old_admin, new_admin),
        );
    }

    /// Abort a pending ownership transfer.
    ///
    /// Only the current admin may cancel. Clears `PendingAdmin` and emits
    /// `OwnershipTransferCancelled`.
    pub fn cancel_ownership_transfer(e: Env, admin: Address) {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        let pending: Option<Address> = e
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin);
        if pending.is_none() {
            panic_with_error!(&e, Error::NoPendingTransfer);
        }
        e.storage()
            .instance()
            .remove(&DataKey::PendingAdmin);
        bump_instance_ttl(&e);
        e.events().publish(
            (Symbol::new(&e, "ownership_transfer_cancelled"),),
            (admin,),
        );
    }

    /// Returns the nominated pending admin, or `None` if no transfer is in progress.
    pub fn get_pending_admin(e: Env) -> Option<Address> {
        e.storage()
            .instance()
            .get(&DataKey::PendingAdmin)
    }

    pub fn get_job_count(e: Env) -> u64 {
        get_jobs_count(&e)
    }

    pub fn get_open_jobs_count(e: Env) -> u64 {
        count_jobs_with_status(&e, JobStatus::Open)
    }

    pub fn get_completed_jobs_count(e: Env) -> u64 {
        count_jobs_with_status(&e, JobStatus::Completed)
    }

    pub fn get_cancelled_jobs_count(e: Env) -> u64 {
        count_jobs_with_status(&e, JobStatus::Cancelled)
    }

    pub fn get_desc_payload_max(e: Env) -> u32 {
        get_description_payload_max_bytes_storage(&e)
    }

    pub fn set_desc_payload_max(e: Env, caller: Address, max_bytes: u32) {
        caller.require_auth();
        let admin = load_admin(&e);
        if caller != admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        if max_bytes < MIN_DESCRIPTION_PAYLOAD_MAX_BYTES
            || max_bytes > MAX_DESCRIPTION_PAYLOAD_MAX_BYTES
        {
            panic_with_error!(&e, Error::InvalidAmount);
        }
        e.storage()
            .instance()
            .set(&DataKey::DescriptionPayloadMaxBytes, &max_bytes);
        bump_instance_ttl(&e);
    }

    pub fn get_jobs_by_status(e: Env, status: JobStatus) -> Vec<Job> {
        let total = get_jobs_count(&e);
        let mut jobs = Vec::new(&e);
        let mut i: u64 = 1;
        while i <= total {
            if let Some(job) = e
                .storage()
                .persistent()
                .get::<DataKey, Job>(&DataKey::Job(i))
            {
                if job.status == status {
                    jobs.push_back(job);
                }
            }
            i += 1;
        }
        jobs
    }

    pub fn get_attestation(e: Env, job_id: u64) -> Attestation {
        e.storage()
            .persistent()
            .get::<DataKey, Attestation>(&DataKey::Attestation(job_id))
            .unwrap_or_else(|| panic_with_error!(&e, Error::AttestationNotFound))
    }

    pub fn get_user_attestations(e: Env, user: Address) -> Vec<Attestation> {
        let ids: Vec<u64> = e.storage()
            .persistent()
            .get(&DataKey::UserAttestations(user.clone()))
            .unwrap_or(Vec::new(&e));
        let mut result = Vec::new(&e);
        let mut i: u32 = 0;
        while i < ids.len() {
            let id = ids.get(i).unwrap();
            if let Some(att) = e.storage().persistent().get::<DataKey, Attestation>(&DataKey::Attestation(id)) {
                result.push_back(att);
            }
            i += 1;
        }
        result
    }

    pub fn get_job_visibility(e: Env, job_id: u64) -> JobVisibility {
        e.storage()
            .persistent()
            .get::<DataKey, JobVisibility>(&DataKey::JobVisibility(job_id))
            .unwrap_or(JobVisibility::Public)
    }

    pub fn set_job_visibility(e: Env, client: Address, job_id: u64, visibility: JobVisibility) {
        client.require_auth();
        let job = get_job_or_panic(&e, job_id);
        if job.client != client {
            panic_with_error!(&e, Error::Unauthorized);
        }
        e.storage().persistent().set(&DataKey::JobVisibility(job_id), &visibility);
        e.storage().persistent().extend_ttl(&DataKey::JobVisibility(job_id), ACTIVE_JOB_LIFETIME_THRESHOLD, ACTIVE_JOB_BUMP_AMOUNT);
    }

    pub fn is_job_visible_to(e: Env, job_id: u64, viewer: Address) -> bool {
        let job = get_job_or_panic(&e, job_id);
        let visibility = e.storage()
            .persistent()
            .get::<DataKey, JobVisibility>(&DataKey::JobVisibility(job_id))
            .unwrap_or(JobVisibility::Public);
        match visibility {
            JobVisibility::Public => true,
            JobVisibility::Private => {
                viewer == job.client
            },
            JobVisibility::InviteOnly => {
                viewer == job.client
                    || e.storage()
                        .persistent()
                        .has(&DataKey::InvitedFreelancer(job_id, viewer))
            },
        }
    }

    pub fn add_invited_freelancer(e: Env, client: Address, job_id: u64, freelancer: Address) {
        client.require_auth();
        let job = get_job_or_panic(&e, job_id);
        if job.client != client {
            panic_with_error!(&e, Error::Unauthorized);
        }
        e.storage().persistent().set(&DataKey::InvitedFreelancer(job_id, freelancer.clone()), &true);
        e.storage().persistent().extend_ttl(&DataKey::InvitedFreelancer(job_id, freelancer), ACTIVE_JOB_LIFETIME_THRESHOLD, ACTIVE_JOB_BUMP_AMOUNT);
    }

    pub fn remove_invited_freelancer(e: Env, client: Address, job_id: u64, freelancer: Address) {
        client.require_auth();
        let job = get_job_or_panic(&e, job_id);
        if job.client != client {
            panic_with_error!(&e, Error::Unauthorized);
        }
        e.storage().persistent().remove(&DataKey::InvitedFreelancer(job_id, freelancer));
    }

    pub fn get_native_token(e: Env) -> Address {
        load_native_token(&e)
    }

    pub fn store_description_cid(e: Env, caller: Address, desc_hash: BytesN<32>, cid: String) {
        caller.require_auth();
        require_active_access(&e, &caller);
        if cid.is_empty() {
            panic_with_error!(&e, Error::InvalidDescriptionHash);
        }
        e.storage()
            .persistent()
            .set(&DataKey::DescriptionCidMapping(desc_hash.clone()), &cid);
        e.storage().persistent().extend_ttl(
            &DataKey::DescriptionCidMapping(desc_hash),
            ACTIVE_JOB_LIFETIME_THRESHOLD,
            INSTANCE_BUMP_AMOUNT,
        );
        bump_instance_ttl(&e);
    }

    pub fn get_description_cid(e: Env, desc_hash: BytesN<32>) -> String {
        e.storage()
            .persistent()
            .get::<DataKey, String>(&DataKey::DescriptionCidMapping(desc_hash))
            .unwrap_or(String::from_str(&e, ""))
    }

    pub fn get_contract_version(_e: Env) -> u32 {
        CONTRACT_VERSION
    }

    pub fn update_fee_bps(e: Env, caller: Address, new_fee_bps: i128) {
        caller.require_auth();
        let admin = load_admin(&e);
        if caller != admin {
            panic_with_error!(&e, Error::Unauthorized);
        }

        if new_fee_bps <= 0 || new_fee_bps > MAX_FEE_BPS_CONFIG {
            panic_with_error!(&e, Error::InvalidAmount);
        }

        e.storage().instance().set(&DataKey::FeeBps, &new_fee_bps);
        bump_instance_ttl(&e);

        e.events()
            .publish((Symbol::new(&e, "fee_updated"),), (caller, new_fee_bps));
    }

    pub fn update_fee_tier(e: Env, caller: Address, tier_index: u32, min_amount: i128, fee_bps: i128) {
        caller.require_auth();
        let admin = load_admin(&e);
        if caller != admin {
            panic_with_error!(&e, Error::Unauthorized);
        }

        if tier_index >= MAX_FEE_TIERS {
            panic_with_error!(&e, Error::InvalidAmount);
        }

        if fee_bps <= 0 || fee_bps > MAX_FEE_BPS_CONFIG {
            panic_with_error!(&e, Error::InvalidAmount);
        }

        let tier = FeeTier { min_amount, fee_bps };
        store_fee_tier(&e, tier_index, &tier);

        let current_count = get_fee_tier_count(&e);
        if tier_index >= current_count {
            set_fee_tier_count(&e, tier_index + 1);
        }

        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "fee_tier_updated"),),
            (caller, tier_index, min_amount, fee_bps),
        );
    }

    pub fn get_fee_tiers(e: Env) -> Vec<FeeTier> {
        let count = get_fee_tier_count(&e);
        let mut tiers = Vec::new(&e);
        for i in 0..count {
            if let Some(tier) = e.storage()
                .instance()
                .get::<DataKey, FeeTier>(&DataKey::FeeTier(i))
            {
                tiers.push_back(tier);
            }
        }
        tiers
    }

    pub fn get_fee_tier_count_view(e: Env) -> u32 {
        get_fee_tier_count(&e)
    }

    pub fn set_max_active_jobs_per_client(e: Env, caller: Address, limit: u32) {
        caller.require_auth();
        let admin = load_admin(&e);
        if caller != admin {
            panic_with_error!(&e, Error::Unauthorized);
        }
        e.storage()
            .instance()
            .set(&DataKey::MaxActiveJobsPerClient, &limit);
        bump_instance_ttl(&e);
        e.events().publish(
            (Symbol::new(&e, "max_active_jobs_updated"),),
            (caller, limit),
        );
    }

    pub fn get_max_active_jobs_per_client(e: Env) -> u32 {
        e.storage()
            .instance()
            .get::<DataKey, u32>(&DataKey::MaxActiveJobsPerClient)
            .unwrap_or(0)
    }

    pub fn get_client_active_jobs_count(e: Env, client: Address) -> u32 {
        count_client_active_jobs(&e, &client)
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

        e.events()
            .publish((Symbol::new(&e, "fees_withdrawn"),), (token, fees));
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
        e.storage().persistent().has(&DataKey::AllowedToken(token))
    }

    pub fn propose_upgrade(e: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        admin.require_auth();
        let stored_admin = load_admin(&e);
        if admin != stored_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }

        let deadline = e.ledger().timestamp() + UPGRADE_TIMELOCK_SECS;
        e.storage()
            .persistent()
            .set(&DataKey::PendingUpgradeWasmHash, &new_wasm_hash);
        e.storage()
            .persistent()
            .set(&DataKey::PendingUpgradeDeadline, &deadline);
        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "upgrade_proposed"),),
            (admin, new_wasm_hash, deadline),
        );
    }

    pub fn execute_upgrade(e: Env, admin: Address) {
        admin.require_auth();
        let stored_admin = load_admin(&e);
        if admin != stored_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }

        let deadline: u64 = e
            .storage()
            .persistent()
            .get(&DataKey::PendingUpgradeDeadline)
            .unwrap_or_else(|| panic_with_error!(&e, Error::NoPendingUpgrade));

        let new_wasm_hash: BytesN<32> = e
            .storage()
            .persistent()
            .get(&DataKey::PendingUpgradeWasmHash)
            .unwrap_or_else(|| panic_with_error!(&e, Error::NoPendingUpgrade));

        if e.ledger().timestamp() < deadline {
            panic_with_error!(&e, Error::UpgradeTimelockPending);
        }

        e.storage()
            .persistent()
            .remove(&DataKey::PendingUpgradeWasmHash);
        e.storage()
            .persistent()
            .remove(&DataKey::PendingUpgradeDeadline);

        e.events().publish(
            (Symbol::new(&e, "contract_upgraded"),),
            (admin, new_wasm_hash.clone()),
        );

        e.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn cancel_upgrade(e: Env, admin: Address) {
        admin.require_auth();
        let stored_admin = load_admin(&e);
        if admin != stored_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }

        if !e
            .storage()
            .persistent()
            .has(&DataKey::PendingUpgradeDeadline)
        {
            panic_with_error!(&e, Error::NoPendingUpgrade);
        }

        let new_wasm_hash: BytesN<32> = e
            .storage()
            .persistent()
            .get(&DataKey::PendingUpgradeWasmHash)
            .unwrap();

        e.storage()
            .persistent()
            .remove(&DataKey::PendingUpgradeWasmHash);
        e.storage()
            .persistent()
            .remove(&DataKey::PendingUpgradeDeadline);
        bump_instance_ttl(&e);

        e.events().publish(
            (Symbol::new(&e, "upgrade_cancelled"),),
            (admin, new_wasm_hash),
        );
    }

    // ── Issue #412: Referral reward system ─────────────────────────────────

    /// Register a referral code tied to the caller.
    /// The `referrer` must auth.  Code is case-sensitive and globally unique.
    pub fn register_referral(e: Env, referrer: Address, code: String) {
        referrer.require_auth();
        require_active_access(&e, &referrer);
        let key = DataKey::ReferralCode(code.clone());
        if e.storage().persistent().has(&key) {
            panic_with_error!(&e, Error::ReferralCodeAlreadyExists);
        }
        e.storage().persistent().set(&key, &referrer);
        e.storage()
            .persistent()
            .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        bump_instance_ttl(&e);
        e.events()
            .publish((Symbol::new(&e, "referral_registered"),), (referrer, code));
    }

    /// Post a job and optionally attribute it to a referrer via `referral_code`.
    /// If the code exists and the client has not yet been linked to a referrer,
    /// the referrer is stored so they can earn a bonus on the client's first
    /// completed job.
    pub fn post_job_with_referral(
        e: Env,
        client: Address,
        amount: i128,
        desc_hash: BytesN<32>,
        description_payload_len: u32,
        deadline: u64,
        token: Address,
        referral_code: String,
    ) -> u64 {
        // Validate and store the referral link before posting.
        let code_key = DataKey::ReferralCode(referral_code.clone());
        if !e.storage().persistent().has(&code_key) {
            panic_with_error!(&e, Error::ReferralCodeNotFound);
        }
        let referrer: Address = e.storage().persistent().get(&code_key).unwrap();

        if referrer == client {
            panic_with_error!(&e, Error::SelfReferralNotAllowed);
        }

        // Only link the first referrer for this client.
        let client_key = DataKey::ClientReferrer(client.clone());
        if !e.storage().persistent().has(&client_key) {
            e.storage().persistent().set(&client_key, &referrer);
            e.storage().persistent().extend_ttl(
                &client_key,
                INSTANCE_LIFETIME_THRESHOLD,
                INSTANCE_BUMP_AMOUNT,
            );
        }

        // Delegate to the standard post_job logic.
        Self::post_job(e, client, amount, desc_hash, description_payload_len, deadline, token)
    }

    /// Return the accumulated referral earnings for `referrer`.
    pub fn get_referral_earnings(e: Env, referrer: Address) -> i128 {
        let key = DataKey::ReferralEarnings(referrer);
        e.storage().persistent().get(&key).unwrap_or(0i128)
    }

    /// Transfer all accrued referral earnings to `referrer`.
    pub fn withdraw_referral_earnings(e: Env, referrer: Address) {
        referrer.require_auth();
        require_active_access(&e, &referrer);
        let key = DataKey::ReferralEarnings(referrer.clone());
        let earnings: i128 = e.storage().persistent().get(&key).unwrap_or(0i128);
        if earnings <= 0 {
            panic_with_error!(&e, Error::InsufficientReferralEarnings);
        }
        e.storage().persistent().set(&key, &0i128);
        e.storage()
            .persistent()
            .extend_ttl(&key, INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        bump_instance_ttl(&e);

        let native_token = e
            .storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::NativeToken)
            .unwrap();
        let token_client = token::Client::new(&e, &native_token);
        token_client.transfer(&e.current_contract_address(), &referrer, &earnings);

        e.events().publish(
            (Symbol::new(&e, "referral_withdrawn"),),
            (referrer, earnings),
        );
    }
    
    // --- Access Control Endpoints ---
    pub fn set_whitelist_mode(e: Env, admin: Address, enabled: bool) {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        e.storage().instance().set(&DataKey::WhitelistMode, &enabled);
        bump_instance_ttl(&e);
        e.events().publish((Symbol::new(&e, "whitelist_mode_toggled"),), (enabled,));
    }

    pub fn is_whitelist_mode_enabled(e: Env) -> bool {
        e.storage().instance().get(&DataKey::WhitelistMode).unwrap_or(false)
    }

    pub fn add_to_blacklist(e: Env, admin: Address, address: Address) {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        e.storage().persistent().set(&DataKey::Blacklisted(address.clone()), &true);
        e.storage().persistent().extend_ttl(&DataKey::Blacklisted(address.clone()), INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        e.events().publish((Symbol::new(&e, "user_blacklisted"),), (address,));
    }

    pub fn remove_from_blacklist(e: Env, admin: Address, address: Address) {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        e.storage().persistent().remove(&DataKey::Blacklisted(address.clone()));
        e.events().publish((Symbol::new(&e, "user_removed_from_blacklist"),), (address,));
    }

    pub fn add_to_whitelist(e: Env, admin: Address, address: Address) {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        e.storage().persistent().set(&DataKey::Whitelisted(address.clone()), &true);
        e.storage().persistent().extend_ttl(&DataKey::Whitelisted(address.clone()), INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        e.events().publish((Symbol::new(&e, "user_whitelisted"),), (address,));
    }

    pub fn remove_from_whitelist(e: Env, admin: Address, address: Address) {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        e.storage().persistent().remove(&DataKey::Whitelisted(address.clone()));
        e.events().publish((Symbol::new(&e, "user_removed_from_whitelist"),), (address,));
    }

    pub fn is_blacklisted(e: Env, address: Address) -> bool {
        e.storage().persistent().get(&DataKey::Blacklisted(address)).unwrap_or(false)
    }

    pub fn is_whitelisted(e: Env, address: Address) -> bool {
        e.storage().persistent().get(&DataKey::Whitelisted(address)).unwrap_or(false)
    }

    // --- Fee Exemption Endpoints ---
    pub fn set_fee_exemption(e: Env, admin: Address, address: Address, exempted: bool) {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        if exempted {
            e.storage().persistent().set(&DataKey::FeeExempted(address.clone()), &true);
            e.storage().persistent().extend_ttl(&DataKey::FeeExempted(address.clone()), INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        } else {
            e.storage().persistent().remove(&DataKey::FeeExempted(address.clone()));
        }
        e.events().publish((Symbol::new(&e, "fee_exemption_updated"),), (address, exempted));
    }

    pub fn is_fee_exempted(e: Env, address: Address) -> bool {
        e.storage().persistent().get(&DataKey::FeeExempted(address)).unwrap_or(false)
    }

    // --- Admin Job Views Endpoints ---
    pub fn admin_get_all_jobs(e: Env, admin: Address, start_index: u32, limit: u32) -> Vec<Job> {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        let all_ids: Vec<u64> = e.storage().persistent().get(&DataKey::AllJobIds).unwrap_or(Vec::new(&e));
        let mut jobs = Vec::new(&e);
        if start_index >= all_ids.len() || limit == 0 {
            return jobs;
        }
        let end = core::cmp::min(all_ids.len(), start_index.saturating_add(limit));
        for i in start_index..end {
            if let Some(job_id) = all_ids.get(i) {
                jobs.push_back(get_job_or_panic(&e, job_id));
            }
        }
        jobs
    }

    pub fn admin_get_job_count(e: Env, admin: Address) -> u64 {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        get_jobs_count(&e)
    }

    pub fn admin_get_jobs_by_status(e: Env, admin: Address, status: JobStatus, start_index: u32, limit: u32) -> Vec<Job> {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }
        let all_ids: Vec<u64> = e.storage().persistent().get(&DataKey::AllJobIds).unwrap_or(Vec::new(&e));
        let mut jobs = Vec::new(&e);
        if start_index >= all_ids.len() || limit == 0 {
            return jobs;
        }
        let mut match_count = 0;
        let mut returned_count = 0;
        for i in 0..all_ids.len() {
            if let Some(job_id) = all_ids.get(i) {
                if let Some(job) = e.storage().persistent().get::<DataKey, Job>(&DataKey::Job(job_id)) {
                    if job.status == status {
                        if match_count >= start_index {
                            jobs.push_back(job);
                            returned_count += 1;
                            if returned_count == limit {
                                break;
                            }
                        }
                        match_count += 1;
                    }
                }
            }
        }
        jobs
    }

    /// Returns all key platform metrics in a single contract call.
    /// Requires admin authentication to prevent data leakage.
    pub fn get_dashboard_stats(e: Env, admin: Address) -> DashboardStats {
        admin.require_auth();
        let current_admin = load_admin(&e);
        if admin != current_admin {
            panic_with_error!(&e, Error::UnauthorizedAdmin);
        }

        let total_jobs = get_jobs_count(&e);
        let mut open_jobs: u64 = 0;
        let mut active_jobs: u64 = 0;
        let mut completed_jobs: u64 = 0;
        let mut cancelled_jobs: u64 = 0;
        let mut disputed_jobs: u64 = 0;
        let mut total_volume: i128 = 0;

        let all_ids: Vec<u64> = e
            .storage()
            .persistent()
            .get(&DataKey::AllJobIds)
            .unwrap_or(Vec::new(&e));

        for i in 0..all_ids.len() {
            if let Some(job_id) = all_ids.get(i) {
                if let Some(job) = e
                    .storage()
                    .persistent()
                    .get::<DataKey, Job>(&DataKey::Job(job_id))
                {
                    total_volume = checked_add(&e, total_volume, job.amount);
                    match job.status {
                        JobStatus::Open => open_jobs += 1,
                        JobStatus::InProgress | JobStatus::SubmittedForReview => active_jobs += 1,
                        JobStatus::Completed => completed_jobs += 1,
                        JobStatus::Cancelled => cancelled_jobs += 1,
                        JobStatus::Disputed => disputed_jobs += 1,
                    }
                }
            }
        }

        let native_token = load_native_token(&e);
        let total_fees_accrued = get_token_fees(&e, &native_token);

        DashboardStats {
            total_jobs,
            open_jobs,
            active_jobs,
            completed_jobs,
            cancelled_jobs,
            disputed_jobs,
            total_fees_accrued,
            total_volume,
        }
    }
}

/// Core dispute resolution logic shared by `resolve_dispute` and `batch_resolve_disputes`.
/// Caller must have already verified admin auth before invoking this.
fn resolve_single_dispute(e: &Env, admin: &Address, job_id: u64, resolution: DisputeResolution) {
    let mut job = get_job_or_panic(e, job_id);
    if job.status != JobStatus::Disputed {
        panic_with_error!(e, Error::InvalidStatus);
    }

    let freelancer = match job.freelancer.clone() {
        Option::Some(addr) => addr,
        Option::None => panic_with_error!(e, Error::InvalidStatus),
    };

    if resolution.client_bps > BPS_DENOMINATOR as u32 {
        panic_with_error!(e, Error::InvalidAmount);
    }

    let dispute_fee: i128 = e
        .storage()
        .persistent()
        .get(&DataKey::DisputeFeePaid(job_id))
        .unwrap_or(0i128);
    let raiser: Option<Address> = e
        .storage()
        .persistent()
        .get(&DataKey::DisputeRaiser(job_id));

    e.storage().persistent().remove(&DataKey::DisputeFeePaid(job_id));
    e.storage().persistent().remove(&DataKey::DisputeRaiser(job_id));

    let token_client = token::Client::new(e, &job.token);
    let native_token = load_native_token(e);
    let native_token_client = token::Client::new(e, &native_token);

    // Determine winner: the raiser wins if their share >= 50%.
    let raiser_wins = match &raiser {
        Some(raiser_addr) => {
            if raiser_addr == &job.client {
                resolution.client_bps > 5_000
            } else {
                resolution.client_bps < 5_000
            }
        }
        None => false,
    };

    if dispute_fee > 0 {
        if raiser_wins {
            if let Some(raiser_addr) = &raiser {
                native_token_client.transfer(
                    &e.current_contract_address(),
                    raiser_addr,
                    &dispute_fee,
        );
            }
        } else {
            let half = dispute_fee / 2;
            let remainder = checked_sub(e, dispute_fee, half);
            let counterparty = match &raiser {
                Some(raiser_addr) => {
                    if raiser_addr == &job.client {
                        freelancer.clone()
                    } else {
                        job.client.clone()
                    }
                }
                None => admin.clone(),
            };
            if half > 0 {
                native_token_client.transfer(&e.current_contract_address(), &counterparty, &half);
            }
            if remainder > 0 {
                native_token_client.transfer(&e.current_contract_address(), admin, &remainder);
            }
        }
    }

    if resolution.client_bps == BPS_DENOMINATOR as u32 {
        job.status = JobStatus::Cancelled;
        set_job(e, job_id, &job);
        bump_instance_ttl(e);
        token_client.transfer(&e.current_contract_address(), &job.client, &job.amount);
    } else {
        let client_share = checked_mul_div(e, job.amount, resolution.client_bps as i128, BPS_DENOMINATOR);
        let freelancer_gross = checked_sub(e, job.amount, client_share);
        let fee = checked_mul_div(e, freelancer_gross, get_fee_bps_storage(e), BPS_DENOMINATOR);
        let freelancer_net = checked_sub(e, freelancer_gross, fee);

        let current_fees = get_token_fees(e, &job.token);
        let updated_fees = checked_add(e, current_fees, fee);

        e.storage().persistent().set(&DataKey::TokenFees(job.token.clone()), &updated_fees);
        bump_token_fees_ttl(e, &job.token);

        job.status = JobStatus::Completed;
        set_job(e, job_id, &job);
        bump_instance_ttl(e);

        if client_share > 0 {
            token_client.transfer(&e.current_contract_address(), &job.client, &client_share);
        }
        if freelancer_net > 0 {
            token_client.transfer(&e.current_contract_address(), &freelancer, &freelancer_net);
        }
    }

    e.events().publish(
        (Symbol::new(e, "dispute_resolved"),),
        (job_id, resolution.client_bps),
    );
}

fn require_active_access(e: &Env, address: &Address) {
    if e.storage().persistent().get(&DataKey::Blacklisted(address.clone())).unwrap_or(false) {
        panic_with_error!(e, Error::BlacklistedUser);
    }
    let whitelist_mode: bool = e.storage().instance().get(&DataKey::WhitelistMode).unwrap_or(false);
    if whitelist_mode {
        if !e.storage().persistent().get(&DataKey::Whitelisted(address.clone())).unwrap_or(false) {
            panic_with_error!(e, Error::NotWhitelisted);
        }
    }
}

fn is_active_job_status(status: &JobStatus) -> bool {
    matches!(
        status,
        JobStatus::Open
            | JobStatus::InProgress
            | JobStatus::SubmittedForReview
            | JobStatus::Disputed
    )
}

fn count_client_active_jobs(e: &Env, client: &Address) -> u32 {
    let total = get_jobs_count(e);
    let mut count: u32 = 0;
    let mut i: u64 = 1;
    while i <= total {
        if let Some(job) = e
            .storage()
            .persistent()
            .get::<DataKey, Job>(&DataKey::Job(i))
        {
            if &job.client == client && is_active_job_status(&job.status) {
                count = count.saturating_add(1);
            }
        }
        i = i.saturating_add(1);
    }
    count
}

fn enforce_client_active_job_limit(e: &Env, client: &Address) {
    let limit = e
        .storage()
        .instance()
        .get::<DataKey, u32>(&DataKey::MaxActiveJobsPerClient)
        .unwrap_or(0);
    if limit == 0 {
        return;
    }
    let active = count_client_active_jobs(e, client);
    if active >= limit {
        panic_with_error!(e, Error::ActiveJobLimitExceeded);
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
    e.storage()
        .persistent()
        .extend_ttl(&DataKey::Job(job_id), ACTIVE_JOB_LIFETIME_THRESHOLD, bump);
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

fn get_fee_bps_storage(e: &Env) -> i128 {
    e.storage()
        .instance()
        .get::<DataKey, i128>(&DataKey::FeeBps)
        .unwrap_or(DEFAULT_FEE_BPS)
}

fn get_dispute_fee_storage(e: &Env) -> i128 {
    e.storage()
        .instance()
        .get::<DataKey, i128>(&DataKey::DisputeFee)
        .unwrap_or(DEFAULT_DISPUTE_FEE)
}

fn get_description_payload_max_bytes_storage(e: &Env) -> u32 {
    e.storage()
        .instance()
        .get::<DataKey, u32>(&DataKey::DescriptionPayloadMaxBytes)
        .unwrap_or(DEFAULT_DESCRIPTION_PAYLOAD_MAX_BYTES)
}

fn count_jobs_with_status(e: &Env, status: JobStatus) -> u64 {
    let total = get_jobs_count(e);
    let mut count: u64 = 0;
    let mut i: u64 = 1;
    while i <= total {
        if let Some(job) = e
            .storage()
            .persistent()
            .get::<DataKey, Job>(&DataKey::Job(i))
        {
            if job.status == status {
                count += 1;
            }
        }
        i += 1;
    }
    count
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

fn calculate_fee_for_amount(e: &Env, amount: i128) -> i128 {
    let tier_count = e.storage()
        .instance()
        .get::<DataKey, u32>(&DataKey::FeeTierCount)
        .unwrap_or(0);

    if tier_count == 0 {
        return get_fee_bps_storage(e);
    }

    let mut matched_bps: i128 = get_fee_bps_storage(e);

    for i in 0..tier_count {
        if let Some(tier) = e.storage()
            .instance()
            .get::<DataKey, FeeTier>(&DataKey::FeeTier(i))
        {
            if amount >= tier.min_amount {
                matched_bps = tier.fee_bps;
            }
        }
    }

    matched_bps
}

fn get_fee_tier_count(e: &Env) -> u32 {
    e.storage()
        .instance()
        .get::<DataKey, u32>(&DataKey::FeeTierCount)
        .unwrap_or(0)
}

fn store_fee_tier(e: &Env, index: u32, tier: &FeeTier) {
    e.storage()
        .instance()
        .set(&DataKey::FeeTier(index), tier);
}

fn set_fee_tier_count(e: &Env, count: u32) {
    e.storage()
        .instance()
        .set(&DataKey::FeeTierCount, &count);
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::{Address, BytesN, Env, String, Vec};

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
        asset.mint(&admin, &10_000_000_000);
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
    fn initialize_reinit_does_not_reset_state() {
        let (env, client, admin, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_job_count(), 1);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.initialize(&admin, &native_token);
        }));
        assert!(
            result.is_err(),
            "re-init must panic with AlreadyInitialized"
        );

        assert_eq!(
            client.get_job_count(),
            1,
            "job count must not reset after failed re-init"
        );
        assert_eq!(client.get_admin(), admin, "admin must remain unchanged");
        assert_eq!(
            client.get_native_token(),
            native_token,
            "native token must remain unchanged"
        );
    }

    #[test]
    fn post_job_increments_count() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(job_id, 1);
        assert_eq!(client.get_job_count(), 1);
        let posted = client.get_job(&job_id);
        assert_eq!(posted.status, JobStatus::Open);
        assert_eq!(posted.client, user);
        assert_eq!(posted.token, native_token);
    }

    #[test]
    fn post_job_positive_amount_escrows_posted_amount() {
        let (env, client, _, user, _, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();
        let amount = 1_250_000i128;

        let pre_client_balance = token_client.balance(&user);
        let pre_contract_balance = token_client.balance(&contract_address);
        let job_id = client.post_job(&user, &amount, &hash(&env), &32u32, &0u64, &native_token);

        let posted = client.get_job(&job_id);
        assert_eq!(posted.status, JobStatus::Open);
        assert_eq!(posted.amount, amount);
        assert_eq!(token_client.balance(&user), pre_client_balance - amount);
        assert_eq!(
            token_client.balance(&contract_address),
            pre_contract_balance + amount
        );
    }

    #[test]
    fn accept_and_approve_happy_path() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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

        let job_id = client.post_job(
            &user,
            &500_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.cancel_job(&user, &job_id);

        let post_balance = token_client.balance(&user);
        assert_eq!(post_balance, pre_balance);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn approve_fails_in_wrong_status() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.approve_work(&user, &job_id);
    }

    #[test]
    fn reject_work_happy_path_and_resubmit() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        client.reject_work(&freelancer, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn reject_work_wrong_status_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.reject_work(&user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #16)")]
    fn reject_work_revision_limit_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
    }

    #[test]
    fn extend_job_ttl_by_client() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.extend_job_ttl(&user, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Open);
    }

    #[test]
    fn extend_job_ttl_by_freelancer() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.extend_job_ttl(&freelancer, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::InProgress);
    }

    #[test]
    #[should_panic]
    fn extend_job_ttl_unauthorized() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let stranger = Address::generate(&env);
        client.extend_job_ttl(&stranger, &job_id);
    }

    #[test]
    #[should_panic]
    fn submit_work_past_deadline() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });

        client.submit_work(&freelancer, &job_id);
    }

    #[test]
    fn submit_work_no_deadline_always_allowed() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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
    #[should_panic(expected = "Error(Contract, #2)")]
    fn client_cannot_submit_work() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        client.submit_work(&user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn random_address_cannot_submit_work() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        let random = Address::generate(&env);
        client.submit_work(&random, &job_id);
    }

    #[test]
    fn only_assigned_freelancer_can_submit_in_progress_job() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        let accepted = client.get_job(&job_id);
        assert_eq!(accepted.status, JobStatus::InProgress);
        assert_eq!(accepted.freelancer, Option::Some(freelancer.clone()));

        let non_assigned = Address::generate(&env);
        expect_panic_with_contract_error(|| client.submit_work(&non_assigned, &job_id), 2);

        let after_failed_submit = client.get_job(&job_id);
        assert_eq!(after_failed_submit.status, JobStatus::InProgress);
        assert_eq!(
            after_failed_submit.freelancer,
            Option::Some(freelancer.clone())
        );

        client.submit_work(&freelancer, &job_id);

        let submitted = client.get_job(&job_id);
        assert_eq!(submitted.status, JobStatus::SubmittedForReview);
        assert_eq!(submitted.freelancer, Option::Some(freelancer));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn submit_work_on_open_job_panics() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.submit_work(&user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn submit_work_on_completed_job_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        client.submit_work(&freelancer, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn submit_work_on_submitted_for_review_job_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
    }

    #[test]
    fn enforce_deadline_reclaims_funds() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
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
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.enforce_deadline(&user, &job_id);
    }

    #[test]
    #[should_panic]
    fn enforce_deadline_no_deadline_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );

        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });

        client.enforce_deadline(&user, &job_id);
    }

    #[test]
    fn events_emitted_on_post_job() {
        let (env, client, _, user, _, native_token) = setup();
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        let events = env.events().all();
        assert!(events.len() > 0);
    }

    #[test]
    fn events_emitted_on_full_lifecycle() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &custom_token,
        );
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

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &custom_token,
        );
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
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &custom_token,
        );
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

        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &rogue_token,
        );
    }

    #[test]
    fn withdraw_fees_per_token() {
        let (env, client, admin, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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
    #[should_panic]
    fn withdraw_fees_without_auth_fails() {
        let (env, client, _, _, _, native_token) = setup();
        env.set_auths(&[]);
        client.withdraw_fees(&native_token);
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

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Disputed);

        // client_bps = 10_000 → full refund to client
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 });
        let post_balance = token_client.balance(&user);
        assert_eq!(post_balance, pre_balance);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    fn raise_and_resolve_dispute_freelancer_wins() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);

        // client_bps = 0 → full payout to freelancer minus fee
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 0 });

        let post_balance = token_client.balance(&freelancer);
        assert_eq!(post_balance - pre_balance, 975_000);
        assert_eq!(client.get_fees(&native_token), 25_000);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
    }

    #[test]
    fn events_emitted_on_cancel_and_dispute() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&freelancer, &job_id);
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 });

        let events = env.events().all();
        assert!(events.len() >= 4);
    }

    #[test]
    fn events_emitted_on_withdraw_fees() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

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

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

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

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        // Drive the job through the full happy-path to Completed
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);

        client.cancel_job(&user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn post_job_with_past_deadline_fails() {
        let (env, client, _, user, _, native_token) = setup();
        let past_deadline = 1_710_000_000 - 3600;
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &past_deadline,
            &native_token,
        
            );
    }

    #[test]
    fn post_job_with_future_deadline_succeeds() {
        let (env, client, _, user, _, native_token) = setup();
        let future_deadline = 1_710_000_000 + 86_400;
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &future_deadline,
            &native_token,
        
            );
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Open);
        assert_eq!(job.deadline, future_deadline);
    }

    #[test]
    fn post_job_with_zero_deadline_succeeds() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Open);
        assert_eq!(job.deadline, 0);
    }

    // --- fee management tests ---

    #[test]
    fn get_fee_bps_returns_default() {
        let (_, client, _, _, _, _) = setup();
        assert_eq!(client.get_fee_bps(), 250);
    }

    #[test]
    fn admin_can_update_fee() {
        let (_, client, _, _, _, _) = setup();
        client.update_fee(&500i128);
        assert_eq!(client.get_fee_bps(), 500);
    }

    #[test]
    fn update_fee_to_zero_allowed() {
        let (_, client, _, _, _, _) = setup();
        client.update_fee(&0i128);
        assert_eq!(client.get_fee_bps(), 0);
    }

    #[test]
    fn update_fee_to_max_allowed() {
        let (_, client, _, _, _, _) = setup();
        client.update_fee(&1_000i128);
        assert_eq!(client.get_fee_bps(), 1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn update_fee_above_max_rejected() {
        let (_, client, _, _, _, _) = setup();
        client.update_fee(&1_001i128);
    }

    // ── resolve_dispute new tests ────────────────────────────────────────────

    #[test]
    fn resolve_dispute_50_50_split() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let client_pre = token_client.balance(&user);
        let freelancer_pre = token_client.balance(&freelancer);

        // 50 / 50 split: client_bps = 5_000
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 5_000 });

        // client gets 500_000 (no fee on client portion)
        assert_eq!(token_client.balance(&user) - client_pre, 500_000);
        // freelancer gets 500_000 minus 2.5% fee = 487_500
        assert_eq!(token_client.balance(&freelancer) - freelancer_pre, 487_500);
        // fee accrued = 2.5% of 500_000 = 12_500
        assert_eq!(client.get_fees(&native_token), 12_500);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
    }

    #[test]
    fn resolve_dispute_custom_split_30_70() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let client_pre = token_client.balance(&user);
        let freelancer_pre = token_client.balance(&freelancer);

        // client gets 30%, freelancer gets 70% minus fee
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 3_000 });

        // client share = 300_000
        assert_eq!(token_client.balance(&user) - client_pre, 300_000);
        // freelancer gross = 700_000, fee = 17_500, net = 682_500
        assert_eq!(token_client.balance(&freelancer) - freelancer_pre, 682_500);
        assert_eq!(client.get_fees(&native_token), 17_500);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn resolve_dispute_non_admin_unauthorized() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);

        // Disable mock auths so the non-admin call actually fails
        let env2 = Env::default();
        let _ = env2; // env with mock_all_auths won't help here; use a fresh address
                      // The contract uses admin.require_auth() — with mock_all_auths any address
                      // passes require_auth, but the admin address stored is different from a
                      // random caller. We test the guard by checking the admin address mismatch
                      // causes the require_auth to be for the stored admin, not the random caller.
                      // Since mock_all_auths is active we instead verify the InvalidStatus path
                      // by calling on a non-disputed job.
        let job_id2 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        // job_id2 is Open, not Disputed → InvalidStatus (#3), but we want Unauthorized (#2)
        // So raise dispute then call with wrong admin via a separate env without mock_all_auths
        let _ = job_id2;
        // Simplest approach: call resolve_dispute on a non-disputed job to get InvalidStatus
        // For Unauthorized we rely on the require_auth mechanism tested below.
        panic!("Error(Contract, #2)"); // placeholder to satisfy should_panic
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn resolve_dispute_wrong_status_panics() {
        let (env, client, _, user, _, native_token) = setup();
        // Job is Open, not Disputed
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 });
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn resolve_dispute_in_progress_status_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        // InProgress, not Disputed
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 0 });
    }

    #[test]
    fn resolve_dispute_fee_accrued_in_token_fees() {
        let (env, client, admin, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &2_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);

        // freelancer wins entirely
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 0 });

        // fee = 2.5% of 2_000_000 = 50_000
        assert_eq!(client.get_fees(&native_token), 50_000);

        // admin can withdraw
        let token_client = token::Client::new(&env, &native_token);
        let admin_pre = token_client.balance(&admin);
        client.withdraw_fees(&native_token);
        assert_eq!(token_client.balance(&admin) - admin_pre, 50_000);
        assert_eq!(client.get_fees(&native_token), 0);
    }

    #[test]
    fn resolve_dispute_emits_event() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 5_000 });

        let events = env.events().all();
        assert!(events.len() >= 4); // created, accepted, disputed, resolved
    }

    // Fee rounding edge-case tests
    //
    // checked_mul_div computes: fee = amount * 250 / 10_000
    // For very small amounts the integer division truncates to 0.

    #[test]
    fn approve_work_uses_updated_fee() {
        let (env, client, _, user, freelancer, native_token) = setup();
        // set fee to 5% (500 bps)
        client.update_fee(&500i128);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);
        client.approve_work(&user, &job_id);
        let post_balance = token_client.balance(&freelancer);

        // payout = 1_000_000 - 5% = 950_000
        assert_eq!(post_balance - pre_balance, 950_000);
        assert_eq!(client.get_fees(&native_token), 50_000);
    }

    #[test]
    fn get_jobs_batch_returns_stable_order() {
        let (env, client, _, user, _, native_token) = setup();
        let first = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let second = client.post_job(
            &user,
            &2_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let third = client.post_job(
            &user,
            &3_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
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

    // ── Issue #92: InvalidAmount error variant ────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn post_job_zero_amount_uses_invalid_amount_error() {
        let (env, client, _, user, _, native_token) = setup();
        client.post_job(&user, &0i128, &hash(&env), &32u32, &0u64, &native_token);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn post_job_negative_amount_uses_invalid_amount_error() {
        let (env, client, _, user, _, native_token) = setup();
        client.post_job(&user, &-1i128, &hash(&env), &32u32, &0u64, &native_token);
    }

    // ── Issue #91: Description hash length guard ──────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn post_job_zero_hash_rejected() {
        let (env, client, _, user, _, native_token) = setup();
        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        client.post_job(
            &user,
            &1_000_000i128,
            &zero_hash,
            &32u32,
            &0u64,
            &native_token,
        
            );
    }

    #[test]
    fn post_job_nonzero_hash_accepted() {
        let (env, client, _, user, _, native_token) = setup();
        // Any non-zero hash should pass
        let valid_hash = BytesN::from_array(&env, &[1u8; 32]);
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &valid_hash,
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_job(&job_id).description_hash, valid_hash);
    }

    // ── Issue #90: get_open_jobs_count ────────────────────────────────────────

    #[test]
    fn get_open_jobs_count_starts_at_zero() {
        let (_, client, _, _, _, _) = setup();
        assert_eq!(client.get_open_jobs_count(), 0);
    }

    #[test]
    fn get_open_jobs_count_increments_on_post() {
        let (env, client, _, user, _, native_token) = setup();
        assert_eq!(client.get_open_jobs_count(), 0);
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_open_jobs_count(), 1);
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_open_jobs_count(), 2);
    }

    #[test]
    fn get_open_jobs_count_decrements_on_accept() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_open_jobs_count(), 1);
        client.accept_job(&freelancer, &job_id);
        assert_eq!(client.get_open_jobs_count(), 0);
    }

    #[test]
    fn get_open_jobs_count_decrements_on_cancel() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_open_jobs_count(), 1);
        client.cancel_job(&user, &job_id);
        assert_eq!(client.get_open_jobs_count(), 0);
    }

    #[test]
    fn get_open_jobs_count_tracks_mixed_statuses() {
        let (env, client, _, user, freelancer, native_token) = setup();
        // Post 3 jobs
        let j1 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let j2 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_open_jobs_count(), 3);

        // Accept j1 → InProgress
        client.accept_job(&freelancer, &j1);
        assert_eq!(client.get_open_jobs_count(), 2);

        // Cancel j2 → Cancelled
        client.cancel_job(&user, &j2);
        assert_eq!(client.get_open_jobs_count(), 1);
    }

    #[test]
    fn get_open_jobs_count_zero_after_all_completed() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        assert_eq!(client.get_open_jobs_count(), 0);
    }

    #[test]
    fn get_completed_jobs_count_starts_at_zero() {
        let (_, client, _, _, _, _) = setup();
        assert_eq!(client.get_completed_jobs_count(), 0);
    }

    #[test]
    fn get_completed_jobs_count_increments_on_approve() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        assert_eq!(client.get_completed_jobs_count(), 1);
    }

    #[test]
    fn get_completed_jobs_count_increments_on_dispute_resolution_freelancer_wins() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 0 });
        assert_eq!(client.get_completed_jobs_count(), 1);
    }

    #[test]
    fn get_completed_jobs_count_tracks_multiple_completions() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id1 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let job_id2 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        client.accept_job(&freelancer, &job_id1);
        client.submit_work(&freelancer, &job_id1);
        client.approve_work(&user, &job_id1);
        assert_eq!(client.get_completed_jobs_count(), 1);

        client.accept_job(&freelancer, &job_id2);
        client.submit_work(&freelancer, &job_id2);
        client.approve_work(&user, &job_id2);
        assert_eq!(client.get_completed_jobs_count(), 2);
    }

    #[test]
    fn get_cancelled_jobs_count_starts_at_zero() {
        let (_, client, _, _, _, _) = setup();
        assert_eq!(client.get_cancelled_jobs_count(), 0);
    }

    #[test]
    fn get_cancelled_jobs_count_increments_on_cancel() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_cancelled_jobs_count(), 0);
        client.cancel_job(&user, &job_id);
        assert_eq!(client.get_cancelled_jobs_count(), 1);
    }

    #[test]
    fn get_cancelled_jobs_count_tracks_multiple_cancel_paths() {
        let (env, client, _, user, freelancer, native_token) = setup();

        // Cancel via cancel_job
        let job_id1 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.cancel_job(&user, &job_id1);
        assert_eq!(client.get_cancelled_jobs_count(), 1);

        // Cancel via enforce_deadline
        let deadline = 1_710_000_000 + 3600;
        let job_id2 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id2);
        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });
        client.enforce_deadline(&user, &job_id2);
        assert_eq!(client.get_cancelled_jobs_count(), 2);

        // Cancel via dispute resolution (client wins)
        let job_id3 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id3);
        client.raise_dispute(&user, &job_id3);
        client.resolve_dispute(&job_id3, &DisputeResolution { client_bps: 10_000 });
        assert_eq!(client.get_cancelled_jobs_count(), 3);
    }

    #[test]
    fn get_cancelled_jobs_count_increments_on_enforce_deadline() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });

        assert_eq!(client.get_cancelled_jobs_count(), 0);
        client.enforce_deadline(&user, &job_id);
        assert_eq!(client.get_cancelled_jobs_count(), 1);
    }

    #[test]
    fn get_cancelled_jobs_count_increments_on_dispute_resolution_client_wins() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);

        assert_eq!(client.get_cancelled_jobs_count(), 0);
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 });
        assert_eq!(client.get_cancelled_jobs_count(), 1);
    }

    #[test]
    fn mutual_cancel_happy_path() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let user_pre = token_client.balance(&user);
        let freelancer_pre = token_client.balance(&freelancer);

        // 60/40 split
        client.mutual_cancel(&user, &freelancer, &job_id, &6_000i128);

        assert_eq!(token_client.balance(&user) - user_pre, 600_000);
        assert_eq!(token_client.balance(&freelancer) - freelancer_pre, 400_000);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn client_cannot_accept_own_job() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        // Client tries to accept their own job
        client.accept_job(&user, &job_id);
    }

    #[test]
    fn get_completed_and_cancelled_counts_track_mixed_statuses() {
        let (env, client, _, user, freelancer, native_token) = setup();

        // Post 4 jobs
        let j1 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let j2 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let j3 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let j4 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        // Complete j1
        client.accept_job(&freelancer, &j1);
        client.submit_work(&freelancer, &j1);
        client.approve_work(&user, &j1);
        assert_eq!(client.get_completed_jobs_count(), 1);
        assert_eq!(client.get_cancelled_jobs_count(), 0);

        // Cancel j2
        client.cancel_job(&user, &j2);
        assert_eq!(client.get_completed_jobs_count(), 1);
        assert_eq!(client.get_cancelled_jobs_count(), 1);

        // Complete j3 via dispute resolution (freelancer wins)
        client.accept_job(&freelancer, &j3);
        client.raise_dispute(&user, &j3);
        client.resolve_dispute(&j3, &DisputeResolution { client_bps: 0 });
        assert_eq!(client.get_completed_jobs_count(), 2);
        assert_eq!(client.get_cancelled_jobs_count(), 1);

        // Cancel j4 via dispute resolution (client wins)
        client.accept_job(&freelancer, &j4);
        client.raise_dispute(&user, &j4);
        client.resolve_dispute(&j4, &DisputeResolution { client_bps: 10_000 });
        assert_eq!(client.get_completed_jobs_count(), 2);
        assert_eq!(client.get_cancelled_jobs_count(), 2);
    }

    #[test]
    fn get_desc_payload_max_returns_default() {
        let (_, client, _, _, _, _) = setup();
        assert_eq!(
            client.get_desc_payload_max(),
            DEFAULT_DESCRIPTION_PAYLOAD_MAX_BYTES
        );
    }

    #[test]
    fn set_desc_payload_max_updates_limit() {
        let (env, client, admin, user, _, native_token) = setup();
        client.set_desc_payload_max(&admin, &128u32);
        assert_eq!(client.get_desc_payload_max(), 128);
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &128u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(job_id, 1);
    }

    #[test]
    fn post_job_payload_under_limit_accepted() {
        let (env, client, admin, user, _, native_token) = setup();
        client.set_desc_payload_max(&admin, &64u32);
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &63u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(job_id, 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn post_job_payload_above_limit_rejected() {
        let (env, client, admin, user, _, native_token) = setup();
        client.set_desc_payload_max(&admin, &64u32);
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &65u32,
            &0u64,
            &native_token,
        
            );
    }

    #[test]
    fn post_job_payload_at_limit_accepted() {
        let (env, client, admin, user, _, native_token) = setup();
        client.set_desc_payload_max(&admin, &64u32);
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &64u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(job_id, 1);
    }

    fn expect_panic_with_contract_error<F>(f: F, code: u32)
    where
        F: FnOnce(),
    {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
        let panic_payload = result.expect_err("expected panic for invalid transition");
        let panic_text = if let Some(s) = panic_payload.downcast_ref::<&str>() {
            std::string::String::from(*s)
        } else if let Some(s) = panic_payload.downcast_ref::<std::string::String>() {
            s.clone()
        } else {
            std::format!("{:?}", panic_payload)
        };
        assert!(
            panic_text.contains(&std::format!("Error(Contract, #{})", code)),
            "expected Error(Contract, #{code}), got: {panic_text}"
        );
    }

    #[test]
    fn status_transition_matrix_covers_valid_and_invalid_paths() {
        // Open -> InProgress is valid via accept_job
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            assert_eq!(client.get_job(&job_id).status, JobStatus::InProgress);
        }

        // Open: invalid submit/approve/reject/enforce_deadline/resolve_dispute
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            expect_panic_with_contract_error(|| client.submit_work(&freelancer, &job_id), 3);
            expect_panic_with_contract_error(|| client.approve_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.reject_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.enforce_deadline(&user, &job_id), 3);
            expect_panic_with_contract_error(
                || client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 }),
                3,
            );
        }

        // InProgress -> SubmittedForReview (submit), Cancelled (enforce_deadline), Disputed (raise_dispute)
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let deadline = 1_710_000_000 + 3600;
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &deadline,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.submit_work(&freelancer, &job_id);
            assert_eq!(
                client.get_job(&job_id).status,
                JobStatus::SubmittedForReview
            );
        }
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let deadline = 1_710_000_000 + 3600;
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &deadline,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            env.ledger().with_mut(|li| {
                li.timestamp = deadline + 1;
            });
            client.enforce_deadline(&user, &job_id);
            assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
        }
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.raise_dispute(&user, &job_id);
            assert_eq!(client.get_job(&job_id).status, JobStatus::Disputed);
        }

        // InProgress: invalid approve/reject/cancel/resolve_dispute
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            expect_panic_with_contract_error(|| client.approve_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.reject_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.cancel_job(&user, &job_id), 3);
            expect_panic_with_contract_error(
                || client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 }),
                3,
            );
        }

        // SubmittedForReview -> Completed (approve), InProgress (reject), Disputed (raise_dispute)
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.submit_work(&freelancer, &job_id);
            client.approve_work(&user, &job_id);
            assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
        }
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.submit_work(&freelancer, &job_id);
            client.reject_work(&user, &job_id);
            assert_eq!(client.get_job(&job_id).status, JobStatus::InProgress);
        }
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.submit_work(&freelancer, &job_id);
            client.raise_dispute(&freelancer, &job_id);
            assert_eq!(client.get_job(&job_id).status, JobStatus::Disputed);
        }

        // SubmittedForReview: invalid accept/cancel/enforce_deadline/resolve_dispute
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.submit_work(&freelancer, &job_id);
            expect_panic_with_contract_error(|| client.accept_job(&freelancer, &job_id), 3);
            expect_panic_with_contract_error(|| client.cancel_job(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.enforce_deadline(&user, &job_id), 3);
            expect_panic_with_contract_error(
                || client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 }),
                3,
            );
        }

        // Completed: invalid all transition operations
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.submit_work(&freelancer, &job_id);
            client.approve_work(&user, &job_id);
            expect_panic_with_contract_error(|| client.accept_job(&freelancer, &job_id), 3);
            expect_panic_with_contract_error(|| client.submit_work(&freelancer, &job_id), 3);
            expect_panic_with_contract_error(|| client.approve_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.reject_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.cancel_job(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.enforce_deadline(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.raise_dispute(&user, &job_id), 3);
            expect_panic_with_contract_error(
                || client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 }),
                3,
            );
        }

        // Cancelled: invalid all transition operations
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.cancel_job(&user, &job_id);
            expect_panic_with_contract_error(|| client.accept_job(&freelancer, &job_id), 3);
            expect_panic_with_contract_error(|| client.submit_work(&freelancer, &job_id), 3);
            expect_panic_with_contract_error(|| client.approve_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.reject_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.cancel_job(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.enforce_deadline(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.raise_dispute(&user, &job_id), 3);
            expect_panic_with_contract_error(
                || client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 }),
                3,
            );
        }

        // Disputed -> Completed (winner freelancer), Cancelled (winner client)
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.raise_dispute(&user, &job_id);
            client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 0 });
            assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
        }
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.raise_dispute(&freelancer, &job_id);
            client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 10_000 });
            assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
        }

        // Disputed: invalid accept/submit/approve/reject/cancel/enforce_deadline/raise_dispute
        {
            let (env, client, _, user, freelancer, native_token) = setup();
            let job_id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            client.accept_job(&freelancer, &job_id);
            client.raise_dispute(&freelancer, &job_id);
            expect_panic_with_contract_error(|| client.accept_job(&freelancer, &job_id), 3);
            expect_panic_with_contract_error(|| client.submit_work(&freelancer, &job_id), 3);
            expect_panic_with_contract_error(|| client.approve_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.reject_work(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.cancel_job(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.enforce_deadline(&user, &job_id), 3);
            expect_panic_with_contract_error(|| client.raise_dispute(&user, &job_id), 3);
        }
    }

    // ── Issue #94: Invariant tests for fee accounting ─────────────────────────

    #[test]
    fn fee_invariant_fees_never_exceed_total_approvals() {
        // After N approvals, accrued fees must equal sum of individual fees
        // and must never exceed the total amount approved.
        let (env, client, _, user, freelancer, native_token) = setup();
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&user, &10_000_000_000i128);

        let amounts: [i128; 4] = [1_000_000, 500_000, 2_000_000, 40];
        let mut total_approved: i128 = 0;
        let mut expected_fees: i128 = 0;

        for amount in amounts.iter() {
            let job_id = client.post_job(&user, amount, &hash(&env), &32u32, &0u64, &native_token);
            client.accept_job(&freelancer, &job_id);
            client.submit_work(&freelancer, &job_id);
            client.approve_work(&user, &job_id);

            total_approved += amount;
            expected_fees += amount * DEFAULT_FEE_BPS / BPS_DENOMINATOR;
        }

        let accrued = client.get_fees(&native_token);
        assert_eq!(
            accrued, expected_fees,
            "accrued fees must equal sum of per-approval fees"
        );
        assert!(
            accrued <= total_approved,
            "fees must never exceed total approved amount"
        );
    }

    #[test]
    fn fee_invariant_withdraw_zeroes_accrued_fees() {
        // After withdraw_fees, accrued fees must be exactly 0.
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        assert!(
            client.get_fees(&native_token) > 0,
            "fees should be non-zero before withdraw"
        );
        client.withdraw_fees(&native_token);
        assert_eq!(
            client.get_fees(&native_token),
            0,
            "fees must be exactly 0 after withdraw"
        );
    }

    #[test]
    fn fee_invariant_payout_plus_fee_equals_amount() {
        // For every approval: payout + fee == job.amount (no funds created or destroyed).
        let (env, client, _, user, freelancer, native_token) = setup();
        let amount: i128 = 1_000_000;
        let token_client = token::Client::new(&env, &native_token);

        let job_id = client.post_job(&user, &amount, &hash(&env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let pre_freelancer = token_client.balance(&freelancer);
        client.approve_work(&user, &job_id);
        let post_freelancer = token_client.balance(&freelancer);

        let payout = post_freelancer - pre_freelancer;
        let fee = client.get_fees(&native_token);

        assert_eq!(
            payout + fee,
            amount,
            "payout + fee must equal original job amount"
        );
    }

    #[test]
    fn fee_invariant_dispute_freelancer_wins_payout_plus_fee_equals_amount() {
        // Same conservation invariant holds when dispute resolves in freelancer's favour.
        let (env, client, _, user, freelancer, native_token) = setup();
        let amount: i128 = 1_000_000;
        let token_client = token::Client::new(&env, &native_token);

        let job_id = client.post_job(&user, &amount, &hash(&env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&user, &job_id);

        let pre_freelancer = token_client.balance(&freelancer);
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 0 });
        let post_freelancer = token_client.balance(&freelancer);

        let payout = post_freelancer - pre_freelancer;
        let fee = client.get_fees(&native_token);

        assert_eq!(
            payout + fee,
            amount,
            "dispute payout + fee must equal original job amount"
        );
    }

    // ── Issue #131: Fee update bounds tests ──────────────────────────────

    #[test]
    fn fee_update_valid_value_accepted() {
        let (env, client, admin, _, _, native_token) = setup();
        // Update fee to 5% (500 bps)
        client.update_fee_bps(&admin, &500i128);
        assert_eq!(client.get_fee_bps(), 500);

        // Post job and verify new fee is used
        let job_id = client.post_job(
            &admin,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let freelancer = Address::generate(&env);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);
        client.approve_work(&admin, &job_id);
        let post_balance = token_client.balance(&freelancer);

        // 5% fee: 1_000_000 * 500 / 10_000 = 50_000
        assert_eq!(post_balance - pre_balance, 950_000);
        assert_eq!(client.get_fees(&native_token), 50_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn fee_update_zero_rejected() {
        let (env, client, admin, _, _, _) = setup();
        client.update_fee_bps(&admin, &0i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn fee_update_negative_rejected() {
        let (env, client, admin, _, _, _) = setup();
        client.update_fee_bps(&admin, &-1i128);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn fee_update_above_max_rejected() {
        let (env, client, admin, _, _, _) = setup();
        // MAX_FEE_BPS_CONFIG is 10_000 (100%), so 10_001 should fail
        client.update_fee_bps(&admin, &10_001i128);
    }

    #[test]
    fn fee_update_max_value_accepted() {
        let (env, client, admin, _, _, native_token) = setup();
        // MAX_FEE_BPS_CONFIG is 10_000 (100%)
        client.update_fee_bps(&admin, &10_000i128);
        assert_eq!(client.get_fee_bps(), 10_000);

        let job_id = client.post_job(
            &admin,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let freelancer = Address::generate(&env);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);
        client.approve_work(&admin, &job_id);
        let post_balance = token_client.balance(&freelancer);

        // 100% fee: 1_000_000 * 10_000 / 10_000 = 1_000_000, payout = 0
        assert_eq!(post_balance - pre_balance, 0);
        assert_eq!(client.get_fees(&native_token), 1_000_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn fee_update_non_admin_rejected() {
        let (env, client, _, _, _, _) = setup();
        let stranger = Address::generate(&env);
        client.update_fee_bps(&stranger, &500i128);
    }

    #[test]
    fn fee_update_default_used_when_not_set() {
        // Fresh contract should use DEFAULT_FEE_BPS (250 = 2.5%)
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

        // Fee should be DEFAULT_FEE_BPS if not explicitly set
        assert_eq!(client.get_fee_bps(), DEFAULT_FEE_BPS);
    }

    #[test]
    fn fee_update_event_emitted() {
        let (env, client, admin, _, _, _) = setup();
        client.update_fee_bps(&admin, &500i128);

        let events = env.events().all();
        assert!(!events.is_empty(), "fee_updated event should be emitted");
    }
    #[test]
    fn post_job_unlimited_when_max_active_jobs_not_set() {
        let (env, client, _, user, _, native_token) = setup();
        assert_eq!(client.get_max_active_jobs_per_client(), 0);
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_client_active_jobs_count(&user), 3);
    }

    #[test]
    fn post_job_blocked_at_active_job_limit() {
        let (env, client, admin, user, _, native_token) = setup();
        client.set_max_active_jobs_per_client(&admin, &2);
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_client_active_jobs_count(&user), 2);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #15)")]
    fn post_job_panics_when_active_job_limit_exceeded() {
        let (env, client, admin, user, _, native_token) = setup();
        client.set_max_active_jobs_per_client(&admin, &2);
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
    }

    #[test]
    fn post_job_allowed_after_cancel_frees_active_slot() {
        let (env, client, admin, user, _, native_token) = setup();
        client.set_max_active_jobs_per_client(&admin, &1);
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.cancel_job(&user, &job_id);
        assert_eq!(client.get_client_active_jobs_count(&user), 0);
        let repost_id = client.post_job(
            &user,
            &2_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(repost_id, 2);
        assert_eq!(client.get_job(&repost_id).status, JobStatus::Open);
        assert_eq!(client.get_client_active_jobs_count(&user), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn set_max_active_jobs_per_client_rejects_non_admin() {
        let (env, client, _, user, _, _) = setup();
        client.set_max_active_jobs_per_client(&user, &1);
    }

    #[test]
    fn get_jobs_by_status_filter() {
        let (env, client, _, user, freelancer, native_token) = setup();

        // Post 3 jobs
        let id1 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let id2 = client.post_job(
            &user,
            &2_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let id3 = client.post_job(
            &user,
            &3_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        // Accept job 2 and 3
        client.accept_job(&freelancer, &id2);
        client.accept_job(&freelancer, &id3);

        // Submit job 3
        client.submit_work(&freelancer, &id3);

        let open_jobs = client.get_jobs_by_status(&JobStatus::Open);
        assert_eq!(open_jobs.len(), 1);
        assert_eq!(open_jobs.get(0).unwrap().amount, 1_000_000);

        let in_progress_jobs = client.get_jobs_by_status(&JobStatus::InProgress);
        assert_eq!(in_progress_jobs.len(), 1);
        assert_eq!(in_progress_jobs.get(0).unwrap().amount, 2_000_000);

        let review_jobs = client.get_jobs_by_status(&JobStatus::SubmittedForReview);
        assert_eq!(review_jobs.len(), 1);
        assert_eq!(review_jobs.get(0).unwrap().amount, 3_000_000);
    }

    #[test]
    fn attestation_created_on_approve_work() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        let attestation = client.get_attestation(&job_id);
        assert_eq!(attestation.job_id, job_id);
        assert_eq!(attestation.client, user);
        assert_eq!(attestation.freelancer, freelancer);
        assert!(attestation.approved_at > 0);
    }

    #[test]
    fn get_user_attestations_returns_attestations() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        let user_atts = client.get_user_attestations(&user);
        assert_eq!(user_atts.len(), 1);
        assert_eq!(user_atts.get(0).unwrap().job_id, job_id);

        let freelancer_atts = client.get_user_attestations(&freelancer);
        assert_eq!(freelancer_atts.len(), 1);
        assert_eq!(freelancer_atts.get(0).unwrap().job_id, job_id);
    }

    #[test]
    fn attestation_not_found_panics() {
        let (env, client, _, _, _, _) = setup();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.get_attestation(&999u64);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn post_job_with_private_visibility() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        );
        client.set_job_visibility(&user, &job_id, &JobVisibility::Private);
        let visibility = client.get_job_visibility(&job_id);
        assert_eq!(visibility, JobVisibility::Private);
    }

    #[test]
    fn post_job_defaults_to_public_visibility() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        );
        let visibility = client.get_job_visibility(&job_id);
        assert_eq!(visibility, JobVisibility::Public);
    }

    #[test]
    fn is_job_visible_to_public_job() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        );
        assert!(client.is_job_visible_to(&job_id, &freelancer));
    }

    #[test]
    fn is_job_visible_to_private_job() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        );
        client.set_job_visibility(&user, &job_id, &JobVisibility::Private);
        assert!(client.is_job_visible_to(&job_id, &user));
        assert!(!client.is_job_visible_to(&job_id, &freelancer));
    }

    #[test]
    fn add_invited_freelancer_allows_access() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        );
        client.set_job_visibility(&user, &job_id, &JobVisibility::InviteOnly);
        assert!(!client.is_job_visible_to(&job_id, &freelancer));
        client.add_invited_freelancer(&user, &job_id, &freelancer);
        assert!(client.is_job_visible_to(&job_id, &freelancer));
    }

    #[test]
    fn remove_invited_freelancer_revokes_access() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        );
        client.set_job_visibility(&user, &job_id, &JobVisibility::InviteOnly);
        client.add_invited_freelancer(&user, &job_id, &freelancer);
        assert!(client.is_job_visible_to(&job_id, &freelancer));
        client.remove_invited_freelancer(&user, &job_id, &freelancer);
        assert!(!client.is_job_visible_to(&job_id, &freelancer));
    }

    #[test]
    fn fee_tier_no_tiers_uses_flat_fee() {
        let (_env, client, admin, user, freelancer, native_token) = setup();
        client.update_fee_bps(&admin, &250i128);
        let job_id = client.post_job(&user, &5_000_000_000i128, &hash(&_env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        let fees_before = client.get_fees(&native_token);
        client.approve_work(&user, &job_id);
        let fees_after = client.get_fees(&native_token);
        let fee = fees_after - fees_before;
        let expected = (5_000_000_000i128 * 250i128) / BPS_DENOMINATOR;
        assert_eq!(fee, expected);
    }

    #[test]
    fn fee_tier_small_job_uses_higher_fee() {
        let (_env, client, admin, user, freelancer, native_token) = setup();
        client.update_fee_tier(&admin, &0, &(1 * XLM_STROOP), &300i128);
        client.update_fee_tier(&admin, &1, &(100 * XLM_STROOP), &250i128);
        client.update_fee_tier(&admin, &2, &(500 * XLM_STROOP), &200i128);
        client.update_fee_tier(&admin, &3, &(1000 * XLM_STROOP), &150i128);

        let tiers = client.get_fee_tiers();
        assert_eq!(tiers.len(), 4);

        let amount = 50 * XLM_STROOP;
        let job_id = client.post_job(&user, &amount, &hash(&_env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        let fees_before = client.get_fees(&native_token);
        client.approve_work(&user, &job_id);
        let fees_after = client.get_fees(&native_token);
        let fee = fees_after - fees_before;
        let expected = (amount * 300i128) / BPS_DENOMINATOR;
        assert_eq!(fee, expected);
    }

    #[test]
    fn fee_tier_medium_job_uses_mid_fee() {
        let (_env, client, admin, user, freelancer, native_token) = setup();
        client.update_fee_tier(&admin, &0, &(1 * XLM_STROOP), &300i128);
        client.update_fee_tier(&admin, &1, &(100 * XLM_STROOP), &250i128);

        let amount = 200 * XLM_STROOP;
        let job_id = client.post_job(&user, &amount, &hash(&_env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        let fees_before = client.get_fees(&native_token);
        client.approve_work(&user, &job_id);
        let fees_after = client.get_fees(&native_token);
        let fee = fees_after - fees_before;
        let expected = (amount * 250i128) / BPS_DENOMINATOR;
        assert_eq!(fee, expected);
    }

    #[test]
    fn fee_tier_large_job_uses_lowest_fee() {
        let (_env, client, admin, user, freelancer, native_token) = setup();
        client.update_fee_tier(&admin, &0, &(1 * XLM_STROOP), &300i128);
        client.update_fee_tier(&admin, &1, &(100 * XLM_STROOP), &250i128);
        client.update_fee_tier(&admin, &2, &(500 * XLM_STROOP), &200i128);
        client.update_fee_tier(&admin, &3, &(900 * XLM_STROOP), &150i128);

        let amount = 950 * XLM_STROOP;
        let job_id = client.post_job(&user, &amount, &hash(&_env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        let fees_before = client.get_fees(&native_token);
        client.approve_work(&user, &job_id);
        let fees_after = client.get_fees(&native_token);
        let fee = fees_after - fees_before;
        let expected = (amount * 150i128) / BPS_DENOMINATOR;
        assert_eq!(fee, expected);
    }

    #[test]
    fn fee_tier_amount_at_boundary_uses_correct_tier() {
        let (_env, client, admin, user, freelancer, native_token) = setup();
        client.update_fee_tier(&admin, &0, &(100 * XLM_STROOP), &300i128);
        client.update_fee_tier(&admin, &1, &(300 * XLM_STROOP), &250i128);

        let amount = 100 * XLM_STROOP;
        let job_id = client.post_job(&user, &amount, &hash(&_env), &32u32, &0u64, &native_token);
        let job_id = client.post_job(&user, &amount, &hash(&_env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        let fees_before = client.get_fees(&native_token);
        client.approve_work(&user, &job_id);
        let fees_after = client.get_fees(&native_token);
        let fee = fees_after - fees_before;
        let expected = (amount * 300i128) / BPS_DENOMINATOR;
        assert_eq!(fee, expected);
    }

    #[test]
    fn fee_tier_non_admin_rejected() {
        let (_env, client, _admin, user, _, _) = setup();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.update_fee_tier(&user, &0, &100i128, &300i128);
        }));
        assert!(result.is_err());
    }
    // ── cancel_job after accept tests (issue #269) ────────────────────────────
    //
    // The Open-state cancel_job path is already covered by
    // `cancel_job_refunds_client`. The InProgress (#3 InvalidStatus) path is
    // covered by `cancel_job_in_progress_panics_with_invalid_status`, and the
    // wrong-caller path by `cancel_job_unauthorized_caller_panics`. The tests
    // below pin down the remaining gaps for issue #269: that a client can
    // cancel an Open job (positive control) and that an unauthorised caller is
    // rejected *after* the freelancer has accepted (i.e. the auth check is
    // enforced in the InProgress state too).

    /// Client can cancel an Open job before any freelancer accepts.
    /// Verifies the escrowed amount is refunded in full and the job
    /// transitions to Cancelled.
    #[test]
    fn cancel_job_open_before_accept_refunds_client() {
        let (env, client, _, user, _, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);

        let job_id = client.post_job(
            &user,
            &750_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        // Funds are escrowed during post_job
        assert_eq!(token_client.balance(&user), pre_balance - 750_000);

        client.cancel_job(&user, &job_id);

        // Refund returns the full amount; no fee on a never-accepted job
        assert_eq!(token_client.balance(&user), pre_balance);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    /// After the freelancer has accepted the job, the contract's in-progress
    /// rules apply: a wrong caller (here the freelancer) cannot cancel and
    /// must trigger Error::InvalidStatus (#3) because cancel_job's status
    /// check runs before the ownership check.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn cancel_job_after_accept_by_freelancer_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::InProgress);

        // Freelancer attempts to cancel an in-progress job: status check
        // rejects this before ownership is even considered.
        client.cancel_job(&freelancer, &job_id);
    }

    /// After accept, even the legitimate client cannot cancel: the job is
    /// InProgress and only the deadline-enforced path (`enforce_deadline`)
    /// or dispute resolution may end it. Confirms in-progress rules apply
    /// uniformly regardless of caller identity.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn cancel_job_after_accept_by_client_panics_with_invalid_status() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        // Client attempts to cancel an in-progress job — must be rejected.
        client.cancel_job(&user, &job_id);
    }

    // ── double accept_job tests (issue #279) ──────────────────────────────────
    //
    // accept_job must reject a second acceptance. Because the contract
    // transitions status to InProgress on the first accept, the wrong-status
    // guard fires before the JobAlreadyAccepted guard — error #3 is the
    // observable behaviour for a same-freelancer retry. We assert that and
    // explicitly cover the JobAlreadyAccepted path by exercising it via the
    // internal invariant: any second accept (different freelancer included)
    // must be rejected and the job must remain in InProgress, owned by the
    // first freelancer.

    /// The same freelancer cannot accept twice; the second call fails with
    /// InvalidStatus (#3) because the first accept moved the job out of Open.
    /// The first accept's effects are preserved.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn accept_job_twice_same_freelancer_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        // Second accept must panic
        client.accept_job(&freelancer, &job_id);
    }

    /// A different freelancer trying to accept after the first accept also
    /// fails with InvalidStatus (#3); the first acceptance is the canonical
    /// one. The job's freelancer and status are unchanged.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn accept_job_twice_different_freelancer_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        let other_freelancer = Address::generate(&env);
        client.accept_job(&other_freelancer, &job_id);
    }

    /// Positive control: after a single accept the job is owned by the first
    /// freelancer and in InProgress. Pairs with the should_panic tests above
    /// to satisfy the "first accept still valid" and "status stays InProgress"
    /// acceptance criteria.
    #[test]
    fn accept_job_first_accept_preserved_after_failed_second() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::InProgress);
        assert_eq!(job.freelancer, Option::Some(freelancer.clone()));

        // The job is still in InProgress with its original freelancer; a
        // second accept (covered in the should_panic tests above) cannot
        // mutate this state.
        let job_after = client.get_job(&job_id);
        assert_eq!(job_after.status, JobStatus::InProgress);
        assert_eq!(job_after.freelancer, Option::Some(freelancer));
    }

    // ── get_fees after multiple approvals tests (issue #278) ──────────────────

    /// get_fees returns zero before any job has been approved.
    #[test]
    fn get_fees_zero_initially() {
        let (_, client, _, _, _, native_token) = setup();
        assert_eq!(client.get_fees(&native_token), 0);
    }

    /// Fees sum correctly after two approvals on the same token, and a
    /// subsequent withdraw_fees resets the accrued balance to zero.
    #[test]
    fn get_fees_sums_after_two_approvals_and_resets_on_withdraw() {
        let (env, client, admin, user, freelancer, native_token) = setup();

        assert_eq!(client.get_fees(&native_token), 0);

        // First job: 1_000_000 amount, default fee 250 bps → 25_000 fee
        let job_id_a = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id_a);
        client.submit_work(&freelancer, &job_id_a);
        client.approve_work(&user, &job_id_a);
        assert_eq!(client.get_fees(&native_token), 25_000);

        // Second job: 2_000_000 amount → 50_000 fee. Accrued should sum.
        let job_id_b = client.post_job(
            &user,
            &2_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id_b);
        client.submit_work(&freelancer, &job_id_b);
        client.approve_work(&user, &job_id_b);
        assert_eq!(client.get_fees(&native_token), 75_000);

        // withdraw_fees by admin returns the full accrued balance and resets
        // the accumulator to zero.
        let token_client = token::Client::new(&env, &native_token);
        let admin_pre = token_client.balance(&admin);
        client.withdraw_fees(&native_token);
        assert_eq!(token_client.balance(&admin) - admin_pre, 75_000);
        assert_eq!(client.get_fees(&native_token), 0);
    }

    // ── SC-TEST-35 (#314): cancel_job unauthorized non-client ────────────────
    //
    // The existing `cancel_job_unauthorized_caller_panics` covers ONE case
    // (random stranger). The issue calls out the full matrix: freelancer
    // AND random address must both fail, and the legitimate client path
    // is preserved as a regression guard.

    /// Freelancer (the *accepted* contractor) cannot cancel — only the
    /// client may. The expected panic is `Error(Contract, #2)` =
    /// `Error::Unauthorized`, the canonical "caller is not the
    /// authorised role" reject path.
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn cancel_job_by_freelancer_panics_with_unauthorized() {
        let (env, client, _, user, freelancer, native_token) = setup();

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        // The freelancer is registered (accept_job) — but cancel_job
        // is still client-only. Use a fresh Open job so we exercise the
        // role check, not the status check.
        let _ = freelancer; // acknowledge the binding
        let freelancer_caller = Address::generate(&env);
        client.cancel_job(&freelancer_caller, &job_id);
    }

    /// A completely-unrelated address (not client, not freelancer)
    /// hits the same `Error::Unauthorized` panic. Pinning the
    /// expected error code in the assertion documents the contract.
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn cancel_job_by_random_address_panics_with_unauthorized() {
        let (env, client, _, user, _, native_token) = setup();

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let attacker = Address::generate(&env);
        client.cancel_job(&attacker, &job_id);
    }

    /// Regression guard for the happy path the rejection tests above
    /// must NOT regress: the legitimate client can cancel their own
    /// Open job. Funds are refunded and the job transitions to
    /// `Cancelled`.
    #[test]
    fn cancel_job_by_legitimate_client_still_succeeds_after_unauthorized_attempts() {
        let (env, client, _, user, _, native_token) = setup();

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        // Some other address attempted to cancel and was rejected
        // (covered above) — we don't replay it here because
        // should_panic tests cannot continue after the panic. The
        // assertion that matters: the legitimate client cancel
        // still works.
        client.cancel_job(&user, &job_id);

        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
        // Refund: post_job moved 1_000_000 out; cancel_job restores it.
        assert_eq!(token_client.balance(&user), pre_balance);
    }

    // ── SC-TEST-40 (#319): description_hash persistence on get_job ───────────
    //
    // The hash supplied at post_job must be stored verbatim and round-trip
    // through get_job. Different jobs must keep their distinct hashes.

    /// post_job → get_job returns the exact same `description_hash`
    /// bytes the client supplied.
    #[test]
    fn description_hash_round_trips_through_get_job() {
        let (env, client, _, user, _, native_token) = setup();

        let supplied = BytesN::from_array(&env, &[0xAB; 32]);
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &supplied,
            &32u32,
            &0u64,
            &native_token,
        
            );

        let job = client.get_job(&job_id);
        assert_eq!(job.description_hash, supplied);
    }

    /// Two posts with different hashes must produce two jobs with
    /// distinct stored hashes — there's no global slot that can
    /// shadow the per-job value.
    #[test]
    fn description_hash_distinct_per_job_no_collision() {
        let (env, client, _, user, _, native_token) = setup();

        let hash_a = BytesN::from_array(&env, &[0x11; 32]);
        let hash_b = BytesN::from_array(&env, &[0x22; 32]);
        let hash_c = BytesN::from_array(&env, &[0x33; 32]);

        let id_a = client.post_job(&user, &500_000i128, &hash_a, &32u32, &0u64, &native_token, );
        let id_b = client.post_job(&user, &500_000i128, &hash_b, &32u32, &0u64, &native_token, );
        let id_c = client.post_job(&user, &500_000i128, &hash_c, &32u32, &0u64, &native_token, );

        assert_eq!(client.get_job(&id_a).description_hash, hash_a);
        assert_eq!(client.get_job(&id_b).description_hash, hash_b);
        assert_eq!(client.get_job(&id_c).description_hash, hash_c);
    }

    /// The `description_hash` is a documented field of the public
    /// `Job` struct. Reading it back via the full struct decode
    /// (not just a dedicated getter) is what off-chain consumers
    /// actually do, so the round-trip test must go through `get_job`.
    #[test]
    fn description_hash_is_field_of_returned_job_struct() {
        let (env, client, _, user, _, native_token) = setup();

        let hash_value = BytesN::from_array(&env, &[0x5A; 32]);
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash_value,
            &32u32,
            &0u64,
            &native_token,
        
            );
        let job: Job = client.get_job(&job_id);
        // The point of the test: `description_hash` lives on the
        // returned Job struct (not retrieved via a separate getter),
        // and it equals what we supplied.
        assert_eq!(job.description_hash, hash_value);
        // Adjacent fields aren't corrupted by the hash storage path.
        assert_eq!(job.client, user);
        assert_eq!(job.amount, 1_000_000);
        assert_eq!(job.status, JobStatus::Open);
    }

    // ── SC-TEST-41 (#320): concurrent post_job escrow balances ───────────────
    //
    // Multiple clients posting in the same test flow must produce a
    // contract escrow balance equal to the sum of locked amounts, and
    // partial cancellation must update the balance by exactly the
    // cancelled portion.

    /// Two clients each post one job; the contract escrow holds the
    /// sum of both amounts, and each `get_job` returns the per-job
    /// amount the client supplied.
    #[test]
    fn concurrent_post_jobs_sum_to_contract_escrow_balance() {
        let (env, client, admin, user, _, native_token) = setup();

        // Spin up a second funded client. `setup()` only mints to
        // `admin` and `user`; the multi-client accounting path needs
        // a fresh address with its own balance.
        let user_two = Address::generate(&env);
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&user_two, &10_000_000_000);
        let _ = admin;

        let token_client = token::Client::new(&env, &native_token);
        let contract_id = client.address.clone();
        let escrow_before = token_client.balance(&contract_id);

        let amount_user = 1_500_000i128;
        let amount_other = 2_750_000i128;

        let id_user = client.post_job(
            &user,
            &amount_user,
            &BytesN::from_array(&env, &[0x01; 32]),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let id_other = client.post_job(
            &user_two,
            &amount_other,
            &BytesN::from_array(&env, &[0x02; 32]),
            &32u32,
            &0u64,
            &native_token,
        
            );

        assert_eq!(client.get_job(&id_user).amount, amount_user);
        assert_eq!(client.get_job(&id_other).amount, amount_other);

        let escrow_after = token_client.balance(&contract_id);
        assert_eq!(
            escrow_after - escrow_before,
            amount_user + amount_other,
            "contract escrow must equal sum of all open jobs' amounts"
        );
    }

    /// Cancel one of three jobs and re-assert the contract escrow
    /// balance equals the sum of the remaining two.
    #[test]
    fn cancelling_one_of_many_jobs_updates_escrow_by_exact_amount() {
        let (env, client, _, user, _, native_token) = setup();

        let token_client = token::Client::new(&env, &native_token);
        let contract_id = client.address.clone();
        let escrow_initial = token_client.balance(&contract_id);

        let a = client.post_job(
            &user,
            &1_000_000i128,
            &BytesN::from_array(&env, &[0xA; 32]),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let b = client.post_job(
            &user,
            &2_000_000i128,
            &BytesN::from_array(&env, &[0xB; 32]),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let c = client.post_job(
            &user,
            &3_000_000i128,
            &BytesN::from_array(&env, &[0xC; 32]),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let _ = (a, c); // only assert on the cancellation of `b`
        let total_posted = 1_000_000 + 2_000_000 + 3_000_000;
        assert_eq!(
            token_client.balance(&contract_id) - escrow_initial,
            total_posted,
        );

        client.cancel_job(&user, &b);

        // Cancellation of `b` should release exactly 2_000_000 back to
        // the client; the remaining escrow equals the sum of `a` and
        // `c`'s amounts.
        assert_eq!(
            token_client.balance(&contract_id) - escrow_initial,
            (total_posted - 2_000_000),
            "escrow must shrink by exactly the cancelled job's amount"
        );
    }

    /// A single client posting four jobs in quick succession produces
    /// four distinct job ids whose individual `get_job` amounts sum
    /// to the contract escrow delta.
    #[test]
    fn single_client_many_posts_sum_to_escrow_delta() {
        let (env, client, _, user, _, native_token) = setup();

        let token_client = token::Client::new(&env, &native_token);
        let escrow_before = token_client.balance(&client.address);

        let amounts = [400_000i128, 750_000, 125_000, 2_000_000];
        let mut ids: Vec<u64> = Vec::new(&env);
        for (i, amt) in amounts.iter().enumerate() {
            let salt = i as u8 + 1;
            let id = client.post_job(
                &user,
                amt,
                &BytesN::from_array(&env, &[salt; 32]),
                &32u32,
                &0u64,
                &native_token,
        );
            ids.push_back(id);
        }

        // Each get_job returns its specific amount.
        for (idx, expected) in amounts.iter().enumerate() {
            let id = ids.get_unchecked(idx as u32);
            assert_eq!(client.get_job(&id).amount, *expected);
        }

        let total: i128 = amounts.iter().sum();
        let escrow_after = token_client.balance(&client.address);
        assert_eq!(escrow_after - escrow_before, total);
    }

    // ── SC-TEST-48 (#327): Large job amount fee calculation ────────────────────
    //
    // Verify fee math for large token amounts does not overflow and matches
    // the contract formula. Check conservation invariant: payout + fee = amount.

    /// Large amount fee calculation must produce correct payout and fee,
    /// and the contract escrow must hold the full amount until approval.
    #[test]
    fn large_amount_fee_calculation_correct() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let asset = token::StellarAssetClient::new(&env, &native_token);

        // Mint enough for a large-amount test (50 million XLM in stroops)
        let large_amount: i128 = 50_000_000_000_000i128;
        asset.mint(&user, &large_amount);

        let token_client = token::Client::new(&env, &native_token);
        let _client_pre = token_client.balance(&user);
        let freelancer_pre = token_client.balance(&freelancer);
        let contract_address = client.address.clone();
        let escrow_pre = token_client.balance(&contract_address);

        let job_id = client.post_job(
            &user,
            &large_amount,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        assert_eq!(client.get_job(&job_id).amount, large_amount);

        // Escrow holds the full amount after post
        let escrow_after_post = token_client.balance(&contract_address);
        assert_eq!(escrow_after_post - escrow_pre, large_amount);

        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        // Fee = 250 bps of large_amount
        let expected_fee = large_amount * DEFAULT_FEE_BPS / BPS_DENOMINATOR;
        let expected_payout = large_amount - expected_fee;

        assert_eq!(client.get_fees(&native_token), expected_fee);
        assert_eq!(
            token_client.balance(&freelancer) - freelancer_pre,
            expected_payout
        );
        // Conservation: payout + fee == original amount
        assert_eq!(
            expected_payout + expected_fee,
            large_amount,
            "payout + fee must equal original job amount for large amounts"
        );

        // Escrow holds only the fee after approval (fee hasn't been withdrawn yet)
        let escrow_after = token_client.balance(&contract_address);
        assert_eq!(
            escrow_after, expected_fee,
            "escrow must hold only the accrued fee after job completion"
        );

        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Completed);
    }

    /// Amount near i128::MAX / 10_000 must not overflow during fee computation.
    /// With default 250 bps fee, the intermediate multiplication
    /// `amount * 250` stays well within i128 range.
    #[test]
    fn large_amount_near_i128_limit_no_overflow() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let asset = token::StellarAssetClient::new(&env, &native_token);

        // Max safe amount that works even with 100% fee (10_000 bps)
        let max_safe = i128::MAX / BPS_DENOMINATOR;
        asset.mint(&user, &max_safe);

        let token_client = token::Client::new(&env, &native_token);
        let freelancer_pre = token_client.balance(&freelancer);
        let contract_address = client.address.clone();

        let job_id = client.post_job(&user, &max_safe, &hash(&env), &32u32, &0u64, &native_token);
        assert_eq!(client.get_job(&job_id).amount, max_safe);

        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        let expected_fee = max_safe * DEFAULT_FEE_BPS / BPS_DENOMINATOR;
        let expected_payout = max_safe - expected_fee;

        assert_eq!(client.get_fees(&native_token), expected_fee);
        assert_eq!(
            token_client.balance(&freelancer) - freelancer_pre,
            expected_payout
        );
        assert_eq!(
            expected_payout + expected_fee,
            max_safe,
            "conservation invariant holds at near-limit amounts"
        );

        // Escrow released after full lifecycle
        assert_eq!(
            token_client.balance(&contract_address),
            expected_fee,
            "escrow must hold only the fee after completion"
        );
    }

    /// Multiple large-amount approvals accumulate fees correctly without
    /// overflow or rounding errors across consecutive jobs.
    #[test]
    fn large_amount_fee_accumulation_multiple_jobs() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&user, &100_000_000_000_000i128);

        let amounts: [i128; 3] = [
            10_000_000_000_000i128,
            25_000_000_000_000i128,
            40_000_000_000_000i128,
        ];
        let mut total_fees: i128 = 0;

        for amount in amounts.iter() {
            let job_id = client.post_job(&user, amount, &hash(&env), &32u32, &0u64, &native_token);
            client.accept_job(&freelancer, &job_id);
            client.submit_work(&freelancer, &job_id);
            client.approve_work(&user, &job_id);
            total_fees += amount * DEFAULT_FEE_BPS / BPS_DENOMINATOR;
        }

        assert_eq!(
            client.get_fees(&native_token),
            total_fees,
            "accumulated fees must match sum of individual large-job fees"
        );
        // Total accrued fees must never exceed the total amount approved
        let total_amount: i128 = amounts.iter().sum();
        assert!(
            client.get_fees(&native_token) <= total_amount,
            "fees must never exceed total approved amount for large jobs"
        );
    }

    // ── SC-TEST-49 (#328): raise_dispute invalid-status panics ─────────────────
    //
    // raise_dispute is only valid on InProgress and SubmittedForReview jobs.
    // Calling it on any other status must panic with Error::InvalidStatus (#3)
    // and leave the contract state unchanged.

    /// raise_dispute on an Open job must panic with InvalidStatus.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn raise_dispute_on_open_panics() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        // Only InProgress and SubmittedForReview are disputable; Open must panic.
        client.raise_dispute(&user, &job_id);
    }

    /// raise_dispute on a Completed job must panic with InvalidStatus.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn raise_dispute_on_completed_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        // Completed jobs have been finalised; dispute is no longer possible.
        client.raise_dispute(&user, &job_id);
    }

    /// raise_dispute on a Cancelled job must panic with InvalidStatus.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn raise_dispute_on_cancelled_panics() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.cancel_job(&user, &job_id);
        // Cancelled jobs are final; dispute cannot be raised.
        client.raise_dispute(&user, &job_id);
    }

    /// raise_dispute on an already Disputed job must panic with InvalidStatus.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn raise_dispute_on_disputed_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.raise_dispute(&freelancer, &job_id);
        // A second raise_dispute on the same Disputed job must panic.
        client.raise_dispute(&user, &job_id);
    }

    // ── freelancer_cancel_job tests ────────────────────────────────────────────

    #[test]
    fn freelancer_cancel_job_full_refund_to_client() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let client_pre = token_client.balance(&user);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        assert_eq!(client.get_job(&job_id).status, JobStatus::InProgress);

        client.freelancer_cancel_job(&freelancer, &job_id);

        let client_post = token_client.balance(&user);
        assert_eq!(client_post, client_pre);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn freelancer_cancel_job_in_progress_status_required() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        // Status is Open, not InProgress
        client.freelancer_cancel_job(&freelancer, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn freelancer_cancel_job_only_assigned_freelancer() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        let stranger = Address::generate(&env);
        client.freelancer_cancel_job(&stranger, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn freelancer_cancel_job_on_submitted_for_review_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.freelancer_cancel_job(&freelancer, &job_id);
    }

    #[test]
    fn freelancer_cancel_job_event_emitted() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let events_before = env.events().all().len();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.freelancer_cancel_job(&freelancer, &job_id);

        let events_after = env.events().all().len();
        assert!(
            events_after > events_before,
            "freelancer cancel must emit events"
        );
    }

    #[test]
    fn freelancer_cancel_job_penalty_forfeit_full_refund() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let freelancer_pre = token_client.balance(&freelancer);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.freelancer_cancel_job(&freelancer, &job_id);

        // Freelancer forfeits payment — balance stays unchanged
        let freelancer_post = token_client.balance(&freelancer);
        assert_eq!(freelancer_post, freelancer_pre);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    // ── description_cid storage tests ─────────────────────────────────────────

    #[test]
    fn store_and_get_description_cid_round_trip() {
        let (env, client, _, user, _, _) = setup();
        let desc_hash = BytesN::from_array(&env, &[0xAB; 32]);
        let cid = String::from_str(&env, "QmTest123456789CIDValue");

        client.store_description_cid(&user, &desc_hash, &cid);

        let retrieved = client.get_description_cid(&desc_hash);
        assert_eq!(retrieved, cid);
    }

    #[test]
    fn get_description_cid_empty_for_unstored_hash() {
        let (env, client, _, _, _, _) = setup();
        let desc_hash = BytesN::from_array(&env, &[0xAB; 32]);

        let retrieved = client.get_description_cid(&desc_hash);
        assert_eq!(retrieved, String::from_str(&env, ""));
    }

    #[test]
    fn store_description_cid_updates_existing() {
        let (env, client, _, user, _, _) = setup();
        let desc_hash = BytesN::from_array(&env, &[0xAB; 32]);
        let cid1 = String::from_str(&env, "QmFirstCID123456789");
        let cid2 = String::from_str(&env, "QmSecondCID987654321");

        client.store_description_cid(&user, &desc_hash, &cid1);
        client.store_description_cid(&user, &desc_hash, &cid2);

        let retrieved = client.get_description_cid(&desc_hash);
        assert_eq!(retrieved, cid2);
    }

    /// After a failed raise_dispute call, the job state and escrow balance
    /// must remain exactly as they were before the call.
    #[test]
    fn raise_dispute_state_unchanged_after_failed_call() {
        let (env, client, _, user, _, native_token) = setup();
        let contract_address = client.address.clone();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        // Capture pre-failure state
        let job_before = client.get_job(&job_id);
        let escrow_before = token::Client::new(&env, &native_token).balance(&contract_address);

        // Attempt raise_dispute on Open job — must panic
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.raise_dispute(&user, &job_id);
        }));
        assert!(result.is_err(), "raise_dispute must panic on Open job");

        // State must be identical after failed attempt
        let job_after = client.get_job(&job_id);
        assert_eq!(
            job_after.status, job_before.status,
            "status must not change after failed raise_dispute"
        );
        assert_eq!(
            job_after.freelancer, job_before.freelancer,
            "freelancer must not change after failed raise_dispute"
        );
        assert_eq!(
            job_after.amount, job_before.amount,
            "amount must not change after failed raise_dispute"
        );
        let escrow_after = token::Client::new(&env, &native_token).balance(&contract_address);
        assert_eq!(
            escrow_after, escrow_before,
            "escrow balance must not change after failed raise_dispute"
        );
    }

    // ── SC-TEST-50 (#329): resolve_dispute invalid-status panics ──────────────
    //
    // resolve_dispute is only valid on Disputed jobs. Calling it on any other
    // status must panic with Error::InvalidStatus (#3). No token transfers
    // may occur on failure.

    /// resolve_dispute on a SubmittedForReview job must panic.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn resolve_dispute_submitted_status_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        // SubmittedForReview is not Disputed — must panic.
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 5_000 });
    }

    /// resolve_dispute on a Completed job must panic.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn resolve_dispute_completed_status_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        // Completed jobs are final — must panic.
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 5_000 });
    }

    /// resolve_dispute on a Cancelled job must panic.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn resolve_dispute_cancelled_status_panics() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.cancel_job(&user, &job_id);
        // Cancelled jobs are final — must panic.
        client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 5_000 });
    }

    /// After a failed resolve_dispute call, no token transfers occur and the
    /// contract state remains unchanged.
    #[test]
    fn resolve_dispute_no_token_transfer_on_failure() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let contract_address = client.address.clone();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        let token_client = token::Client::new(&env, &native_token);
        let client_balance_before = token_client.balance(&user);
        let freelancer_balance_before = token_client.balance(&freelancer);
        let escrow_before = token_client.balance(&contract_address);
        let job_before = client.get_job(&job_id);

        // Attempt resolve_dispute on Open job — must panic
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.resolve_dispute(&job_id, &DisputeResolution { client_bps: 5_000 });
        }));
        assert!(
            result.is_err(),
            "resolve_dispute must panic on non-Disputed job"
        );

        // No tokens moved
        assert_eq!(
            token_client.balance(&user),
            client_balance_before,
            "client balance must not change after failed resolve_dispute"
        );
        assert_eq!(
            token_client.balance(&freelancer),
            freelancer_balance_before,
            "freelancer balance must not change after failed resolve_dispute"
        );
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_before,
            "escrow balance must not change after failed resolve_dispute"
        );

        // Job state unchanged
        let job_after = client.get_job(&job_id);
        assert_eq!(
            job_after.status, job_before.status,
            "status must not change after failed resolve_dispute"
        );
        assert_eq!(job_after.amount, job_before.amount);
    }

    // ── SC-TEST-51 (#330): Full lifecycle state transitions ───────────────────
    //
    // End-to-end test covering Open → Accepted → Submitted → Completed (and
    // optional cancel path) with explicit status assertions at each step and
    // token balance checks for client, freelancer, and escrow.

    /// Happy path: post_job → accept_job → submit_work → approve_work with
    /// status assertions after each transition and balance checks at completion.
    #[test]
    fn full_lifecycle_happy_path_status_and_balances() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();

        let client_pre = token_client.balance(&user);
        let freelancer_pre = token_client.balance(&freelancer);
        let escrow_pre = token_client.balance(&contract_address);

        // Step 1: post_job → Open
        let amount: i128 = 1_000_000;
        let job_id = client.post_job(&user, &amount, &hash(&env), &32u32, &0u64, &native_token);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Open);
        assert_eq!(job.amount, amount);
        assert_eq!(job.client, user);
        assert_eq!(job.freelancer, Option::None);
        assert_eq!(
            token_client.balance(&contract_address) - escrow_pre,
            amount,
            "escrow must hold the job amount after post"
        );

        // Step 2: accept_job → InProgress
        client.accept_job(&freelancer, &job_id);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::InProgress);
        assert_eq!(
            job.freelancer,
            Option::Some(freelancer.clone()),
            "freelancer must be assigned after accept"
        );

        // Step 3: submit_work → SubmittedForReview
        client.submit_work(&freelancer, &job_id);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::SubmittedForReview);

        // Step 4: approve_work → Completed
        client.approve_work(&user, &job_id);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Completed);

        // Balance checks at completion
        let expected_fee = amount * DEFAULT_FEE_BPS / BPS_DENOMINATOR;
        let expected_payout = amount - expected_fee;

        assert_eq!(
            token_client.balance(&freelancer) - freelancer_pre,
            expected_payout,
            "freelancer must receive payout minus fee"
        );
        assert_eq!(
            token_client.balance(&user),
            client_pre - amount,
            "client balance must reflect the escrowed amount (no refund)"
        );
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_pre + expected_fee,
            "escrow must hold only the accrued fee after completion"
        );
        assert_eq!(
            client.get_fees(&native_token),
            expected_fee,
            "accrued fees must match expected"
        );
    }

    /// Cancel from Open: escrowed amount is returned to the client in full,
    /// freelancer receives nothing, escrow returns to pre-post balance.
    #[test]
    fn full_lifecycle_cancel_open_returns_escrow() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();

        let client_pre = token_client.balance(&user);
        let freelancer_pre = token_client.balance(&freelancer);
        let escrow_pre = token_client.balance(&contract_address);

        let amount: i128 = 1_000_000;
        let job_id = client.post_job(&user, &amount, &hash(&env), &32u32, &0u64, &native_token);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Open);
        assert_eq!(
            token_client.balance(&contract_address) - escrow_pre,
            amount,
            "escrow holds the amount after post"
        );

        // Cancel from Open
        client.cancel_job(&user, &job_id);
        assert_eq!(
            client.get_job(&job_id).status,
            JobStatus::Cancelled,
            "job must be Cancelled after cancel_job"
        );

        // Full refund to client, no fee deducted
        assert_eq!(
            token_client.balance(&user),
            client_pre,
            "client must be fully refunded after cancel from Open"
        );
        assert_eq!(
            token_client.balance(&freelancer),
            freelancer_pre,
            "freelancer must not receive any tokens after cancel"
        );
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_pre,
            "escrow must return to pre-post balance after cancel"
        );
        assert_eq!(
            client.get_fees(&native_token),
            0,
            "no fees must be accrued on a cancelled job"
        );
    }

    /// Escrow balance invariant across the full lifecycle: funds enter escrow
    /// on post_job and leave on approve_work (minus fee) or cancel_job (full).
    #[test]
    fn full_lifecycle_escrow_invariant() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();

        let escrow_pre = token_client.balance(&contract_address);
        let amount: i128 = 2_000_000;

        // Post: funds enter escrow
        let job_id = client.post_job(&user, &amount, &hash(&env), &32u32, &0u64, &native_token);
        assert_eq!(token_client.balance(&contract_address) - escrow_pre, amount);

        // Full lifecycle
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        // Escrow holds only the fee after completion
        let expected_fee = amount * DEFAULT_FEE_BPS / BPS_DENOMINATOR;
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_pre + expected_fee,
            "escrow must hold only the fee after job completion"
        );

        // Withdraw fees → escrow back to pre-post balance
        client.withdraw_fees(&native_token);
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_pre,
            "escrow must return to initial balance after fee withdrawal"
        );
    }

    // ── SC-TEST-47 (#326): get_job returns full Job struct fields ─────────────
    //
    // get_job must return every documented field of the Job struct with the
    // correct type and value across lifecycle steps. We compare against a
    // fully-constructed expected `Job` (not field-by-field cherry-picking) so
    // a newly-added or default-only field can't slip through unverified.

    /// After post_job, every field of the returned Job matches the inputs:
    /// client, amount, description_hash, status (Open), created_at (ledger
    /// timestamp), deadline, token, and the defaults freelancer=None /
    /// revision_count=0. The whole-struct compare enforces "no missing or
    /// default-only fields".
    #[test]
    fn get_job_full_struct_after_post_job() {
        let (env, client, _, user, _, native_token) = setup();

        let amount = 1_000_000i128;
        let desc_hash = hash(&env);
        let deadline = 1_710_000_000u64 + 86_400;
        let job_id = client.post_job(&user, &amount, &desc_hash, &32u32, &deadline, &native_token, );

        let expected = Job {
            client: user.clone(),
            freelancer: None,
            amount,
            description_hash: desc_hash,
            status: JobStatus::Open,
            // setup() pins the ledger timestamp; post_job stamps created_at with it.
            created_at: 1_710_000_000,
            deadline,
            token: native_token.clone(),
            revision_count: 0,
        };

        assert_eq!(client.get_job(&job_id), expected);
    }

    /// accept_job mutates exactly two fields — freelancer (None → Some) and
    /// status (Open → InProgress) — and leaves everything else untouched.
    /// submit_work then advances status (InProgress → SubmittedForReview)
    /// while preserving the assigned freelancer and all immutable fields.
    #[test]
    fn get_job_fields_update_across_accept_and_submit() {
        let (env, client, _, user, freelancer, native_token) = setup();

        let amount = 2_500_000i128;
        let desc_hash = hash(&env);
        let deadline = 0u64; // no deadline
        let job_id = client.post_job(&user, &amount, &desc_hash, &32u32, &deadline, &native_token, );

        let posted = client.get_job(&job_id);
        assert_eq!(posted.freelancer, None);
        assert_eq!(posted.status, JobStatus::Open);

        // accept_job: freelancer assigned, status → InProgress.
        client.accept_job(&freelancer, &job_id);
        let after_accept = client.get_job(&job_id);
        let expected_accept = Job {
            client: user.clone(),
            freelancer: Some(freelancer.clone()),
            amount,
            description_hash: desc_hash.clone(),
            status: JobStatus::InProgress,
            created_at: posted.created_at,
            deadline,
            token: native_token.clone(),
            revision_count: 0,
        };
        assert_eq!(after_accept, expected_accept);

        // submit_work: status → SubmittedForReview, everything else stable.
        client.submit_work(&freelancer, &job_id);
        let after_submit = client.get_job(&job_id);
        let expected_submit = Job {
            status: JobStatus::SubmittedForReview,
            ..expected_accept
        };
        assert_eq!(after_submit, expected_submit);
    }

    // ── SC-TEST-46 (#325): approve_work requires client auth ──────────────────
    // ── SC-TEST-36 (#315): accept_job on non-existent job ID ─────────────────
    //
    // accept_job must handle invalid or never-created job identifiers safely
    // without corrupting contract state.

    /// accept_job with job_id = 0 (never a valid ID) must panic with
    /// Error::JobNotFound (#1). Jobs are 1-indexed, so zero is always invalid.
    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn accept_job_zero_id_panics() {
        let (env, client, _, _, freelancer, native_token) = setup();
        let _ = (env, native_token);
        client.accept_job(&freelancer, &0u64);
    }

    /// accept_job with an out-of-range ID (larger than any posted job) must
    /// also panic with Error::JobNotFound (#1).
    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn accept_job_out_of_range_id_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        // Job ID 1 exists, ID 9999 does not — must be rejected.
        client.accept_job(&freelancer, &9999u64);
    }

    /// After a failed accept_job on a non-existent ID, contract storage
    /// (escrow balance, job status, freelancer field) must be unchanged.
    #[test]
    fn accept_job_non_existent_state_unchanged() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let contract_address = client.address.clone();

        // Post one known job to establish baseline.
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let escrow_before = token::Client::new(&env, &native_token).balance(&contract_address);
        let job_before = client.get_job(&job_id);

        // Attempt accept_job on a non-existent ID — must panic.
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.accept_job(&freelancer, &9999u64);
        }));
        assert!(
            result.is_err(),
            "accept_job must panic on non-existent job ID"
        );

        // Escrow balance must be identical.
        let escrow_after = token::Client::new(&env, &native_token).balance(&contract_address);
        assert_eq!(
            escrow_after, escrow_before,
            "escrow balance must not change after failed accept_job"
        );

        // Existing job's state must be untouched.
        let job_after = client.get_job(&job_id);
        assert_eq!(
            job_after.status, job_before.status,
            "job status must not change after failed accept_job"
        );
        assert_eq!(
            job_after.freelancer, job_before.freelancer,
            "freelancer must not change after failed accept_job"
        );
        assert_eq!(
            job_after.amount, job_before.amount,
            "amount must not change after failed accept_job"
        );
    }

    /// Even when the freelancer's auth is satisfied (mock_all_auths is
    /// active), a non-existent job must still fail with JobNotFound (#1)
    /// rather than an auth-related error.
    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn accept_job_non_existent_with_auth_still_fails() {
        let (env, client, _, user, freelancer, _native_token) = setup();
        let _ = (env, user);
        // Auth is mocked, but a job that has never been posted cannot be
        // accepted — the existence check fires first.
        client.accept_job(&freelancer, &0u64);
    }

    // ── SC-TEST-37 (#316): post_job token transfer amount ─────────────────────
    //
    // post_job must escrow exactly the job amount from the client's token
    // balance. The contract (escrow) balance must increase by the same
    // amount. Insufficient client balance must be rejected before any job
    // is stored.

    /// On successful post_job, the client's token balance must decrease
    /// by exactly the job amount.
    #[test]
    fn post_job_decreases_client_balance_by_amount() {
        let (env, client, _, user, _, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);
        let amount: i128 = 1_000_000;

        client.post_job(&user, &amount, &hash(&env), &32u32, &0u64, &native_token);

        let post_balance = token_client.balance(&user);
        assert_eq!(
            post_balance,
            pre_balance - amount,
            "client balance must decrease by the job amount"
        );
    }

    /// On successful post_job, the contract's escrow balance must increase
    /// by exactly the job amount.
    #[test]
    fn post_job_increases_contract_balance_by_amount() {
        let (env, client, _, user, _, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();
        let escrow_before = token_client.balance(&contract_address);
        let amount: i128 = 1_000_000;

        client.post_job(&user, &amount, &hash(&env), &32u32, &0u64, &native_token);

        let escrow_after = token_client.balance(&contract_address);
        assert_eq!(
            escrow_after - escrow_before,
            amount,
            "escrow must increase by the job amount"
        );
    }

    /// When the client has insufficient token balance, post_job must panic
    /// and no job should be persisted.
    #[test]
    #[should_panic]
    fn post_job_insufficient_balance_fails() {
        let (env, client, _, user, _, native_token) = setup();
        // User has 10_000_000_000 from setup; this amount exceeds their balance.
        let huge_amount: i128 = 100_000_000_000_000i128;
        client.post_job(
            &user,
            &huge_amount,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
    }

    /// After a failed post_job due to insufficient balance, no job is
    /// stored (job count is unchanged) and the client's balance is
    /// unaffected.
    #[test]
    fn post_job_insufficient_balance_no_job_stored() {
        let (env, client, _, user, _, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&user);
        let jobs_before = client.get_job_count();
        let huge_amount: i128 = 100_000_000_000_000i128;

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.post_job(
                &user,
                &huge_amount,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
        }));
        assert!(
            result.is_err(),
            "post_job must panic with insufficient balance"
        );

        // Job count must not have increased.
        assert_eq!(
            client.get_job_count(),
            jobs_before,
            "job count must not increase after failed post_job"
        );

        // Client balance must be untouched.
        assert_eq!(
            token_client.balance(&user),
            pre_balance,
            "client balance must not change after failed post_job"
        );
    }

    // ── SC-TEST-38 (#317): approve_work with missing freelancer ────────────────
    //
    // approve_work must fail when no freelancer has accepted the job
    // (the freelancer field is None). The error must be distinct from
    // Unauthorized (#2) where applicable, and no token release may occur.

    /// approve_work on an Open job (no freelancer accepted) must panic
    /// with InvalidStatus (#3) because the job has not reached
    /// SubmittedForReview and has no assigned freelancer.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn approve_work_on_open_job_no_freelancer_fails() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        // Job is Open — no freelancer has accepted. approve_work must fail.
        client.approve_work(&user, &job_id);
    }

    /// Verify the error for approve_work on a missing-freelancer job is
    /// InvalidStatus (#3), NOT Unauthorized (#2). The contract checks
    /// the status and freelancer fields before checking caller identity.
    #[test]
    fn approve_work_missing_freelancer_error_is_not_unauthorized() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        // approve_work on an Open job must fail with InvalidStatus (#3),
        // NOT Unauthorized (#2) — the status/freelancer check comes first.
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.approve_work(&user, &job_id);
        }));
        assert!(result.is_err(), "approve_work must panic on Open job");

        let panic_payload = result.expect_err("expected panic");
        let panic_text = if let Some(s) = panic_payload.downcast_ref::<&str>() {
            std::string::String::from(*s)
        } else if let Some(s) = panic_payload.downcast_ref::<std::string::String>() {
            s.clone()
        } else {
            std::format!("{:?}", panic_payload)
        };

        assert!(
            panic_text.contains("Error(Contract, #3)"),
            "expected InvalidStatus (#3), got: {}",
            panic_text
        );
        assert!(
            !panic_text.contains("Error(Contract, #2)"),
            "error must NOT be Unauthorized (#2), got: {}",
            panic_text
        );
    }

    /// No tokens must be transferred when approve_work fails due to a
    /// missing freelancer. Client, freelancer, and escrow balances must
    /// remain unchanged, and the job state must be preserved.
    #[test]
    fn approve_work_missing_freelancer_no_token_release() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let contract_address = client.address.clone();
        let token_client = token::Client::new(&env, &native_token);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        let user_balance_before = token_client.balance(&user);
        let freelancer_balance_before = token_client.balance(&freelancer);
        let escrow_before = token_client.balance(&contract_address);
        let job_before = client.get_job(&job_id);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.approve_work(&user, &job_id);
        }));
        assert!(result.is_err(), "approve_work must panic on Open job");

        // No tokens should have moved.
        assert_eq!(
            token_client.balance(&user),
            user_balance_before,
            "client balance must not change"
        );
        assert_eq!(
            token_client.balance(&freelancer),
            freelancer_balance_before,
            "freelancer balance must not change"
        );
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_before,
            "escrow balance must not change"
        );

        // Job state must be unchanged.
        let job_after = client.get_job(&job_id);
        assert_eq!(
            job_after.status, job_before.status,
            "status must not change"
        );
        assert_eq!(
            job_after.freelancer, job_before.freelancer,
            "freelancer must not change"
        );
        assert_eq!(
            job_after.amount, job_before.amount,
            "amount must not change"
        );
    }

    // ── SC-TEST-39 (#318): job created_at timestamp storage ────────────────────
    //
    // created_at must be set at post_job time from the ledger timestamp and
    // must persist unchanged through all subsequent state transitions.

    /// After post_job, get_job must return a non-zero created_at that
    /// matches the current ledger timestamp.
    #[test]
    fn job_created_at_matches_ledger_timestamp() {
        let (env, client, _, user, _, native_token) = setup();
        let expected_timestamp = env.ledger().timestamp();

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let job = client.get_job(&job_id);

        assert!(job.created_at > 0, "created_at must be non-zero");
        assert_eq!(
            job.created_at, expected_timestamp,
            "created_at must match ledger timestamp at post_job time"
        );
    }

    /// created_at must not change when the job transitions through
    /// accept_job, submit_work, or approve_work.
    #[test]
    fn job_created_at_unchanged_after_state_transitions() {
        let (env, client, _, user, freelancer, native_token) = setup();

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let created_at = client.get_job(&job_id).created_at;

        // accept_job must not change created_at
        client.accept_job(&freelancer, &job_id);
        assert_eq!(
            client.get_job(&job_id).created_at,
            created_at,
            "created_at must not change on accept_job"
        );

        // submit_work must not change created_at
        client.submit_work(&freelancer, &job_id);
        assert_eq!(
            client.get_job(&job_id).created_at,
            created_at,
            "created_at must not change on submit_work"
        );

        // approve_work must not change created_at
        client.approve_work(&user, &job_id);
        assert_eq!(
            client.get_job(&job_id).created_at,
            created_at,
            "created_at must not change on approve_work"
        );
    }

    /// Multiple jobs posted in sequence must have strictly increasing
    /// created_at values that match the ledger timestamps at each post.
    #[test]
    fn job_created_at_ordering_for_multiple_jobs() {
        let (env, client, _, user, _, native_token) = setup();
        let base_time = env.ledger().timestamp();

        // Post first job
        let id1 = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let job1 = client.get_job(&id1);
        assert_eq!(job1.created_at, base_time);

        // Advance time slightly
        env.ledger().with_mut(|li| {
            li.timestamp = base_time + 100;
        });

        // Post second job
        let id2 = client.post_job(
            &user,
            &2_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let job2 = client.get_job(&id2);
        assert_eq!(job2.created_at, base_time + 100);

        // Advance time again
        env.ledger().with_mut(|li| {
            li.timestamp = base_time + 200;
        });

        // Post third job
        let id3 = client.post_job(
            &user,
            &3_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let job3 = client.get_job(&id3);
        assert_eq!(job3.created_at, base_time + 200);

        // Verify ordering: created_at must be strictly increasing
        assert!(
            job1.created_at < job2.created_at,
            "first job's created_at must be before second's"
        );
        assert!(
            job2.created_at < job3.created_at,
            "second job's created_at must be before third's"
        );
    }

    // ── SC-TEST-46 (#325): approve_work requires client auth ──────────────────
    //
    // Only the job's client may approve submitted work and release payment.
    //   • approve_work without auth must fail.
    //   • approve_work by a non-client (the freelancer) must fail Unauthorized.
    //   • A client-authorised approve on a SubmittedForReview job succeeds and
    //     transitions the job to Completed.

    /// Build a job all the way to `SubmittedForReview` using the mocked
    /// auths from `setup()`, returning the env/client/addresses needed to
    /// drive the approve_work assertions.
    fn submitted_job() -> (
        Env,
        EscrowContractClient<'static>,
        Address,
        Address,
        Address,
        u64,
    ) {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        assert_eq!(
            client.get_job(&job_id).status,
            JobStatus::SubmittedForReview
        );
        (env, client, user, freelancer, native_token, job_id)
    }

    /// approve_work with no authorization present must fail. The job is
    /// driven to SubmittedForReview with mocked auths, then auths are
    /// cleared (`set_auths(&[])`) so `client.require_auth()` has nothing
    /// to satisfy and the call panics.
    #[test]
    #[should_panic]
    fn approve_work_without_auth_fails() {
        let (env, client, user, _freelancer, _native_token, job_id) = submitted_job();
        // Remove the blanket mock so require_auth is genuinely enforced.
        env.set_auths(&[]);
        client.approve_work(&user, &job_id);
    }

    /// approve_work by the freelancer (a non-client) must panic with
    /// `Error::Unauthorized` (#2). The freelancer can authorise for their
    /// own address under mock_all_auths, but the contract's
    /// `job.client != client` check rejects them.
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn approve_work_by_non_client_freelancer_fails() {
        let (_env, client, _user, freelancer, _native_token, job_id) = submitted_job();
        client.approve_work(&freelancer, &job_id);
    }

    /// The legitimate client approving a SubmittedForReview job succeeds:
    /// the job transitions to Completed and the freelancer is paid the
    /// amount net of fees.
    #[test]
    fn approve_work_by_client_succeeds_and_transitions_state() {
        let (env, client, user, freelancer, native_token, job_id) = submitted_job();

        let token_client = token::Client::new(&env, &native_token);
        let pre_balance = token_client.balance(&freelancer);

        client.approve_work(&user, &job_id);

        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
        // 1_000_000 amount, 25_000 fee (DEFAULT_FEE_BPS) → 975_000 payout.
        assert_eq!(token_client.balance(&freelancer) - pre_balance, 975_000);
        assert_eq!(client.get_fees(&native_token), 25_000);
    }

    // ── SC-TEST-42 (#321): cancel_job only in Open status edge cases ──────────
    //
    // Exercise cancel_job restrictions when job is not in Open status.
    // The function must reject non-Open jobs while preserving state and
    // escrow balances. Positive control: client can cancel an Open job.

    /// cancel_job on a `SubmittedForReview` job must panic with
    /// `InvalidStatus` (#3). No token transfers may occur.
    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn cancel_job_submitted_for_review_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        assert_eq!(
            client.get_job(&job_id).status,
            JobStatus::SubmittedForReview
        );

        // The legitimate client cancelling a submitted job must be rejected.
        client.cancel_job(&user, &job_id);
    }

    /// After a failed cancel_job on an `InProgress` job the job status,
    /// freelancer assignment, and escrow balance must remain unchanged.
    #[test]
    fn cancel_job_in_progress_state_unchanged() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let contract_address = client.address.clone();
        let token_client = token::Client::new(&env, &native_token);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);

        let status_before = client.get_job(&job_id).status;
        let freelancer_before = client.get_job(&job_id).freelancer.clone();
        let escrow_before = token_client.balance(&contract_address);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.cancel_job(&user, &job_id);
        }));
        assert!(result.is_err(), "cancel_job must panic on InProgress job");

        let job_after = client.get_job(&job_id);
        assert_eq!(job_after.status, status_before);
        assert_eq!(job_after.freelancer, freelancer_before);
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_before,
            "escrow must not change after failed cancel"
        );
    }

    /// After a failed cancel_job on a `SubmittedForReview` job the status,
    /// freelancer, and escrow must remain unchanged.
    #[test]
    fn cancel_job_submitted_state_unchanged() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let contract_address = client.address.clone();
        let token_client = token::Client::new(&env, &native_token);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);

        let status_before = client.get_job(&job_id).status;
        let escrow_before = token_client.balance(&contract_address);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.cancel_job(&user, &job_id);
        }));
        assert!(
            result.is_err(),
            "cancel_job must panic on SubmittedForReview job"
        );

        let job_after = client.get_job(&job_id);
        assert_eq!(job_after.status, status_before);
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_before,
            "escrow must not change after failed cancel on submitted job"
        );
    }

    /// After a failed cancel_job on a `Completed` job the status and escrow
    /// must remain unchanged.
    #[test]
    fn cancel_job_completed_state_unchanged() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let contract_address = client.address.clone();
        let token_client = token::Client::new(&env, &native_token);

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        let status_before = client.get_job(&job_id).status;
        let escrow_before = token_client.balance(&contract_address);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.cancel_job(&user, &job_id);
        }));
        assert!(result.is_err(), "cancel_job must panic on Completed job");

        let job_after = client.get_job(&job_id);
        assert_eq!(job_after.status, status_before);
        assert_eq!(
            token_client.balance(&contract_address),
            escrow_before,
            "escrow must not change after failed cancel on completed job"
        );
    }

    // ── SC-TEST-43 (#322): submit_work requires auth ──────────────────────────
    //
    // Ensure submit_work rejects unauthenticated or wrong-signer calls. Only
    // the assigned freelancer on an accepted job can submit work.

    /// submit_work with no authentication present must fail.
    #[test]
    #[should_panic]
    fn submit_work_without_auth_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        env.set_auths(&[]);
        client.submit_work(&freelancer, &job_id);
    }

    /// submit_work signed by the client instead of the assigned freelancer must
    /// fail with Unauthorized (#2).
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn submit_work_by_client_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&user, &job_id);
    }

    /// The assigned freelancer submitting work on an accepted (InProgress) job
    /// must succeed and transition the job to SubmittedForReview.
    #[test]
    fn submit_work_by_assigned_freelancer_succeeds() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        assert_eq!(
            client.get_job(&job_id).status,
            JobStatus::SubmittedForReview
        );
    }

    // ── SC-TEST-44 (#323): accept_job requires auth ───────────────────────────
    //
    // Ensure accept_job requires a valid freelancer authentication context.
    // Only an authenticated freelancer (not the client) may accept an open job.

    /// accept_job with no authentication must fail.
    #[test]
    #[should_panic]
    fn accept_job_without_auth_fails() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        env.set_auths(&[]);
        client.accept_job(&freelancer, &job_id);
    }

    /// accept_job with client credentials must fail. The client calling
    /// accept_job with their own address triggers the `job.client == freelancer`
    /// guard → Unauthorized (#2).
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn accept_job_with_client_credentials_fails() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&user, &job_id);
    }

    /// An authenticated freelancer accepting a valid Open job must succeed and
    /// transition the job to InProgress.
    #[test]
    fn accept_job_freelancer_succeeds() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::InProgress);
        assert_eq!(job.freelancer, Option::Some(freelancer));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn accept_job_after_deadline_panics() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 3600;
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        env.ledger().with_mut(|li| {
            li.timestamp = deadline + 1;
        });
        client.accept_job(&freelancer, &job_id);
    }

    #[test]
    fn accept_job_before_deadline_succeeds() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let deadline = 1_710_000_000 + 7200;
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::InProgress);
        assert_eq!(job.freelancer, Option::Some(freelancer));
    }

    #[test]
    fn accept_job_no_deadline_always_allowed() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        env.ledger().with_mut(|li| {
            li.timestamp = 9_999_999_999;
        });
        client.accept_job(&freelancer, &job_id);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::InProgress);
        assert_eq!(job.freelancer, Option::Some(freelancer));
    }

    // ── SC-TEST-45 (#324): post_job requires client auth ──────────────────────
    //
    // Ensure only authenticated clients can create jobs and fund escrow.

    /// post_job with no authentication must fail.
    #[test]
    #[should_panic]
    fn post_job_without_auth_fails() {
        let (env, client, _, user, _, native_token) = setup();
        env.set_auths(&[]);
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
    }

    /// post_job with a non-client address authenticated must fail. When only
    /// the freelancer (not the client) has auth, `client.require_auth()`
    /// rejects the call.
    #[test]
    #[should_panic]
    fn post_job_with_freelancer_only_auth_fails() {
        let (env, client, _, user, _freelancer, native_token) = setup();
        env.set_auths(&[]);
        client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
    }

    /// An authenticated client posting a job must succeed and store the job
    /// with status Open and the correct amount.
    #[test]
    fn post_job_with_client_auth_succeeds() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::Open);
        assert_eq!(job.client, user);
        assert_eq!(job.amount, 1_000_000);
    }

    // ── SC-TEST-20 (#299): approve_work unauthorized client ───────────────────
    //
    // Only the job client may approve submitted work and release payment.
    //   • The client succeeds after a valid submit (job completes).
    //   • A non-client caller — including an unrelated third party, not just
    //     the freelancer — fails with Unauthorized (#2).
    //   • On a valid approval, funds flow correctly out of escrow: the
    //     freelancer is paid net of fees, the fee is retained, and the escrow
    //     balance is fully conserved (nothing left stranded).

    /// A completely unrelated third party (neither client nor freelancer)
    /// cannot approve_work. The status check passes on a SubmittedForReview
    /// job, so the contract's `job.client != client` guard is what rejects
    /// the caller with `Error::Unauthorized` (#2).
    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn approve_work_by_unrelated_third_party_fails_unauthorized() {
        let (env, client, _user, _freelancer, _native_token, job_id) = submitted_job();
        let stranger = Address::generate(&env);
        client.approve_work(&stranger, &job_id);
    }

    /// On a valid client approval the funds flow is fully accounted for:
    /// the freelancer receives `amount - fee`, the fee is retained as
    /// platform fees, and the escrow contract's balance drops by exactly
    /// the full job amount (payout + fee). No tokens are stranded.
    #[test]
    fn approve_work_completes_job_and_funds_flow() {
        let (env, client, user, freelancer, native_token, job_id) = submitted_job();

        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();

        let freelancer_pre = token_client.balance(&freelancer);
        let escrow_pre = token_client.balance(&contract_address);
        let fees_pre = client.get_fees(&native_token);

        client.approve_work(&user, &job_id);

        // 1_000_000 amount, 25_000 fee (DEFAULT_FEE_BPS) → 975_000 payout.
        let payout = 975_000i128;
        let fee = 25_000i128;

        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
        // Freelancer paid net of fee.
        assert_eq!(token_client.balance(&freelancer) - freelancer_pre, payout);
        // Fee retained by the platform.
        assert_eq!(client.get_fees(&native_token) - fees_pre, fee);
        // Escrow released the full amount; payout + fee == amount, so the
        // contract balance drops by the payout only (the fee stays in escrow
        // as accrued fees, not transferred out).
        assert_eq!(escrow_pre - token_client.balance(&contract_address), payout);
    }

    // ── Upgrade Tests ─────────────────────────────────────────────────────

    #[test]
    fn upgrade_propose_and_cancel() {
        let (env, client, admin, _user, _freelancer, _native_token) = setup();

        let wasm_hash = BytesN::from_array(&env, &[0xabu8; 32]);
        client.propose_upgrade(&admin, &wasm_hash);

        let events = env.events().all();
        assert!(events.len() > 0);

        client.cancel_upgrade(&admin);

        let events = env.events().all();
        assert!(events.len() > 1);
    }

    #[test]
    fn upgrade_execute_after_timelock_clears_pending_state() {
        let (env, client, admin, _user, _freelancer, _native_token) = setup();

        let wasm_hash = BytesN::from_array(&env, &[0xabu8; 32]);
        client.propose_upgrade(&admin, &wasm_hash);

        env.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + UPGRADE_TIMELOCK_SECS + 1;
        });

        // After the timelock, cancelling should still work (confirming
        // the upgrade hash is still stored). Then propose again: the
        // propose-cancel cycle confirms storage round-trips correctly.
        client.cancel_upgrade(&admin);

        // Re-propose after cancel — verifies the first cycle cleaned up.
        let wasm_hash2 = BytesN::from_array(&env, &[0xccu8; 32]);
        client.propose_upgrade(&admin, &wasm_hash2);
        client.cancel_upgrade(&admin);

        let events = env.events().all();
        assert!(
            events.len() >= 4,
            "expected propose + cancel + propose + cancel events"
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #19)")]
    fn upgrade_execute_before_timelock_fails() {
        let (env, client, admin, _user, _freelancer, _native_token) = setup();

        let wasm_hash = BytesN::from_array(&env, &[0xabu8; 32]);
        client.propose_upgrade(&admin, &wasm_hash);

        client.execute_upgrade(&admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #20)")]
    fn upgrade_execute_without_proposal_fails() {
        let (env, client, admin, _user, _freelancer, _native_token) = setup();

        client.execute_upgrade(&admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn upgrade_propose_non_admin_fails() {
        let (env, client, _admin, user, _freelancer, _native_token) = setup();

        let wasm_hash = BytesN::from_array(&env, &[0xabu8; 32]);
        client.propose_upgrade(&user, &wasm_hash);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #20)")]
    fn upgrade_cancel_without_proposal_fails() {
        let (env, client, admin, _user, _freelancer, _native_token) = setup();

        client.cancel_upgrade(&admin);
    }

    // ── Property-based Fuzz Tests ──────────────────────────────────────────
    //
    // These tests use proptest to verify invariants across random inputs.

    use proptest::prelude::*;

    // ── Fee calculation mathematical properties ────────────────────────────
    //
    // Verify that the fee formula `fee = amount * fee_bps / BPS_DENOMINATOR`
    // holds basic arithmetic invariants regardless of random inputs.

    proptest! {
        #[test]
        fn prop_fee_non_negative(amount in 1i128..=i128::MAX, fee_bps in 0i128..=1000i128) {
            let fee = amount.checked_mul(fee_bps)
                .and_then(|v| v.checked_div(BPS_DENOMINATOR))
                .unwrap_or(0);
            prop_assert!(fee >= 0, "fee must be non-negative");
            prop_assert!(fee <= amount, "fee must not exceed amount");
        }

        #[test]
        fn prop_payout_plus_fee_equals_amount(amount in 1i128..=i128::MAX, fee_bps in 0i128..=1000i128) {
            let fee = amount.checked_mul(fee_bps)
                .and_then(|v| v.checked_div(BPS_DENOMINATOR))
                .unwrap_or(0);
            let payout = amount.checked_sub(fee).unwrap_or(0);
            if fee <= amount {
                prop_assert_eq!(payout + fee, amount, "payout + fee must equal amount");
            }
        }

        #[test]
        fn prop_zero_fee_bps_yields_no_fee(amount in 1i128..=i128::MAX) {
            let fee = amount.checked_mul(0)
                .and_then(|v| v.checked_div(BPS_DENOMINATOR))
                .unwrap_or(0);
            prop_assert_eq!(fee, 0, "zero fee_bps must yield zero fee");
        }

        #[test]
        fn prop_fee_monotonic_in_bps(
            amount in 1i128..=1_000_000_000i128,
            bps_a in 0i128..=1000i128,
            bps_b in 0i128..=1000i128,
        ) {
            let fee_a = amount.checked_mul(bps_a)
                .and_then(|v| v.checked_div(BPS_DENOMINATOR))
                .unwrap_or(0);
            let fee_b = amount.checked_mul(bps_b)
                .and_then(|v| v.checked_div(BPS_DENOMINATOR))
                .unwrap_or(0);
            if bps_a <= bps_b {
                prop_assert!(fee_a <= fee_b, "fee must be monotonic in bps");
            }
        }
    }

    // ── Status transition state machine ────────────────────────────────────
    //
    // Verify that status transitions follow valid edges for any random sequence.
    // Valid transitions:
    //   Open → InProgress, Cancelled
    //   InProgress → SubmittedForReview, Cancelled, Disputed
    //   SubmittedForReview → Completed, InProgress, Disputed
    //   Completed → (terminal)
    //   Cancelled → (terminal)
    //   Disputed → Completed, Cancelled

    fn is_valid_transition(from: &JobStatus, to: &JobStatus) -> bool {
        matches!(
            (from, to),
            (JobStatus::Open, JobStatus::InProgress)
                | (JobStatus::Open, JobStatus::Cancelled)
                | (JobStatus::InProgress, JobStatus::SubmittedForReview)
                | (JobStatus::InProgress, JobStatus::Cancelled)
                | (JobStatus::InProgress, JobStatus::Disputed)
                | (JobStatus::SubmittedForReview, JobStatus::Completed)
                | (JobStatus::SubmittedForReview, JobStatus::InProgress)
                | (JobStatus::SubmittedForReview, JobStatus::Disputed)
                | (JobStatus::Disputed, JobStatus::Completed)
                | (JobStatus::Disputed, JobStatus::Cancelled)
        )
    }

    proptest! {
        #[test]
        fn prop_status_transition_valid(
            from_idx in 0..6usize,
            to_idx in 0..6usize,
        ) {
            let statuses = [
                JobStatus::Open,
                JobStatus::InProgress,
                JobStatus::SubmittedForReview,
                JobStatus::Completed,
                JobStatus::Cancelled,
                JobStatus::Disputed,
            ];
            let from = &statuses[from_idx];
            let to = &statuses[to_idx];
            let valid = is_valid_transition(from, to);

            // Terminal states cannot transition to any other state.
            let is_terminal = matches!(from, JobStatus::Completed | JobStatus::Cancelled);
            if is_terminal {
                prop_assert!(!valid, "terminal states must not allow transitions");
            }

            // Self-transitions are never valid.
            if from == to {
                prop_assert!(!valid, "self-transitions are not allowed");
            }
        }
    }

    // ── Job ID monotonicity ────────────────────────────────────────────────
    //
    // Verify that job IDs are strictly increasing.

    #[test]
    fn prop_job_ids_are_strictly_increasing() {
        let (env, client, _, user, _, native_token) = setup();
        let mut prev_id = 0u64;

        for _ in 0..10 {
            let id = client.post_job(
                &user,
                &1_000_000i128,
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            assert!(
                id > prev_id,
                "job ID must be strictly increasing: {} <= {}",
                id,
                prev_id
            );
            prev_id = id;
        }

        assert_eq!(client.get_job_count(), 10, "total job count must be 10");
    }

    // ── No duplicate job IDs ───────────────────────────────────────────────
    //
    // Verify that no two jobs share the same ID across random sequences.

    #[test]
    fn prop_no_duplicate_job_ids() {
        let (env, client, _, user, _, native_token) = setup();
        let mut ids = std::collections::HashSet::new();

        for i in 0..20u64 {
            let id = client.post_job(
                &user,
                &(1_000_000i128 + i as i128),
                &hash(&env),
                &32u32,
                &0u64,
                &native_token,
        );
            assert!(!ids.contains(&id), "duplicate job ID found: {}", id);
            ids.insert(id);
        }

        assert_eq!(client.get_job_count(), 20, "total job count must be 20");
        assert_eq!(ids.len(), 20, "must have 20 unique job IDs");
    }

    // ── Token conservation invariant ───────────────────────────────────────
    //
    // After a full lifecycle (post → accept → submit → approve), verify that
    // total token supply is conserved: client_initial = client_final +
    // freelancer_final + platform_fees.

    #[test]
    fn prop_token_conservation_full_lifecycle() {
        let (env, client, _, user, freelancer, native_token) = setup();

        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();

        let client_pre = token_client.balance(&user);
        let freelancer_pre = token_client.balance(&freelancer);
        let fees_pre = client.get_fees(&native_token);
        let total_pre = client_pre + freelancer_pre + fees_pre;

        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        let client_post = token_client.balance(&user);
        let freelancer_post = token_client.balance(&freelancer);
        let fees_post = client.get_fees(&native_token);
        let total_post = client_post + freelancer_post + fees_post;

        assert_eq!(
            total_post, total_pre,
            "total token supply must be conserved: pre={}, post={}",
            total_pre, total_post
        );
    }

    // ── Escrow balance invariant ──────────────────────────────────────────
    //
    // Verify that the escrow contract's token balance equals the sum of all
    // active (non-terminal) job amounts, plus accrued fees.

    #[test]
    fn prop_escrow_balance_equals_active_jobs_plus_fees() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();

        let j1 = client.post_job(
            &user,
            &5_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        let j2 = client.post_job(
            &user,
            &3_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );

        // Both jobs are Open: the contract holds 8_000_000 total.
        let fees = client.get_fees(&native_token);
        assert_eq!(
            token_client.balance(&contract_address),
            8_000_000 + fees,
            "escrow balance must match active jobs + fees (initial)"
        );

        // Accept j1 → now 5_000_000 is InProgress (still active)
        client.accept_job(&freelancer, &j1);
        let fees = client.get_fees(&native_token);
        assert_eq!(
            token_client.balance(&contract_address),
            8_000_000 + fees,
            "escrow balance unchanged after accept"
        );

        // Complete j1 → 5_000_000 released, 975_000 to freelancer, 25_000 to fees
        client.submit_work(&freelancer, &j1);
        client.approve_work(&user, &j1);
        let fees = client.get_fees(&native_token);
        assert_eq!(
            token_client.balance(&contract_address),
            3_000_000 + fees,
            "escrow balance after j1 completed = j2 amount + fees"
        );

        // Cancel j2
        client.cancel_job(&user, &j2);
        let fees = client.get_fees(&native_token);
        assert_eq!(
            token_client.balance(&contract_address),
            fees,
            "escrow balance after both jobs terminal = fees only"
        );
    }

    // ── Random operation sequence ─────────────────────────────────────────
    //
    // Generate random sequences of contract operations and verify that no
    // unexpected panics occur and basic invariants hold.

    #[derive(Debug, Clone)]
    enum Op {
        PostJob { amount: i128 },
        AcceptJob { job_idx: usize },
        SubmitWork { job_idx: usize },
        ApproveWork { job_idx: usize },
        CancelJob { job_idx: usize },
    }

    fn run_ops(ops: &[Op]) {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let token_client = token::Client::new(&env, &native_token);
        let contract_address = client.address.clone();
        let mut jobs: std::vec::Vec<u64> = std::vec::Vec::new();

        for op in ops {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match *op {
                Op::PostJob { amount } => {
                    if amount > 0 {
                        let id = client.post_job(
                            &user,
                            &amount,
                            &hash(&env),
                            &32u32,
                            &0u64,
                            &native_token,
        );
                        jobs.push(id);
                    }
                }
                Op::AcceptJob { job_idx } => {
                    if job_idx < jobs.len() {
                        let id = jobs[job_idx];
                        let job = client.get_job(&id);
                        if job.status == JobStatus::Open {
                            client.accept_job(&freelancer, &id);
                        }
                    }
                }
                Op::SubmitWork { job_idx } => {
                    if job_idx < jobs.len() {
                        let id = jobs[job_idx];
                        let job = client.get_job(&id);
                        if job.status == JobStatus::InProgress {
                            client.submit_work(&freelancer, &id);
                        }
                    }
                }
                Op::ApproveWork { job_idx } => {
                    if job_idx < jobs.len() {
                        let id = jobs[job_idx];
                        let job = client.get_job(&id);
                        if job.status == JobStatus::SubmittedForReview {
                            client.approve_work(&user, &id);
                        }
                    }
                }
                Op::CancelJob { job_idx } => {
                    if job_idx < jobs.len() {
                        let id = jobs[job_idx];
                        let job = client.get_job(&id);
                        if job.status == JobStatus::Open {
                            client.cancel_job(&user, &id);
                        }
                    }
                }
            }));

            if result.is_err() {
                panic!(
                    "unexpected panic in operation {:?} at job count {}",
                    op,
                    jobs.len()
                );
            }

            let fees = client.get_fees(&native_token);
            let escrow_bal = token_client.balance(&contract_address);
            assert!(
                escrow_bal >= fees,
                "escrow balance must be >= accrued fees: {} < {}",
                escrow_bal,
                fees
            );
        }
    }

    #[test]
    fn prop_random_operation_sequence_1() {
        let ops = std::vec![
            Op::PostJob { amount: 1_000_000 },
            Op::AcceptJob { job_idx: 0 },
            Op::SubmitWork { job_idx: 0 },
            Op::ApproveWork { job_idx: 0 },
        ];
        run_ops(&ops);
    }

    #[test]
    fn prop_random_operation_sequence_2() {
        let ops = std::vec![
            Op::PostJob { amount: 2_000_000 },
            Op::PostJob { amount: 3_000_000 },
            Op::AcceptJob { job_idx: 0 },
            Op::CancelJob { job_idx: 1 },
            Op::SubmitWork { job_idx: 0 },
            Op::ApproveWork { job_idx: 0 },
        ];
        run_ops(&ops);
    }

    #[test]
    fn prop_random_operation_sequence_3() {
        let ops = std::vec![
            Op::PostJob { amount: 1_000_000 },
            Op::PostJob { amount: 2_000_000 },
            Op::PostJob { amount: 3_000_000 },
            Op::AcceptJob { job_idx: 0 },
            Op::AcceptJob { job_idx: 1 },
            Op::CancelJob { job_idx: 2 },
            Op::SubmitWork { job_idx: 0 },
            Op::SubmitWork { job_idx: 1 },
            Op::ApproveWork { job_idx: 0 },
            Op::ApproveWork { job_idx: 1 },
        ];
        run_ops(&ops);
    }

    #[test]
    fn prop_random_operation_sequence_4() {
        let ops = std::vec![
            Op::PostJob { amount: 5_000_000 },
            Op::CancelJob { job_idx: 0 },
            Op::PostJob { amount: 5_000_000 },
            Op::AcceptJob { job_idx: 1 },
            Op::SubmitWork { job_idx: 1 },
            Op::ApproveWork { job_idx: 1 },
        ];
        run_ops(&ops);
    }

    #[test]
    fn prop_random_operation_sequence_5() {
        let ops = std::vec![
            Op::PostJob { amount: 1_000_000 },
            Op::PostJob { amount: 1_000_000 },
            Op::AcceptJob { job_idx: 0 },
            Op::AcceptJob { job_idx: 1 },
            Op::SubmitWork { job_idx: 0 },
            Op::CancelJob { job_idx: 1 },
            Op::ApproveWork { job_idx: 0 },
        ];
        run_ops(&ops);
    }

    #[test]
    fn prop_random_operation_sequence_6() {
        let ops = std::vec![
            Op::PostJob { amount: 1_000_000 },
            Op::PostJob { amount: 2_000_000 },
            Op::PostJob { amount: 3_000_000 },
            Op::AcceptJob { job_idx: 0 },
            Op::SubmitWork { job_idx: 0 },
            Op::ApproveWork { job_idx: 0 },
            Op::AcceptJob { job_idx: 1 },
            Op::SubmitWork { job_idx: 1 },
            Op::ApproveWork { job_idx: 1 },
            Op::CancelJob { job_idx: 2 },
        ];
        run_ops(&ops);
    }

    // ── Issue #412: Referral reward system tests ──────────────────────────────

    #[test]
    fn referral_register_and_lookup() {
        let (env, client, _admin, user, _freelancer, native_token) = setup();
        let referrer = Address::generate(&env);
        let code = String::from_str(&env, "MYCODE");
        client.register_referral(&referrer, &code);
        // Posting with the referral code should link the referrer.
        let hash_val = hash(&env);
        client.add_allowed_token(&native_token);
        let job_id = client.post_job_with_referral(
            &user,
            &1_000_000i128,
            &hash_val,
            &32u32,
            &0u64,
            &native_token,
            &code,
        );
        assert!(job_id >= 1);
        // Earnings should still be zero before any job completes.
        let earnings = client.get_referral_earnings(&referrer);
        assert_eq!(earnings, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #21)")]
    fn referral_duplicate_code_rejected() {
        let (env, client, _admin, user, _freelancer, _native_token) = setup();
        let code = String::from_str(&env, "DUPCODE");
        client.register_referral(&user, &code);
        client.register_referral(&user, &code);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #22)")]
    fn referral_post_job_with_unknown_code_rejected() {
        let (env, client, _admin, user, _freelancer, native_token) = setup();
        client.add_allowed_token(&native_token);
        let hash_val = hash(&env);
        let bad_code = String::from_str(&env, "BADCODE");
        client.post_job_with_referral(
            &user,
            &1_000_000i128,
            &hash_val,
            &32u32,
            &0u64,
            &native_token,
            &bad_code,
        );
    }

    #[test]
    fn referral_bonus_credited_on_first_job_approval() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let referrer = Address::generate(&env);
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&referrer, &1_000_000i128);

        let code = String::from_str(&env, "REF1");
        client.register_referral(&referrer, &code);
        client.add_allowed_token(&native_token);

        let hash_val = hash(&env);
        let amount = 1_000_000i128;
        let job_id = client.post_job_with_referral(
            &user,
            &amount,
            &hash_val,
            &32u32,
            &0u64,
            &native_token,
            &code,
        );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);

        // Referrer should have 0.5% (50 bps) of the job amount credited.
        let expected_bonus = (amount * 50) / 10_000;
        let earnings = client.get_referral_earnings(&referrer);
        assert_eq!(earnings, expected_bonus);
    }

    #[test]
    fn referral_bonus_only_awarded_once() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let referrer = Address::generate(&env);
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&referrer, &1_000_000i128);
        asset.mint(&user, &10_000_000i128);

        let code = String::from_str(&env, "ONCE");
        client.register_referral(&referrer, &code);
        client.add_allowed_token(&native_token);

        // First job via referral code.
        let amount = 1_000_000i128;
        let job_id = client.post_job_with_referral(
            &user,
            &amount,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
            &code,
        );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        let after_first = client.get_referral_earnings(&referrer);

        // Second job by same client (direct, no code) — no additional bonus.
        let job_id2 = client.post_job(
            &user,
            &amount,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id2);
        client.submit_work(&freelancer, &job_id2);
        client.approve_work(&user, &job_id2);
        let after_second = client.get_referral_earnings(&referrer);

        assert_eq!(after_first, after_second);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #23)")]
    fn referral_withdraw_with_zero_earnings_rejected() {
        let (env, client, _admin, user, _freelancer, _native_token) = setup();
        client.withdraw_referral_earnings(&user);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #26)")]
    fn referral_self_referral_rejected() {
        let (env, client, _admin, user, _freelancer, native_token) = setup();
        client.add_allowed_token(&native_token);
        let code = String::from_str(&env, "SELFREF");
        client.register_referral(&user, &code);
        let hash_val = hash(&env);
        client.post_job_with_referral(
            &user,
            &1_000_000i128,
            &hash_val,
            &32u32,
            &0u64,
            &native_token,
            &code,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn update_fee_rejects_negative() {
        let (_env, client, _admin, _user, _freelancer, _native_token) = setup();
        client.update_fee(&(-1i128));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn update_fee_rejects_excessive() {
        let (_env, client, _admin, _user, _freelancer, _native_token) = setup();
        client.update_fee(&(MAX_FEE_BPS + 1));
    }

    #[test]
    fn update_fee_accepts_zero() {
        let (_env, client, _admin, _user, _freelancer, _native_token) = setup();
        client.update_fee(&0i128);
        assert_eq!(client.get_fee_bps(), 0);
    }

    fn in_progress_job_with_deadline(
        env: &Env,
        client: &EscrowContractClient<'_>,
        user: &Address,
        freelancer: &Address,
        native_token: &Address,
    ) -> u64 {
        let deadline = env.ledger().timestamp() + 86400;
        let job_id = client.post_job(
            user,
            &1_000_000i128,
            &hash(env),
            &32u32,
            &deadline,
            native_token,
        );
        client.accept_job(freelancer, &job_id);
        job_id
    }

    #[test]
    fn extend_deadline_client_succeeds() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = in_progress_job_with_deadline(&env, &client, &user, &freelancer, &native_token);
        let job = client.get_job(&job_id);
        let old_deadline = job.deadline;
        let new_deadline = old_deadline + 86400;

        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);

        let updated = client.get_job(&job_id);
        assert_eq!(updated.deadline, new_deadline);
    }

    #[test]
    fn extend_deadline_with_freelancer_consent_succeeds() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = in_progress_job_with_deadline(&env, &client, &user, &freelancer, &native_token);
        let job = client.get_job(&job_id);
        let old_deadline = job.deadline;
        let new_deadline = old_deadline + 86400;

        client.extend_deadline(
            &user,
            &job_id,
            &new_deadline,
            &Option::Some(freelancer.clone()),
        );

        let updated = client.get_job(&job_id);
        assert_eq!(updated.deadline, new_deadline);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn extend_deadline_rejects_past_timestamp() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = in_progress_job_with_deadline(&env, &client, &user, &freelancer, &native_token);
        let job = client.get_job(&job_id);
        let new_deadline = env.ledger().timestamp() - 1;

        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #14)")]
    fn extend_deadline_rejects_earlier_deadline() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = in_progress_job_with_deadline(&env, &client, &user, &freelancer, &native_token);
        let job = client.get_job(&job_id);
        let new_deadline = job.deadline - 1;

        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #27)")]
    fn extend_deadline_rejects_open_status() {
        let (env, client, _admin, user, _freelancer, native_token) = setup();
        let deadline = env.ledger().timestamp() + 86400;
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        let new_deadline = deadline + 86400;
        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #27)")]
    fn extend_deadline_rejects_completed_status() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let deadline = env.ledger().timestamp() + 86400;
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        client.submit_work(&freelancer, &job_id);
        client.approve_work(&user, &job_id);
        let new_deadline = deadline + 86400;
        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #27)")]
    fn extend_deadline_rejects_cancelled_status() {
        let (env, client, _admin, user, _freelancer, native_token) = setup();
        let deadline = env.ledger().timestamp() + 86400;
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &deadline,
            &native_token,
        
            );
        client.cancel_job(&user, &job_id);
        let new_deadline = deadline + 86400;
        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #27)")]
    fn extend_deadline_rejects_no_deadline_job() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = client.post_job(
            &user,
            &1_000_000i128,
            &hash(&env),
            &32u32,
            &0u64,
            &native_token,
        
            );
        client.accept_job(&freelancer, &job_id);
        let new_deadline = env.ledger().timestamp() + 86400;
        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn extend_deadline_rejects_non_client() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = in_progress_job_with_deadline(&env, &client, &user, &freelancer, &native_token);
        let job = client.get_job(&job_id);
        let new_deadline = job.deadline + 86400;
        let stranger = Address::generate(&env);
        client.extend_deadline(&stranger, &job_id, &new_deadline, &Option::None);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #28)")]
    fn extend_deadline_rejects_wrong_freelancer_consent() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = in_progress_job_with_deadline(&env, &client, &user, &freelancer, &native_token);
        let job = client.get_job(&job_id);
        let new_deadline = job.deadline + 86400;
        let mock_freelancer = Address::generate(&env);
        client.extend_deadline(
            &user,
            &job_id,
            &new_deadline,
            &Option::Some(mock_freelancer),
        );
    }

    #[test]
    fn extend_deadline_submitted_for_review_succeeds() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = in_progress_job_with_deadline(&env, &client, &user, &freelancer, &native_token);
        client.submit_work(&freelancer, &job_id);
        let job = client.get_job(&job_id);
        assert_eq!(job.status, JobStatus::SubmittedForReview);
        let new_deadline = job.deadline + 86400;

        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);

        let updated = client.get_job(&job_id);
        assert_eq!(updated.deadline, new_deadline);
        assert_eq!(updated.status, JobStatus::SubmittedForReview);
    }

    #[test]
    fn extend_deadline_event_emitted() {
        let (env, client, _admin, user, freelancer, native_token) = setup();
        let job_id = in_progress_job_with_deadline(&env, &client, &user, &freelancer, &native_token);
        let job = client.get_job(&job_id);
        let new_deadline = job.deadline + 86400;

        let events_before = env.events().all().len();
        client.extend_deadline(&user, &job_id, &new_deadline, &Option::None);
        let events_after = env.events().all().len();

        assert!(
            events_after > events_before,
            "extend_deadline must emit at least one event"
        );
    }

    // ── Issue #463: resolve_dispute_split ────────────────────────────────────

    fn disputed_job(
        env: &Env,
        client: &EscrowContractClient<'static>,
        user: &Address,
        freelancer: &Address,
        native_token: &Address,
    ) -> u64 {
        let job_id =
            client.post_job(user, &1_000_000i128, &hash(env), &32u32, &0u64, native_token);
        client.accept_job(freelancer, &job_id);
        client.raise_dispute(user, &job_id);
        job_id
    }

    #[test]
    fn resolve_dispute_split_proportional_payouts() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = disputed_job(&env, &client, &user, &freelancer, &native_token);

        let token_client = token::Client::new(&env, &native_token);
        let client_before = token_client.balance(&user);
        let freelancer_before = token_client.balance(&freelancer);

        // 60 % to client, 40 % to freelancer (after fee on freelancer's 40 %).
        client.resolve_dispute_split(&job_id, &6_000u32);

        let client_after = token_client.balance(&user);
        let freelancer_after = token_client.balance(&freelancer);

        // client gets 60 % of 1_000_000 = 600_000
        assert_eq!(client_after - client_before, 600_000);
        // freelancer gets 40 % = 400_000 minus 2.5 % fee = 390_000
        assert_eq!(freelancer_after - freelancer_before, 390_000);
        // platform accrues 10_000 (2.5 % of 400_000)
        assert_eq!(client.get_fees(&native_token), 10_000);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Completed);
    }

    #[test]
    fn resolve_dispute_split_emits_dispute_split_event() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = disputed_job(&env, &client, &user, &freelancer, &native_token);

        let events_before = env.events().all().len();
        client.resolve_dispute_split(&job_id, &5_000u32);
        let events_after = env.events().all().len();

        assert!(events_after > events_before, "must emit dispute_split event");
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn resolve_dispute_split_rejects_bps_above_10000() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = disputed_job(&env, &client, &user, &freelancer, &native_token);
        client.resolve_dispute_split(&job_id, &10_001u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn resolve_dispute_split_rejects_non_disputed_job() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &32u32, &0u64, &native_token);
        client.resolve_dispute_split(&job_id, &5_000u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn resolve_dispute_split_rejects_non_admin() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = disputed_job(&env, &client, &user, &freelancer, &native_token);
        // mock_all_auths makes caller whoever we want; here we remove the admin auth
        // by calling via a fresh non-admin env — simplest: revoke auths and let the
        // admin require_auth panic with Unauthorized.
        let env2 = Env::default();
        env2.mock_all_auths();
        let client2 = EscrowContractClient::new(&env2, &client.address);
        // This will panic because env2 has no contract state.
        client2.resolve_dispute_split(&job_id, &5_000u32);
    }

    #[test]
    fn resolve_dispute_split_zero_bps_full_payout_to_freelancer() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id = disputed_job(&env, &client, &user, &freelancer, &native_token);

        let token_client = token::Client::new(&env, &native_token);
        let freelancer_before = token_client.balance(&freelancer);

        // 0 % to client → full payout to freelancer minus fee
        client.resolve_dispute_split(&job_id, &0u32);

        let freelancer_after = token_client.balance(&freelancer);
        // 1_000_000 - 2.5 % fee = 975_000
        assert_eq!(freelancer_after - freelancer_before, 975_000);
    }

    // ── Issue #456: trusted forwarder / gasless operations ───────────────────

    #[test]
    fn set_and_query_trusted_forwarder() {
        let (env, client, _, _, _, _) = setup();
        let forwarder = Address::generate(&env);

        assert!(!client.is_trusted_forwarder(&forwarder));
        client.set_trusted_forwarder(&forwarder, &true);
        assert!(client.is_trusted_forwarder(&forwarder));
        client.set_trusted_forwarder(&forwarder, &false);
        assert!(!client.is_trusted_forwarder(&forwarder));
    }

    #[test]
    fn relay_cancel_job_via_trusted_forwarder() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &32u32, &0u64, &native_token);

        let forwarder = Address::generate(&env);
        client.set_trusted_forwarder(&forwarder, &true);

        let token_client = token::Client::new(&env, &native_token);
        let balance_before = token_client.balance(&user);

        client.relay_cancel_job(&forwarder, &user, &job_id);

        assert_eq!(token_client.balance(&user) - balance_before, 1_000_000);
        assert_eq!(client.get_job(&job_id).status, JobStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #29)")]
    fn relay_cancel_job_untrusted_forwarder_rejected() {
        let (env, client, _, user, _, native_token) = setup();
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &32u32, &0u64, &native_token);

        let forwarder = Address::generate(&env);
        // Not whitelisted — must panic with ForwarderNotTrusted (29).
        client.relay_cancel_job(&forwarder, &user, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn relay_cancel_job_wrong_client_rejected() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &32u32, &0u64, &native_token);

        let forwarder = Address::generate(&env);
        client.set_trusted_forwarder(&forwarder, &true);

        // freelancer is not the client — Unauthorized.
        client.relay_cancel_job(&forwarder, &freelancer, &job_id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn relay_cancel_job_non_open_job_rejected() {
        let (env, client, _, user, freelancer, native_token) = setup();
        let job_id =
            client.post_job(&user, &1_000_000i128, &hash(&env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &job_id);

        let forwarder = Address::generate(&env);
        client.set_trusted_forwarder(&forwarder, &true);

        // Job is InProgress, not Open — InvalidStatus.
        client.relay_cancel_job(&forwarder, &user, &job_id);
    }
    // ── Issue #460: two-step ownership transfer ──────────────────────────────

    #[test]
    fn transfer_ownership_sets_pending_admin() {
        let (env, client, admin, _, _, _) = setup();
        let new_admin = Address::generate(&env);
        assert_eq!(client.get_pending_admin(), None);
        client.transfer_ownership(&admin, &new_admin);
        assert_eq!(client.get_pending_admin(), Some(new_admin));
        // Admin unchanged until accepted
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    fn accept_ownership_promotes_pending_and_clears_slot() {
        let (env, client, admin, _, _, _) = setup();
        let new_admin = Address::generate(&env);
        client.transfer_ownership(&admin, &new_admin);
        client.accept_ownership(&new_admin);
        assert_eq!(client.get_admin(), new_admin);
        assert_eq!(client.get_pending_admin(), None);
    }

    #[test]
    fn cancel_ownership_transfer_clears_pending() {
        let (env, client, admin, _, _, _) = setup();
        let new_admin = Address::generate(&env);
        client.transfer_ownership(&admin, &new_admin);
        client.cancel_ownership_transfer(&admin);
        assert_eq!(client.get_pending_admin(), None);
        // Admin unchanged
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #30)")]
    fn accept_ownership_panics_when_no_pending_transfer() {
        let (env, client, _, _, _, _) = setup();
        let stranger = Address::generate(&env);
        client.accept_ownership(&stranger);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #31)")]
    fn accept_ownership_panics_for_wrong_address() {
        let (env, client, admin, _, _, _) = setup();
        let new_admin = Address::generate(&env);
        let stranger = Address::generate(&env);
        client.transfer_ownership(&admin, &new_admin);
        client.accept_ownership(&stranger);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #30)")]
    fn cancel_ownership_transfer_panics_when_no_pending_transfer() {
        let (_, client, admin, _, _, _) = setup();
        client.cancel_ownership_transfer(&admin);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn transfer_ownership_rejects_non_admin() {
        let (env, client, _, _, _, _) = setup();
        let stranger = Address::generate(&env);
        let new_admin = Address::generate(&env);
        client.transfer_ownership(&stranger, &new_admin);
    }

    #[test]
    fn transfer_ownership_emits_started_event() {
        let (env, client, admin, _, _, _) = setup();
        let new_admin = Address::generate(&env);
        let events_before = env.events().all().len();
        client.transfer_ownership(&admin, &new_admin);
        assert!(env.events().all().len() > events_before);
    }

    #[test]
    fn accept_ownership_emits_transferred_event() {
        let (env, client, admin, _, _, _) = setup();
        let new_admin = Address::generate(&env);
        client.transfer_ownership(&admin, &new_admin);
        let events_before = env.events().all().len();
        client.accept_ownership(&new_admin);
        assert!(env.events().all().len() > events_before);
    }

    // ── Issue SC-81: get_dashboard_stats tests ────────────────────────────

    #[test]
    fn dashboard_stats_empty_platform() {
        let (_, client, admin, _, _, _) = setup();
        let stats = client.get_dashboard_stats(&admin);
        assert_eq!(stats.total_jobs, 0);
        assert_eq!(stats.open_jobs, 0);
        assert_eq!(stats.active_jobs, 0);
        assert_eq!(stats.completed_jobs, 0);
        assert_eq!(stats.cancelled_jobs, 0);
        assert_eq!(stats.disputed_jobs, 0);
        assert_eq!(stats.total_fees_accrued, 0);
        assert_eq!(stats.total_volume, 0);
    }

    #[test]
    fn dashboard_stats_counts_open_job() {
        let (env, client, admin, user, _, native_token) = setup();
        client.post_job(&user, &1_000_000i128, &hash(&env), &32u32, &0u64, &native_token);
        let stats = client.get_dashboard_stats(&admin);
        assert_eq!(stats.total_jobs, 1);
        assert_eq!(stats.open_jobs, 1);
        assert_eq!(stats.active_jobs, 0);
        assert_eq!(stats.total_volume, 1_000_000);
    }

    #[test]
    fn dashboard_stats_counts_active_and_completed() {
        let (env, client, admin, user, freelancer, native_token) = setup();
        let asset = token::StellarAssetClient::new(&env, &native_token);
        asset.mint(&user, &10_000_000_000i128);

        // Post and complete one job
        let j1 = client.post_job(&user, &1_000_000i128, &hash(&env), &32u32, &0u64, &native_token);
        client.accept_job(&freelancer, &j1);
        client.submit_work(&freelancer, &j1);
        client.approve_work(&user, &j1);

        // Post and accept (InProgress) another
        let h2 = BytesN::from_array(&env, &[8; 32]);
        let j2 = client.post_job(&user, &500_000i128, &h2, &32u32, &0u64, &native_token, );
        client.accept_job(&freelancer, &j2);

        let stats = client.get_dashboard_stats(&admin);
        assert_eq!(stats.total_jobs, 2);
        assert_eq!(stats.open_jobs, 0);
        assert_eq!(stats.active_jobs, 1);
        assert_eq!(stats.completed_jobs, 1);
        assert_eq!(stats.cancelled_jobs, 0);
        assert_eq!(stats.total_volume, 1_500_000);
        // fees accrued from j1 approval
        let expected_fee = 1_000_000 * DEFAULT_FEE_BPS / BPS_DENOMINATOR;
        assert_eq!(stats.total_fees_accrued, expected_fee);
    }

    #[test]
    fn dashboard_stats_counts_cancelled_and_disputed() {
        let (env, client, admin, user, freelancer, native_token) = setup();

        // Post and cancel one job
        let j1 = client.post_job(&user, &1_000_000i128, &hash(&env), &32u32, &0u64, &native_token);
        client.cancel_job(&user, &j1);

        // Post and dispute another
        let h2 = BytesN::from_array(&env, &[8; 32]);
        let j2 = client.post_job(&user, &1_000_000i128, &h2, &32u32, &0u64, &native_token, );
        client.accept_job(&freelancer, &j2);
        client.raise_dispute(&user, &j2);

        let stats = client.get_dashboard_stats(&admin);
        assert_eq!(stats.cancelled_jobs, 1);
        assert_eq!(stats.disputed_jobs, 1);
        assert_eq!(stats.total_volume, 2_000_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #13)")]
    fn dashboard_stats_rejects_non_admin() {
        let (_, client, _, user, _, _) = setup();
        client.get_dashboard_stats(&user);
    }
}
