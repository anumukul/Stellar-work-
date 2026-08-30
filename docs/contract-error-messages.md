# Contract Errors → User-Facing Messages

DOC-43 ([#761](https://github.com/anumukul/Stellar-work-/issues/761)).

Every variant of the escrow contract's `Error` enum, the condition that raises
it, and the message and next step the interface should present.

## Why this exists

Frontend error handling was inconsistent because the variants were never
catalogued against expected UX. The map that used to live inline in
`frontend/lib/stellar.ts` had drifted badly from the contract:

| Code | The old map said | The contract actually defines |
| ---: | --- | --- |
| 1 | "Not authorized to perform this action." | `JobNotFound` |
| 2 | "Job not found." | `Unauthorized` |
| 4 | "Job amount must be greater than zero." | `InsufficientFunds` |
| 5 | "Token is not allowed for this operation." | `JobAlreadyAccepted` |

Codes 1 and 2 were transposed, so a user denied by an authorisation check was
told the job did not exist — and someone opening a deleted job was told they
lacked permission. Everything from 4 upward was shifted onto the wrong variant.

## Source of truth

The catalogue lives in [`frontend/lib/contract-errors.ts`](../frontend/lib/contract-errors.ts).
This table is generated from it, and
[`frontend/__tests__/contract-errors.test.ts`](../frontend/__tests__/contract-errors.test.ts)
fails if either drifts from
[`contracts/escrow/src/lib.rs`](../contracts/escrow/src/lib.rs) — by code, by
variant name, and by message text.

**Adding a contract error?** Add the variant in `lib.rs`, add the entry in
`contract-errors.ts`, and regenerate this table. The drift guard will tell you
if you miss a step.

## Using it from the frontend

```ts
import { describeContractError } from "@/lib/contract-errors";

try {
  await postJob(...);
} catch (err) {
  const described = describeContractError(err);
  if (described) {
    toast.error(described.message, { description: described.action });
  } else {
    toast.error(parseContractError(err));   // network, wallet, fee, timeout
  }
}
```

`describeContractError` returns `null` for anything that is not a contract
error, so network and wallet failures fall through to their own handling rather
than being mislabelled.

`parseContractError` in `lib/stellar.ts` already delegates here, so existing
call sites get the corrected messages without changes.

## Writing rules

Applied to every row, and enforced by tests where they can be:

- **No error codes in user text.** A discriminant is not a message.
- **Complete sentences**, capitalised, ending in a full stop.
- **Distinct messages.** Two codes sharing one message are two codes the UI
  cannot tell apart.
- **Every message pairs with an action.** "Something went wrong" without a next
  step leaves the user stuck.
- **Unknown codes still get a sentence.** The contract may be newer than the
  frontend; a user must never see a bare number.

## The table

| Code | Variant | Trigger condition | User-facing message | Suggested action |
| ---: | --- | --- | --- | --- |
| 1 | `JobNotFound` | No job exists with the given id, or it has been archived. | This job could not be found. It may have been removed or archived. | Return to the job list and pick another job. |
| 2 | `Unauthorized` | The caller is not a party to this job, or is the wrong party for the action. | You do not have permission to do this. | Switch to the wallet that owns this job, then try again. |
| 3 | `InvalidStatus` | The job is not in a status that permits this transition. | This action is not available while the job is in its current state. | Refresh the job to see its current status. |
| 4 | `InsufficientFunds` | The contract balance cannot cover the requested payout. | There are not enough funds in escrow to complete this action. | Contact support — the escrow balance does not match the job amount. |
| 5 | `JobAlreadyAccepted` | A freelancer has already accepted this job. | Someone else has already accepted this job. | Browse other open jobs. |
| 6 | `DeadlinePassed` | The job's deadline is in the past. | This job's deadline has passed. | Ask the client to extend the deadline, or cancel the job. |
| 7 | `DeadlineNotExpired` | An action requiring an expired deadline was attempted early. | The deadline has not passed yet. | Wait until the deadline before trying again. |
| 8 | `TokenNotAllowed` | The chosen token is not on the contract's allowlist. | This token is not accepted for payments. | Choose a supported token, such as XLM or USDC. |
| 9 | `FeeTooHigh` | An admin set a platform fee above the permitted maximum. | The configured platform fee is invalid. | Contact support — this is a platform configuration problem. |
| 10 | `AlreadyInitialized` | initialize() was called on an already-initialised contract. | This contract has already been set up. | No action needed. |
| 11 | `InvalidAmount` | The job amount is zero or negative. | The amount must be greater than zero. | Enter a positive amount and try again. |
| 12 | `InvalidDescriptionHash` | The description hash is all zeroes or the payload length is zero. | The job description is missing or invalid. | Add a description and try again. |
| 13 | `UnauthorizedAdmin` | A non-admin address called an admin-only function. | Only an administrator can do this. | Switch to the admin wallet if you have one. |
| 14 | `InvalidDeadline` | The supplied deadline is already in the past. | The deadline must be in the future. | Pick a later date and try again. |
| 15 | `ActiveJobLimitExceeded` | The client already holds the maximum number of active jobs. | You have reached the maximum number of active jobs. | Complete or cancel an existing job before posting another. |
| 16 | `RevisionLimitReached` | The job has been rejected the maximum number of times. | This job has reached its revision limit. | Approve the work or raise a dispute. |
| 17 | `DescriptionPayloadTooLarge` | The description payload exceeds the configured byte limit. | The job description is too long. | Shorten the description and try again. |
| 18 | `UpgradeNotApproved` | An upgrade was executed without a matching approved proposal. | This upgrade has not been approved. | Contact support — this is a platform operation. |
| 19 | `UpgradeTimelockPending` | The upgrade timelock has not elapsed. | This upgrade is still in its waiting period. | Try again after the timelock expires. |
| 20 | `NoPendingUpgrade` | An upgrade action was taken with no proposal outstanding. | There is no upgrade waiting to be applied. | No action needed. |
| 21 | `ReferralCodeAlreadyExists` | The referral code is already registered. | That referral code is already taken. | Choose a different code. |
| 22 | `ReferralCodeNotFound` | No referral code matches the one supplied. | That referral code does not exist. | Check the code and try again. |
| 23 | `InsufficientReferralEarnings` | A withdrawal exceeded the caller's referral balance. | You do not have enough referral earnings to withdraw. | Check your referral balance and withdraw a smaller amount. |
| 24 | `BlacklistedUser` | The caller's address is blacklisted. | This account is not permitted to use the platform. | Contact support if you believe this is a mistake. |
| 25 | `NotWhitelisted` | Whitelist mode is on and the caller is not whitelisted. | The platform is currently invitation-only. | Request access, or contact support. |
| 26 | `SelfReferralNotAllowed` | A client used their own referral code. | You cannot refer yourself. | Use a referral code from someone else, or continue without one. |
| 27 | `DeadlineNotExtendable` | The job's status does not allow a deadline change. | This job's deadline can no longer be changed. | Refresh the job to see its current status. |
| 28 | `NoFreelancerAssigned` | An action requiring an assigned freelancer ran on an unassigned job. | No freelancer has accepted this job yet. | Wait for a freelancer to accept before continuing. |
| 29 | `ForwarderNotTrusted` | A meta-transaction came through an unregistered forwarder. | This request came from an untrusted source. | Try again from the official app. |
| 30 | `NoPendingTransfer` | An ownership transfer was accepted or cancelled with none pending. | There is no ownership transfer waiting. | No action needed. |
| 31 | `NotPendingAdmin` | An address other than the nominee tried to accept ownership. | You are not the nominated administrator. | Switch to the nominated wallet. |
| 32 | `BatchSizeMismatch` | Batch input arrays had differing lengths. | The batch request was malformed. | Try again with matching inputs. |
| 33 | `BatchTooLarge` | The batch exceeded the permitted size. | Too many items in one request. | Split the request into smaller batches. |
| 34 | `AttestationNotFound` | No attestation exists with the given id. | That attestation could not be found. | Check the id and try again. |
| 35 | `JobNotVisible` | The job is private and the viewer is not invited. | This job is private. | Ask the client for an invitation. |
| 36 | `FreelancerNotInvited` | A freelancer tried to accept a private job without an invitation. | You have not been invited to this job. | Ask the client to invite you, or browse open jobs. |
| 37 | `OracleNotFound` | No oracle is registered at the given address. | That oracle is not registered. | Contact support — this is a platform configuration problem. |
| 38 | `OracleNotActive` | The oracle exists but is disabled. | This oracle is not currently active. | Try again later, or contact support. |
| 39 | `OracleNotAssigned` | An oracle submitted a verdict for a job it was not assigned. | This oracle is not assigned to that dispute. | Contact support. |
| 40 | `OracleAlreadySubmitted` | The oracle already recorded a verdict for this dispute. | A verdict has already been submitted. | No action needed. |
| 41 | `InsufficientBurnPool` | A burn exceeded the accumulated burn pool. | There are not enough funds in the burn pool. | Contact support — this is a platform operation. |
| 42 | `InvalidBurnPercentage` | The burn percentage is outside the permitted range. | The configured burn rate is invalid. | Contact support — this is a platform configuration problem. |
| 43 | `NoActiveOracles` | A dispute needed an oracle and none were active. | No dispute resolvers are available right now. | Try again later, or contact support. |

## Lifecycle errors by flow

The subset a frontend developer meets most often.

**Posting a job** — `InvalidAmount` (11), `InvalidDeadline` (14),
`InvalidDescriptionHash` (12), `DescriptionPayloadTooLarge` (17),
`TokenNotAllowed` (8), `ActiveJobLimitExceeded` (15), `DuplicateNonce` where
idempotency nonces are in use.

**Accepting a job** — `JobNotFound` (1), `JobAlreadyAccepted` (5),
`InvalidStatus` (3), `DeadlinePassed` (6), `JobNotVisible` (35),
`FreelancerNotInvited` (36), `Unauthorized` (2) when a client tries to accept
their own job.

**Submitting and approving** — `InvalidStatus` (3), `Unauthorized` (2),
`NoFreelancerAssigned` (28), `RevisionLimitReached` (16).

**Cancelling and disputing** — `InvalidStatus` (3), `DeadlineNotExpired` (7),
`Unauthorized` (2), `NoActiveOracles` (43).

**Access control** — `BlacklistedUser` (24), `NotWhitelisted` (25). Both are
account-level and not the user's fault to fix; route them to support rather
than offering a retry.
