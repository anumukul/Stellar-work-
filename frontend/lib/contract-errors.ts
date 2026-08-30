/**
 * Contract error catalogue — DOC-43 (#761).
 *
 * Every variant of the escrow contract's `Error` enum, paired with the message
 * a user should see and the action the UI should offer. The authoritative
 * source is `contracts/escrow/src/lib.rs`; the table in
 * `docs/contract-error-messages.md` is generated from this file, and
 * `__tests__/contract-errors.test.ts` fails if the two drift from the Rust
 * enum.
 *
 * This replaces an inline map in `lib/stellar.ts` that had drifted badly from
 * the contract: it reported code 1 as "Not authorized" and code 2 as "Job not
 * found" when the contract defines exactly the reverse, and every code from 4
 * upward was shifted onto the wrong variant. A user denied by an authorisation
 * check was told the job did not exist, and vice versa.
 *
 * Three fields rather than one message, because a good error does three jobs:
 * it says what happened (`message`), tells the user what to do next
 * (`action`), and tells a developer reading the catalogue when it fires
 * (`trigger`).
 */

/** One contract error variant and the UX that should accompany it. */
export interface ContractErrorSpec {
  /** Numeric discriminant, as emitted in `Error(Contract, #N)`. */
  code: number;
  /** Exact variant name in the Rust enum. Used by the drift guard. */
  variant: string;
  /** When the contract raises this, in developer terms. */
  trigger: string;
  /** What the user is shown. One sentence, no jargon, no error codes. */
  message: string;
  /** What the UI should offer next. */
  action: string;
}

function spec(
  code: number,
  variant: string,
  trigger: string,
  message: string,
  action: string,
): ContractErrorSpec {
  return { code, variant, trigger, message, action };
}

/**
 * The catalogue, keyed by numeric code.
 *
 * Ordered by code to match the Rust enum, so the two can be diffed by eye.
 */
