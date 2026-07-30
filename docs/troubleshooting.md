# Troubleshooting FAQ

This comprehensive FAQ covers common user issues, error messages, and solutions for self-service troubleshooting.

## Table of Contents

- [Wallet Issues](#wallet-issues)
- [Transaction Issues](#transaction-issues)
- [Contract Errors](#contract-errors)
- [Frontend Issues](#frontend-issues)
- [Account Issues](#account-issues)

---

## Wallet Issues

### Freighter Not Detected

**Symptom:** "Connect Wallet" button shows error or wallet connection fails.

**Cause:** Freighter browser extension is not installed, disabled, or not unlocked.

**Solution Steps:**
1. Verify Freighter is installed in your browser extensions
2. Ensure Freighter is enabled and unlocked
3. Refresh the page and try connecting again
4. If using a different browser, install Freighter for that browser

**Prevention Tips:**
- Keep Freighter updated to the latest version
- Enable auto-unlock with password if available
- Check browser extension permissions

---

### Connection Rejected

**Symptom:** Freighter prompts for connection but rejects the request.

**Cause:** User cancelled the connection prompt or Freighter is locked.

**Solution Steps:**
1. Unlock Freighter if it's locked
2. Click "Connect Wallet" again and approve the connection
3. Check if you're on the correct network (Testnet vs Mainnet)

**Prevention Tips:**
- Always approve connection when prompted
- Ensure Freighter is on the same network as the application

---

### Wrong Network

**Symptom:** "Network mismatch" error or transactions fail.

**Cause:** Freighter is configured for a different network than the application.

**Solution Steps:**
1. Open Freighter settings
2. Switch to the correct network (Testnet or Mainnet)
3. Refresh the application page
4. Try connecting again

**Prevention Tips:**
- Check network settings before connecting
- Use separate Freighter profiles for Testnet and Mainnet

---

## Transaction Issues

### Insufficient Balance

**Symptom:** "Insufficient balance" error when posting a job or accepting work.

**Cause:** Wallet doesn't have enough XLM or tokens for the transaction amount plus fees.

**Solution Steps:**
1. Check your wallet balance in Freighter
2. Fund your wallet with additional XLM
3. For Testnet: use [Stellar Laboratory Friendbot](https://laboratory.stellar.org/#account-creator?network=testnet)
4. For Mainnet: purchase XLM from an exchange
5. Ensure you have enough for transaction fees (~0.00001 XLM per operation)

**Prevention Tips:**
- Always maintain a buffer of XLM for fees
- Check balance before initiating transactions
- Use Testnet for testing before using real funds

---

### Transaction Failed

**Symptom:** Transaction submitted but fails with error code.

**Cause:** Various reasons including insufficient funds, invalid parameters, or contract conditions not met.

**Solution Steps:**
1. Check the specific error message
2. Verify all transaction parameters are correct
3. Ensure you have sufficient balance and allowance
4. Check if the job or contract state allows the operation
5. Review the error details in Freighter transaction history

**Prevention Tips:**
- Double-check all parameters before submitting
- Read contract documentation for preconditions
- Test with small amounts first

---

### Transaction Timeout

**Symptom:** Transaction hangs or takes too long to confirm.

**Cause:** Network congestion, insufficient fee, or RPC issues.

**Solution Steps:**
1. Wait a few minutes for network confirmation
2. Check Stellar network status on [StellarExpert](https://stellar.expert/)
3. Try refreshing the page
4. If still stuck, the transaction may need to be cancelled and retried

**Prevention Tips:**
- Use appropriate transaction fees during high congestion
- Avoid submitting multiple transactions simultaneously
- Check network status before important transactions

---

## Contract Errors

### JobNotFound

**Symptom:** "Job not found" error when trying to interact with a job.

**Cause:** Job ID is invalid, job was cancelled, or job doesn't exist.

**Solution Steps:**
1. Verify the job ID is correct
2. Check if the job was cancelled or completed
3. Refresh the job list to get current job IDs
4. Ensure you're on the correct network (Testnet vs Mainnet)

**Prevention Tips:**
- Always use job IDs from the current application state
- Refresh job lists before performing actions
- Bookmark job pages for quick access

---

### Unauthorized

**Symptom:** "Unauthorized" error when calling contract functions.

**Cause:** You're not the authorized caller (e.g., not the job client or freelancer).

**Solution Steps:**
1. Ensure you're connected with the correct wallet
2. Verify you have permission to perform the action
3. Check if you're the job client (for posting, cancelling, approving)
4. Check if you're the job freelancer (for accepting, submitting work)

**Prevention Tips:**
- Only perform actions you're authorized for
- Use the correct wallet address for each role
- Read contract documentation for authorization requirements

---

### InvalidStatus

**Symptom:** "Invalid status" error when trying to change job state.

**Cause:** Job is not in the correct state for the requested operation.

**Solution Steps:**
1. Check the current job status
2. Verify the operation is valid for the current status
3. Review the job lifecycle:
   - Open → can be accepted or cancelled
   - InProgress → can submit work or be cancelled
   - SubmittedForReview → can be approved or disputed
   - Completed → no further actions
   - Cancelled → no further actions
   - Disputed → awaiting resolution

**Prevention Tips:**
- Understand the job lifecycle before taking actions
- Check job status before attempting operations
- Follow the correct sequence of operations

---

### DeadlinePassed

**Symptom:** "Deadline passed" error when trying to submit work or extend job.

**Cause:** Job deadline has expired and the job is in a terminal state.

**Solution Steps:**
1. Check the job deadline timestamp
2. If you're the client, you may need to cancel the job
3. If you're the freelancer and the deadline passed, the job may be auto-cancelled
4. Contact the other party for resolution

**Prevention Tips:**
- Monitor job deadlines closely
- Submit work before the deadline
- Request deadline extensions if needed in advance

---

## Frontend Issues

### Page Not Loading

**Symptom:** Application shows blank page or loading spinner indefinitely.

**Cause:** Network issues, RPC endpoint down, or configuration errors.

**Solution Steps:**
1. Check your internet connection
2. Refresh the page
3. Check if the Soroban RPC endpoint is accessible
4. Verify environment variables are configured correctly
5. Check browser console for error messages

**Prevention Tips:**
- Ensure stable internet connection
- Use reliable RPC endpoints
- Keep browser updated

---

### Data Not Refreshing

**Symptom:** Job lists or balances show outdated information.

**Cause:** Caching issues or stale data from RPC.

**Solution Steps:**
1. Refresh the page
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Clear browser cache
4. Check if you're on the correct network

**Prevention Tips:**
- Refresh pages regularly for latest data
- Use the refresh button in the UI when available
- Clear cache periodically

---

### Display Bugs

**Symptom:** UI elements misaligned, overlapping, or not rendering correctly.

**Cause:** Browser compatibility issues or CSS conflicts.

**Solution Steps:**
1. Try a different browser (Chrome, Firefox, Safari)
2. Clear browser cache and cookies
3. Disable browser extensions that might interfere
4. Check if you're using a supported browser version

**Prevention Tips:**
- Use a modern, supported browser
- Keep browser updated
- Disable unnecessary extensions

---

## Account Issues

### Lost Wallet

**Symptom:** Cannot access wallet or lost private key.

**Cause:** Lost seed phrase, private key, or wallet file.

**Solution Steps:**
1. If you have your seed phrase (12-24 words), restore your wallet in Freighter
2. If you have a backup file, import it into Freighter
3. If you have neither, the wallet is permanently inaccessible
4. Create a new wallet and secure it properly

**Prevention Tips:**
- **CRITICAL:** Write down your seed phrase and store it securely offline
- Never share your seed phrase with anyone
- Make multiple backups in different secure locations
- Use a hardware wallet for large amounts

---

### Forgot Backup

**Symptom:** Cannot remember seed phrase or backup location.

**Cause:** Poor backup practices or memory lapse.

**Solution Steps:**
1. Check all secure locations where you might have stored it
2. Look for physical notes or documents
3. If truly lost, create a new wallet and transfer funds if possible
4. Learn from this and implement better backup practices

**Prevention Tips:**
- Store seed phrase in multiple secure locations
- Use a password manager for digital storage (encrypted)
- Tell a trusted person where your backup is (in case of emergency)
- Test your backup periodically

---

### Cannot Access Account

**Symptom:** Wallet is locked or password forgotten.

**Cause:** Forgot Freighter password or wallet is encrypted.

**Solution Steps:**
1. Try all possible passwords
2. If using Freighter, you may need to restore from seed phrase
3. If seed phrase is lost, the wallet is inaccessible
4. Create a new wallet

**Prevention Tips:**
- Use a password manager for wallet passwords
- Write down passwords in a secure location
- Use memorable but secure passwords
- Enable biometric unlock if available

---

## Getting Additional Help

If you cannot resolve your issue using this FAQ:

1. **Check the Documentation:** Review [CONTRACT.md](CONTRACT.md) and [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)
2. **Search Issues:** Check existing GitHub issues for similar problems
3. **Create an Issue:** If no solution exists, create a new GitHub issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Error messages (screenshots if possible)
   - Your browser and OS version
   - Network (Testnet/Mainnet)

---

## Error Message Reference

| Error Code | Meaning | Action |
|------------|---------|--------|
| `Contract #1` | Invalid input parameters | Check your input values |
| `Contract #2` | Unauthorized caller | Connect with correct wallet |
| `Contract #3` | Insufficient balance | Fund your wallet |
| `Contract #4` | Invalid status | Check job state |
| `Contract #5` | Deadline passed | Job expired |
| `Contract #10` | Already initialized | Contract already set up |
| `HostError` | System error | Check network and retry |

---

## Quick Reference

### Common Solutions

- **Most issues:** Refresh the page and try again
- **Connection issues:** Check Freighter is unlocked and on correct network
- **Transaction issues:** Verify balance and parameters
- **Contract errors:** Check authorization and job status
- **Lost wallet:** Restore from seed phrase (if available)

### Emergency Contacts

- For critical issues involving funds: Create a high-priority GitHub issue
- For security concerns: Email security@stellarwork.org
- For general questions: Use GitHub Discussions

---

**Last Updated:** 2025-01-28
