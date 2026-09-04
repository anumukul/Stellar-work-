# Concurrent Load Testing for Soroban Smart Contract

This document outlines the approach, expected outcomes, and performance characteristics for concurrent user load testing of the StellarWork Soroban smart contract.

## 1. Load Testing Script

The load testing script is located at `load-tests/concurrent-contract.js`. It simulates concurrent transaction submissions using the `@stellar/stellar-sdk` to evaluate how the Soroban contract handles load and potential race conditions.

### Running the Test

```bash
export CONTRACT_ID="C..."
export RPC_URL="https://soroban-testnet.stellar.org"
node load-tests/concurrent-contract.js
```

## 2. Test Scenarios and Expected Behaviors

### Scenario 1: 100+ Concurrent Job Postings
**Test:** Simulates 100 unique clients posting a job at the exact same time.
**Behavior:**
- **Success Rate:** Should be extremely high (near 100%), depending entirely on the network's capacity and current congestion. 
- **Bottlenecks:** Because each job posting creates a new unique state entry (a new job ID and new Job details map), there are no state conflicts. The bottleneck will strictly be the RPC node's rate limits and the Soroban network's TPS limit.

### Scenario 2: Concurrent `accept_job` for the Same Job
**Test:** Simulates 10 freelancers attempting to accept the exact same job ID concurrently.
**Behavior:**
- **Success Rate:** Exactly **1** transaction should succeed. The remaining 9 transactions will fail.
- **Failure Modes:** 
  - The first transaction to be included in the ledger will change the job's state from `Open` to `InProgress`.
  - Subsequent transactions in the same block or next blocks will encounter a **contract logic error** (e.g., "Job is not Open") or a **concurrent invocation/data conflict error** at the Soroban host level because the footprint of the state they are trying to modify has changed.
- **Race Condition Prevention:** Soroban's state management and deterministic execution guarantee that there will be no double-spending or double-accepting. Only one freelancer will successfully update the job state.

## 3. Bottlenecks & Failure Modes

- **RPC Rate Limits:** Sending 100+ concurrent RPC requests to the public Testnet RPC might trigger HTTP 429 Too Many Requests. Production applications should use dedicated RPC nodes.
- **Sequence Number Collisions:** In testing, if multiple transactions are submitted from the *same* source account concurrently, they will fail due to sequence number conflicts (txBAD_SEQ). This test avoids this by generating unique keypairs for each simulated user.
- **State Footprint Conflicts:** If multiple users try to modify the exact same storage key (like a global counter), they can face `tx_failed` errors due to footprint conflicts. For example, if `post_job` increments a global `job_count` key, this becomes a high-contention bottleneck. To alleviate this, consider using Soroban's temporary or instance storage effectively, or avoid global counters in favor of event emission and off-chain indexing.

## 4. Recommendations
- Monitor the success rates of `post_job` vs the `job_count` contention. If the global counter becomes a bottleneck, refactor to use events for tracking the total number of jobs.
- Handle frontend errors gracefully for contested jobs (Scenario 2). If a user attempts to accept a job that was just taken, catch the contract error and show a user-friendly message: "This job has just been assigned to another freelancer."