export const CONTRACT_ERRORS: Record<number, ContractErrorSpec> = {
  1: spec(
    1,
    "JobNotFound",
    "No job exists with the given id, or it has been archived.",
    "This job could not be found. It may have been removed or archived.",
    "Return to the job list and pick another job.",
  ),
  2: spec(
    2,
    "Unauthorized",
    "The caller is not a party to this job, or is the wrong party for the action.",
    "You do not have permission to do this.",
    "Switch to the wallet that owns this job, then try again.",
  ),
  3: spec(
    3,
    "InvalidStatus",
    "The job is not in a status that permits this transition.",
    "This action is not available while the job is in its current state.",
    "Refresh the job to see its current status.",
  ),
  4: spec(
    4,
    "InsufficientFunds",
    "The contract balance cannot cover the requested payout.",
    "There are not enough funds in escrow to complete this action.",
    "Contact support — the escrow balance does not match the job amount.",
  ),
  5: spec(
    5,
    "JobAlreadyAccepted",
    "A freelancer has already accepted this job.",
    "Someone else has already accepted this job.",
    "Browse other open jobs.",
  ),
  6: spec(
    6,
    "DeadlinePassed",
    "The job's deadline is in the past.",
    "This job's deadline has passed.",
    "Ask the client to extend the deadline, or cancel the job.",
  ),
  7: spec(
    7,
    "DeadlineNotExpired",
    "An action requiring an expired deadline was attempted early.",
    "The deadline has not passed yet.",
    "Wait until the deadline before trying again.",
  ),
  8: spec(
    8,
    "TokenNotAllowed",
    "The chosen token is not on the contract's allowlist.",
    "This token is not accepted for payments.",
    "Choose a supported token, such as XLM or USDC.",
  ),
  9: spec(
    9,
    "FeeTooHigh",
    "An admin set a platform fee above the permitted maximum.",
    "The configured platform fee is invalid.",
    "Contact support — this is a platform configuration problem.",
  ),
  10: spec(
    10,
    "AlreadyInitialized",
    "initialize() was called on an already-initialised contract.",
    "This contract has already been set up.",
    "No action needed.",
  ),
  11: spec(
    11,
    "InvalidAmount",
    "The job amount is zero or negative.",
    "The amount must be greater than zero.",
    "Enter a positive amount and try again.",
  ),
  12: spec(
    12,
    "InvalidDescriptionHash",
    "The description hash is all zeroes or the payload length is zero.",
    "The job description is missing or invalid.",
    "Add a description and try again.",
  ),
  13: spec(
    13,
    "UnauthorizedAdmin",
    "A non-admin address called an admin-only function.",
    "Only an administrator can do this.",
    "Switch to the admin wallet if you have one.",
  ),
  14: spec(
    14,
    "InvalidDeadline",
    "The supplied deadline is already in the past.",
    "The deadline must be in the future.",
    "Pick a later date and try again.",
  ),
  15: spec(
    15,
    "ActiveJobLimitExceeded",
    "The client already holds the maximum number of active jobs.",
    "You have reached the maximum number of active jobs.",
    "Complete or cancel an existing job before posting another.",
  ),
  16: spec(
    16,
    "RevisionLimitReached",
    "The job has been rejected the maximum number of times.",
    "This job has reached its revision limit.",
    "Approve the work or raise a dispute.",
  ),
  17: spec(
    17,
    "DescriptionPayloadTooLarge",
    "The description payload exceeds the configured byte limit.",
    "The job description is too long.",
    "Shorten the description and try again.",
  ),
  18: spec(
    18,
    "UpgradeNotApproved",
    "An upgrade was executed without a matching approved proposal.",
    "This upgrade has not been approved.",
    "Contact support — this is a platform operation.",
  ),
  19: spec(
    19,
    "UpgradeTimelockPending",
    "The upgrade timelock has not elapsed.",
    "This upgrade is still in its waiting period.",
    "Try again after the timelock expires.",
  ),
  20: spec(
    20,
    "NoPendingUpgrade",
    "An upgrade action was taken with no proposal outstanding.",
    "There is no upgrade waiting to be applied.",
    "No action needed.",
  ),
  21: spec(
    21,
    "ReferralCodeAlreadyExists",
    "The referral code is already registered.",
    "That referral code is already taken.",
    "Choose a different code.",
  ),
  22: spec(
    22,
    "ReferralCodeNotFound",
    "No referral code matches the one supplied.",
    "That referral code does not exist.",
    "Check the code and try again.",
  ),
  23: spec(
    23,
    "InsufficientReferralEarnings",
    "A withdrawal exceeded the caller's referral balance.",
    "You do not have enough referral earnings to withdraw.",
    "Check your referral balance and withdraw a smaller amount.",
  ),
  24: spec(
    24,
    "BlacklistedUser",
    "The caller's address is blacklisted.",
    "This account is not permitted to use the platform.",
    "Contact support if you believe this is a mistake.",
  ),
  25: spec(
    25,
    "NotWhitelisted",
    "Whitelist mode is on and the caller is not whitelisted.",
    "The platform is currently invitation-only.",
    "Request access, or contact support.",
  ),
  26: spec(
    26,
    "SelfReferralNotAllowed",
    "A client used their own referral code.",
    "You cannot refer yourself.",
    "Use a referral code from someone else, or continue without one.",
  ),
  27: spec(
    27,
    "DeadlineNotExtendable",
    "The job's status does not allow a deadline change.",
    "This job's deadline can no longer be changed.",
    "Refresh the job to see its current status.",
  ),
  28: spec(
    28,
    "NoFreelancerAssigned",
    "An action requiring an assigned freelancer ran on an unassigned job.",
    "No freelancer has accepted this job yet.",
    "Wait for a freelancer to accept before continuing.",
  ),
  29: spec(
    29,
    "ForwarderNotTrusted",
    "A meta-transaction came through an unregistered forwarder.",
    "This request came from an untrusted source.",
    "Try again from the official app.",
  ),
  30: spec(
    30,
    "NoPendingTransfer",
    "An ownership transfer was accepted or cancelled with none pending.",
    "There is no ownership transfer waiting.",
    "No action needed.",
  ),
  31: spec(
    31,
    "NotPendingAdmin",
    "An address other than the nominee tried to accept ownership.",
    "You are not the nominated administrator.",
    "Switch to the nominated wallet.",
  ),
  32: spec(
    32,
    "BatchSizeMismatch",
    "Batch input arrays had differing lengths.",
    "The batch request was malformed.",
    "Try again with matching inputs.",
  ),
  33: spec(
    33,
    "BatchTooLarge",
    "The batch exceeded the permitted size.",
    "Too many items in one request.",
    "Split the request into smaller batches.",
  ),
  34: spec(
    34,
    "AttestationNotFound",
    "No attestation exists with the given id.",
    "That attestation could not be found.",
    "Check the id and try again.",
  ),
  35: spec(
    35,
    "JobNotVisible",
    "The job is private and the viewer is not invited.",
    "This job is private.",
    "Ask the client for an invitation.",
  ),
  36: spec(
    36,
    "FreelancerNotInvited",
    "A freelancer tried to accept a private job without an invitation.",
    "You have not been invited to this job.",
    "Ask the client to invite you, or browse open jobs.",
  ),
  37: spec(
    37,
    "OracleNotFound",
    "No oracle is registered at the given address.",
    "That oracle is not registered.",
    "Contact support — this is a platform configuration problem.",
  ),
  38: spec(
    38,
    "OracleNotActive",
    "The oracle exists but is disabled.",
    "This oracle is not currently active.",
    "Try again later, or contact support.",
  ),
  39: spec(
    39,
    "OracleNotAssigned",
    "An oracle submitted a verdict for a job it was not assigned.",
    "This oracle is not assigned to that dispute.",
    "Contact support.",
  ),
  40: spec(
    40,
    "OracleAlreadySubmitted",
    "The oracle already recorded a verdict for this dispute.",
    "A verdict has already been submitted.",
    "No action needed.",
  ),
  41: spec(
    41,
    "InsufficientBurnPool",
    "A burn exceeded the accumulated burn pool.",
    "There are not enough funds in the burn pool.",
    "Contact support — this is a platform operation.",
  ),
  42: spec(
    42,
    "InvalidBurnPercentage",
    "The burn percentage is outside the permitted range.",
    "The configured burn rate is invalid.",
    "Contact support — this is a platform configuration problem.",
  ),
  43: spec(
    43,
    "NoActiveOracles",
    "A dispute needed an oracle and none were active.",
    "No dispute resolvers are available right now.",
    "Try again later, or contact support.",
  ),
};

