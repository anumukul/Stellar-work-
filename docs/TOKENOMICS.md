# Tokenomics

This document explains the StellarWork platform's economic model, fee structure, and how funds flow through the system.

## Fee Structure

### Current Platform Fee

| Parameter | Value |
|-----------|-------|
| Platform fee | 2.5% (250 basis points) |
| Fee recipient | Platform admin (contract-controlled) |
| Fee deduction point | On work approval (payment release) |

### What the Fee Covers

- **Development**: Ongoing platform development, smart contract audits, and feature improvements
- **Infrastructure**: Soroban RPC nodes, IPFS storage for job descriptions, hosting, and monitoring
- **Support**: Community support, documentation, and dispute resolution tooling

### Comparison with Traditional Platforms

| Platform | Fee |
|----------|-----|
| **StellarWork** | **2.5%** |
| Upwork | 10-20% |
| Fiverr | 20% |
| Toptal | ~30% markup |
| Freelancer.com | 10% + listing fees |

StellarWork's fee is significantly lower because the platform runs on Stellar's Soroban smart contracts, eliminating intermediaries and reducing operational overhead.

### Future Fee Tiers

As the platform grows, the following fee reductions are planned:

| Tier | Criteria | Fee |
|------|----------|-----|
| Standard | Default | 2.5% |
| Loyal Client | 10+ completed jobs | 2.0% |
| Power Client | 50+ completed jobs | 1.5% |
| Early Adopter | First 1000 users | 1.0% for first year |

Fee tier changes will be governed by community vote once the DAO is established.

## Revenue Flow

### Payment Lifecycle

```
Client posts job
    |
    v
XLM escrowed in smart contract
    |
    v
Freelancer accepts and completes work
    |
    v
Client approves work
    |
    v
Smart contract splits payment:
    ├── 97.5% → Freelancer wallet
    └── 2.5%  → Platform fee pool
                    |
                    v
              Admin withdrawal
```

### Detailed Flow

1. **Job Posting**: Client escrows the full job amount in XLM (or supported token) into the smart contract.
2. **Work Completion**: Freelancer submits work; client reviews and approves.
3. **Payment Release**: On approval, the smart contract automatically:
   - Transfers 97.5% of the escrowed amount to the freelancer's wallet
   - Retains 2.5% as platform fee in the contract's fee pool
4. **Fee Withdrawal**: The platform admin can withdraw accrued fees from the contract at any time.

### Burn Mechanism

A portion of platform fees may be burned (permanently removed from circulation) in future versions to create deflationary pressure. This is not currently implemented but is under consideration for the DAO governance phase.

## Economic Model

### Sustainability

StellarWork sustains itself through:

- **Transaction fees**: The 2.5% fee on every completed job funds operations
- **Low overhead**: Smart contracts replace intermediaries, keeping costs minimal
- **Stellar network**: Transaction costs on Stellar are fractions of a cent, unlike Ethereum-based platforms

### Value Accrual

Value accrues to the platform through:

- **Network effects**: More clients and freelancers increase liquidity and job matching quality
- **Fee revenue**: Growing transaction volume increases platform revenue
- **Reputation system**: Completed jobs build trust, attracting higher-value work
- **Token utility**: Future governance token gives holders voting rights over platform parameters

### Decentralization Roadmap

| Phase | Governance | Fee Control |
|-------|-----------|-------------|
| Phase 1 (Current) | Centralized admin | Admin sets fees |
| Phase 2 | Advisory council | Community proposals, admin approval |
| Phase 3 (DAO) | Token-holder voting | DAO votes on fee changes |

The long-term goal is full decentralization through a DAO where token holders vote on:

- Platform fee percentage
- Fee tier thresholds
- Treasury allocation
- Protocol upgrades

## Transparency

### Contract Verification

All fee logic is implemented in open-source Soroban smart contracts. The contract code is publicly auditable:

- **Repository**: [contracts/escrow/](../contracts/escrow/)
- **Fee calculation**: See `approve_work` function in the escrow contract
- **Fee withdrawal**: See `withdraw_fees` function in the escrow contract

### Public Audit Trail

Every fee transaction is recorded on the Stellar blockchain and can be verified through:

- **Stellar Expert**: [stellar.expert](https://stellar.expert) — search by contract address
- **Stellar Laboratory**: [laboratory.stellar.org](https://laboratory.stellar.org) — query contract state

### Fee Withdrawal Records

All admin fee withdrawals are logged on-chain. The admin panel maintains a local history, but the definitive record is always on the Stellar ledger.

## FAQ

### Why is there a fee?

The 2.5% fee funds platform development, infrastructure costs (RPC nodes, IPFS storage), and community support. Without it, the platform could not sustain itself.

### When is the fee charged?

The fee is only charged when a client approves completed work. If a job is cancelled before completion, the full escrowed amount is refunded to the client with no fee deducted.

### Can I see exactly how much fee was charged?

Yes. Every transaction is recorded on the Stellar blockchain. You can verify the exact fee amount for any job by looking up the transaction on Stellar Expert or the Stellar Laboratory.

### How does this compare to Upwork or Fiverr?

StellarWork charges 2.5% compared to Upwork's 10-20% and Fiverr's 20%. The lower fee is possible because smart contracts replace intermediaries and Stellar's transaction costs are negligible.

### Will the fee change?

Fee changes will be proposed through the community governance process. Once the DAO is established, token holders will vote on any fee adjustments.

### What happens to the fees?

Fees accrue in the smart contract and can be withdrawn by the platform admin to fund development, infrastructure, and operations. In the future, a portion may be burned or allocated to a community treasury.

### Is the fee the same for all tokens?

Yes. The 2.5% fee applies to all supported tokens (XLM and any whitelisted assets). The fee percentage is fixed in the smart contract and applies uniformly.

### What if there is a dispute?

If a dispute is raised, the escrowed funds (including the fee portion) remain locked until the dispute is resolved by the platform admin. The fee is only finalized when the dispute is settled and payment is released.
