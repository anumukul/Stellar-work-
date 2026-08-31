# Stellar Network Comparison: Testnet vs Mainnet

This guide provides a comprehensive comparison between the Stellar Testnet and Mainnet to help developers understand the differences, prepare for mainnet deployment, and troubleshoot network-specific issues.

## Network Parameter Differences

| Parameter | Testnet | Mainnet |
| :--- | :--- | :--- |
| **Network Passphrase** | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| **Horizon URL** | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |
| **Friendbot** | Available (funds new accounts with test XLM) | Not available (must be funded with real XLM) |
| **Data Retention** | Ledger data may be reset periodically | Permanent, immutable ledger |
| **Base Fee** | 100 stroops (can fluctuate during surges) | 100 stroops (can fluctuate significantly during surges) |
| **Validator Nodes** | SDF and community test nodes | SDF, Tier 1 organizations, and diverse community nodes |

## Mainnet-Specific Considerations

When moving from Testnet to Mainnet, keep the following considerations in mind:

1. **Real Value at Stake:** Mainnet transactions involve real assets. A bug in your smart contract or application logic can lead to permanent financial loss.
2. **Account Funding:** You must fund your mainnet accounts with real XLM (minimum 1 XLM for the base reserve) to activate them.
3. **Reserves and Liabilities:** Mainnet requires maintaining strict XLM reserves for trustlines, offers, and data entries. Ensure your application accounts for these reserves to avoid `op_low_reserve` errors.
4. **Surge Pricing:** Mainnet experiences higher traffic, making it more susceptible to surge pricing. Your application should implement dynamic fee estimation and handle transaction timeouts gracefully.
5. **Node Infrastructure:** Relying solely on the public SDF Horizon API for production applications is not recommended due to rate limits. Consider running your own Horizon node or using a commercial infrastructure provider.
6. **Data Immutability:** Unlike the Testnet, which is occasionally reset, Mainnet data is permanent. You cannot undo a transaction once it is confirmed.

## Cost and Performance Comparisons

### Cost
* **Testnet:** Completely free. XLM is provided by Friendbot.
* **Mainnet:** Transactions require real XLM for fees and reserves. While base fees are incredibly low (a fraction of a cent), complex operations (like those involving Soroban smart contracts) or periods of high network congestion will increase costs.

### Performance
* **Throughput:** Both networks support high throughput (thousands of transactions per second).
* **Latency:** Ledger closing times are identical on both networks (typically 5-6 seconds).
* **Reliability:** Mainnet is significantly more robust and distributed, offering higher uptime and resilience. Testnet is designed for testing and may occasionally experience downtime or planned resets.

## Deployment Checklist for Mainnet

Before deploying your application to the Stellar Mainnet, ensure you have completed the following checklist:

- [ ] **Testnet Validation:** The application has been thoroughly tested on the Testnet without errors.
- [ ] **Smart Contract Audits:** If using Soroban, smart contracts have been audited by a reputable third party.
- [ ] **Update Network Passphrase:** The application is configured to use the `Public Global Stellar Network ; September 2015` passphrase.
- [ ] **Update API Endpoints:** All API requests are routed to Mainnet Horizon/RPC instances (e.g., `https://horizon.stellar.org`).
- [ ] **Account Funding Strategy:** A secure mechanism is in place to fund necessary accounts and manage minimum reserves.
- [ ] **Dynamic Fee Management:** The application implements fee bumping or dynamic fee estimation to handle surge pricing.
- [ ] **Error Handling:** Robust error handling is implemented for common Stellar errors (e.g., rate limits, low reserves, sequence number mismatches).
- [ ] **Infrastructure Readiness:** A production-grade Horizon/RPC node setup is in place (self-hosted or via a provider) to avoid public API rate limits.
- [ ] **Security Review:** Key management practices have been reviewed. Private keys are securely stored and never exposed to the frontend.

## Troubleshooting Network Issues

| Issue | Potential Cause | Solution |
| :--- | :--- | :--- |
| **`tx_bad_seq` Error** | Sequence number mismatch. Often caused by concurrent transactions from the same account. | Fetch the latest sequence number from Horizon and retry. Implement a queue for transactions from the same account. |
| **`op_low_reserve` Error** | Account does not have enough XLM to meet the minimum reserve requirement for a new trustline, offer, or data entry. | Send more XLM to the account to cover the base reserve plus the required additional reserve for the new entries. |
| **Transaction Timeout** | Fee is too low during surge pricing, or the network is congested. | Increase the transaction fee and resubmit. Implement fee bumping strategies. |
| **Rate Limit Exceeded (429)** | Exceeded the request limit on the public SDF Horizon API. | Implement exponential backoff and retries. Switch to a dedicated Horizon node or commercial API provider. |
| **`tx_failed` (Generic)** | Various causes (e.g., invalid signature, unauthorized operation). | Inspect the `result_xdr` in the Horizon response for specific operation-level error codes to diagnose the exact cause. |