/** Every code in the catalogue, ascending. */
export const CONTRACT_ERROR_CODES: number[] = Object.keys(CONTRACT_ERRORS)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * Pull the numeric code out of a thrown Soroban error.
 *
 * Soroban renders contract errors as `Error(Contract, #N)`, sometimes nested
 * inside a longer `HostError` string. Returns `null` when the error is not a
 * contract error, so a caller can fall through to network or wallet handling
 * rather than mislabelling it.
 */
export function extractContractErrorCode(error: unknown): number | null {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const match = raw.match(/error\s*\(\s*contract\s*,\s*#(\d+)\s*\)/i);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

/** The catalogue entry for a code, or `undefined` when unknown. */
export function contractErrorFor(code: number): ContractErrorSpec | undefined {
  return CONTRACT_ERRORS[code];
}

/**
 * The user-facing message for a code.
 *
 * An unrecognised code still gets a usable sentence rather than a raw number:
 * the contract may be newer than the frontend, and a user should never be shown
 * a bare discriminant.
 */
export function messageForContractCode(code: number): string {
  return (
    CONTRACT_ERRORS[code]?.message ??
    "Something went wrong on-chain. Please try again, or contact support if it persists."
  );
}

/** The suggested next step for a code. */
export function actionForContractCode(code: number): string {
  return (
    CONTRACT_ERRORS[code]?.action ??
    "Try again, or contact support with the details of what you were doing."
  );
}

/**
 * Message and action for a thrown error, or `null` if it is not a contract
 * error.
 *
 * The entry point for UI code: one call decides whether this is a contract
 * failure and, if so, what to show.
 */
export function describeContractError(
  error: unknown,
): { code: number; message: string; action: string } | null {
  const code = extractContractErrorCode(error);
  if (code === null) return null;
  return {
    code,
    message: messageForContractCode(code),
    action: actionForContractCode(code),
  };
}
