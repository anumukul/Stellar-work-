# Frontend-Contract Interaction Guide (Issue #642, DOC-39)

## Summary

This PR adds a comprehensive technical guide documenting how the StellarWork frontend communicates with the Soroban smart contract. The guide covers the actual code patterns and APIs used in this codebase, not generic Soroban documentation.

**Location:** `docs/FRONTEND_CONTRACT_INTERACTION.md` (1007 lines)

## What's Documented

### 1. Contract.ts API Reference
- All 50+ exported functions with signatures, parameters, return types, and real usage examples
- Covers job lifecycle (`postJob`, `acceptJob`, `submitWork`, `approveWork`, `cancelJob`, etc.)
- Query functions (read-only): `getJob`, `getJobCount`, `getMilestones`, `getFees`, etc.
- Milestone operations: `createJobWithMilestones`, `approveMilestone`
- Admin functions: token whitelist management, fee withdrawal, access control
- Dispute resolution: `raiseDispute`, `resolveDispute`
- Deadline management: `extendDeadline`, `enforceDeadline`
- Description storage: IPFS CID mapping functions
- Batch operations: `batchApproveJobs`
- Access control: whitelist/blacklist management, trusted forwarders

Every function includes:
- Full TypeScript signature
- Parameter descriptions with types
- Return type and value semantics
- Code examples pulled from or closely mirroring the actual implementation

### 2. ScVal Encoding Patterns
Documents how the frontend converts between JavaScript/TypeScript values and Soroban's ScVal format:

- **Primitive type mapping:** address, i128, u32, u64, bool, symbol, string, bytes
- **Complex types:** vectors (arrays), maps (structs), optional types (Vec wrappers)
- **Enum encoding:** symbols for unit variants
- **Hex-to-bytes conversion:** the `hexToBytes()` utility with full source
- **Real examples:** milestone struct encoding, job ID vector encoding

This section is critical because ScVal encoding is the most error-prone integration point, especially for custom types like milestone structs.

### 3. Transaction Lifecycle
End-to-end tracing of how a contract call flows through the codebase:

- **Architecture diagram** showing data flow from UI → contract.ts → stellar.ts → Soroban RPC
- **Read-only flow:** account setup → build → simulate → return result (no signing)
- **Write flow:** account setup → build → simulate → assemble → sign (Freighter) → submit → poll
- **Sub-step details** for each phase with actual code snippets from `stellar.ts`
- **Polling mechanism:** default 30-second timeout, 3-second intervals
- **Error handling at each stage:** simulation failures, signing rejections, submission errors

The guide traces the ACTUAL code in `callContract()` in `stellar.ts`, not a generic textbook description.

### 4. Error Handling
- **Error code reference table:** all 25 error codes from the Soroban contract with descriptions
- **Error detection pattern:** where errors surface (simulation, submission, polling)
- **Error handling idiom:** try-catch wrapping, TransactionResult status checking
- **Wallet-specific errors:** "Connect Wallet" state, Freighter permission denied

### 5. Event Handling
**Explicitly documented as NOT YET IMPLEMENTED:**
- Lists contract event types that the contract CAN emit (e.g., `job_posted`, `job_accepted`)
- Explains why the current frontend uses polling + direct queries instead
- Notes this as a gap for future enhancement (real-time UI updates)
- Provides placeholder for how event listening would be implemented

This is critical to prevent contributors from writing code expecting event listeners that don't exist.

## Accuracy Verification

Every code example has been verified against the actual source:

- All 50+ function signatures match `frontend/lib/contract.ts` exactly
- Type descriptors for `nativeToScVal` calls match actual usage in contract.ts
- Transaction flow matches the actual implementation in `frontend/lib/stellar.ts`
- Error codes match the `#[contracterror]` enum in `contracts/escrow/src/lib.rs`
- Read-only vs write flags match actual pattern in callContract

## Gaps Documented in the Guide

The following issues were identified during documentation and are noted in the guide rather than fixed (outside the scope of this PR):

1. **Event listening not implemented:** The frontend does not currently listen to contract events. Jobs are fetched via polling and direct queries. This works but prevents real-time, multi-user updates (e.g., another freelancer accepting a posted job). The guide explicitly notes this and explains why.

2. **Error handling inconsistency:** Error detection primarily relies on catching exceptions during simulation or checking TransactionResult.status. There's no centralized error parsing layer that extracts and maps contract error codes back to friendly messages. Each consumer of contract functions must catch and handle errors individually.

3. **No error code mapping utility:** While all error codes are documented, there's no `mapErrorCode(code: number): string` utility function that converts numeric error codes to human-readable messages. Frontend pages construct error messages ad-hoc.

4. **ScVal decoding for complex types:** The guide shows how ScVal values are returned from read-only calls (via `scValToNative()`), but complex return types (like the Job struct) rely on Stellar SDK's default decoding. There's no custom unmarshalling logic for edge cases (e.g., if a contract adds new fields in a future upgrade).

These gaps are noted in the guide as documentation-adjacent findings worth a maintainer's attention, but fixing them is outside the scope of this documentation-only PR.

## File Changes

- **Added:** `docs/FRONTEND_CONTRACT_INTERACTION.md` (39,790 bytes, 1007 lines)
- **Modified:** None
- **Deleted:** None

This is a pure-addition change to documentation. No application code was modified.

## Testing

The guide was verified against the actual codebase:

1. ✅ Compared all 50+ function signatures in the guide against `frontend/lib/contract.ts`
2. ✅ Verified type encoding patterns against `nativeToScVal` calls in contract.ts
3. ✅ Traced transaction flow against the full `callContract()` implementation in stellar.ts
4. ✅ Confirmed error codes against the contract's `#[contracterror]` enum in lib.rs
5. ✅ Checked Job and Milestone types against `frontend/lib/types.ts`
6. ✅ Verified ScVal examples compile against Stellar SDK API

All code examples are accurate to the real API surface and would compile/run if used in a page component.

## Motivation

Closing issue #642 (DOC-39): Frontend developers joining the StellarWork project needed documentation explaining how to make their first contract call. The existing documentation (FRONTEND_ARCHITECTURE.md and CONTRACT.md) provided good overviews but left developers puzzled about:

- Which contract functions exist and how to call them from React
- How to encode complex types like milestones as ScVal
- What the full transaction lifecycle looks like (simulation → signing → submission → polling)
- How errors surface and how to detect them
- What event types exist (and why the UI doesn't use them)

This guide fills those gaps by tracing the actual code path with real examples.

## References

- Resolves: #642 (DOC-39)
- Related: #XXX (any past issues about Soroban integration)
- Existing docs: `docs/CONTRACT.md`, `docs/FRONTEND_ARCHITECTURE.md`

## Notes for Reviewers

1. **No code changes:** This is documentation only. No application or test code was modified.
2. **Accuracy over brevity:** The guide is detailed (1007 lines) but every claim traces back to real code.
3. **Gap documentation:** Explicitly notes unimplemented features (event listening) and inconsistencies (error handling) rather than inventing plausible code.
4. **Real examples:** Every code snippet is either directly from the codebase or a minimal adaptation of real call patterns.
5. **New contributor perspective:** Written for someone's first day on the team who needs to understand how to call a contract function from the frontend.

---

*Generated for StellarWork Frontend-Contract Integration documentation (Issue #642, DOC-39)*
