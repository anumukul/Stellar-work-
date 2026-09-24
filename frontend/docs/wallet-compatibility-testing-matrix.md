# Wallet Compatibility Testing Matrix

This document defines the testing matrix for all supported wallet extensions and browsers across different operating systems. Use this matrix to ensure wallet compatibility before releases.

## Supported Wallets

| Wallet | Type | Primary Use Case | Status |
|--------|------|------------------|--------|
| **Freighter** | Browser Extension | Desktop web users | ✅ Primary |
| **WalletConnect** | Mobile QR Code | Mobile wallet users | ✅ Supported |
| **Ledger** | Hardware Wallet | High-security users | ✅ Supported |

---

## Browser & OS Compatibility Matrix

### Freighter Extension

| Browser | Windows | macOS | Linux | ChromeOS | Notes |
|---------|---------|-------|-------|---------|-------|
| **Chrome** | ✅ Tested | ✅ Tested | ✅ Tested | ✅ Tested | Primary support |
| **Brave** | ✅ Tested | ✅ Tested | ✅ Tested | ⚠️ Limited | Chromium-based |
| **Edge** | ✅ Tested | ✅ Tested | ❌ N/A | ❌ N/A | Chromium-based |
| **Firefox** | ✅ Tested | ✅ Tested | ✅ Tested | ❌ N/A | Extension available |
| **Safari** | ❌ N/A | ✅ Tested | ❌ N/A | ❌ N/A | Requires Safari extension |

### WalletConnect (Mobile)

| Platform | iOS | Android | Notes |
|----------|-----|---------|-------|
| **Mobile Browser** | ✅ Tested | ✅ Tested | QR code scanning |
| **Stellar Wallet App** | ✅ Tested | ✅ Tested | Official Stellar wallet |
| **LOBSTR** | ✅ Tested | ✅ Tested | Popular mobile wallet |
| **Other WC-compatible** | ⚠️ Varies | ⚠️ Varies | Test individually |

### Ledger Hardware Wallet

| Browser | Windows | macOS | Linux | Notes |
|---------|---------|-------|-------|-------|
| **Chrome** | ✅ Tested | ✅ Tested | ✅ Tested | WebHID support required |
| **Brave** | ✅ Tested | ✅ Tested | ✅ Tested | WebHID support required |
| **Edge** | ✅ Tested | ✅ Tested | ❌ N/A | WebHID support required |
| **Firefox** | ⚠️ Limited | ⚠️ Limited | ⚠️ Limited | WebHID experimental |
| **Safari** | ❌ N/A | ✅ Tested | ❌ N/A | WebUSB support |

---

## Test Coverage Checklist

For each wallet/browser combination, verify the following:

### Core Functionality

- [ ] **Connect Flow**
  - [ ] Wallet extension/app is detected
  - [ ] Connect button initiates connection
  - [ ] User can authorize connection
  - [ ] Wallet address is displayed after connection
  - [ ] Network is correctly identified (testnet/mainnet)
  - [ ] Balance is fetched and displayed

- [ ] **Sign Transaction**
  - [ ] Transaction signing prompt appears in wallet
  - [ ] User can review transaction details
  - [ ] User can approve or reject signing
  - [ ] Signed transaction is returned to app
  - [ ] Transaction is submitted to network
  - [ ] Error handling for rejected signatures

- [ ] **Network Switch**
  - [ ] Wallet detects network mismatch
  - [ ] Warning is displayed to user
  - [ ] User can switch network in wallet
  - [ ] App detects network change
  - [ ] App refreshes after network switch
  - [ ] Balance updates for new network

- [ ] **Account Change**
  - [ ] Wallet detects account switch
  - [ ] App detects account change
  - [ ] App prompts user to confirm switch
  - [ ] Cached data is cleared on account change
  - [ ] New account data is loaded
  - [ ] UI updates with new account

### Edge Cases

- [ ] **Extension Not Installed**
  - [ ] App handles missing extension gracefully
  - [ ] Clear error message shown to user
  - [ ] Link to install extension provided

- [ ] **Extension Disabled**
  - [ ] App detects disabled extension
  - [ ] User is prompted to enable extension
  - [ ] Reconnect works after enabling

- [ ] **Multiple Accounts**
  - [ ] User can switch between accounts
  - [ ] Each account maintains separate state
  - [ ] Account switching works correctly

- [ ] **Permission Denied**
  - [ ] User denied connection is handled
  - [ ] App recovers gracefully
  - [ ] User can retry connection

- [ ] **Network Timeout**
  - [ ] Slow network is handled
  - [ ] Timeout errors are displayed
  - [ ] User can retry operation

- [ ] **Wallet Lock**
  - [ ] Locked wallet is detected
  - [ ] User is prompted to unlock
  - [ ] Operation resumes after unlock

---

## Automated Smoke Tests

### Test File: `e2e/wallet-compatibility.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Wallet Compatibility Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Freighter - Connect flow', async ({ page, context }) => {
    // Mock Freighter extension for testing
    await context.addInitScript(() => {
      window.freighter = {
        getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
        getNetwork: async () => 'testnet',
        signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
      };
    });

    await page.click('button:has-text("Connect Wallet")');
    
    // Wait for connection
    await expect(page.locator('[data-testid="wallet"]')).toHaveText(/GTEST/);
    await expect(page.locator('[data-testid="wallet-network"])).toHaveText('testnet');
  });

  test('Freighter - Sign transaction', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.freighter = {
        getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
        getNetwork: async () => 'testnet',
        signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
      };
    });

    // Connect first
    await page.click('button:has-text("Connect Wallet")');
    await expect(page.locator('[data-testid="wallet"]')).toHaveText(/GTEST/);

    // Navigate to a page that requires signing
    await page.goto('/post-job');
    
    // Fill form and submit (this triggers signing)
    await page.fill('[name="title"]', 'Test Job');
    await page.fill('[name="amount"]', '100');
    await page.click('button:has-text("Post Job")');

    // Verify signing was called (mocked)
    // In real tests, you'd verify the transaction was signed
  });

  test('WalletConnect - QR code display', async ({ page }) => {
    // Navigate to wallet selection
    await page.click('button:has-text("Connect Wallet")');
    await page.click('button:has-text("WalletConnect")');

    // Verify QR code is displayed
    await expect(page.locator('img[src*="qr"]')).toBeVisible();
  });

  test('Network switch detection', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.freighter = {
        getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
        getNetwork: async () => 'testnet',
        signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
      };
    });

    await page.click('button:has-text("Connect Wallet")');
    
    // Simulate network change
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('stellarwork:network-changed', {
        detail: { network: 'mainnet' }
      }));
    });

    // Verify warning is shown
    await expect(page.locator('[data-testid="network-warning"]')).toBeVisible();
  });

  test('Account change detection', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.freighter = {
        getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
        getNetwork: async () => 'testnet',
        signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
      };
    });

    await page.click('button:has-text("Connect Wallet")');
    
    // Simulate account change
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('stellarwork:account-changed', {
        detail: { address: 'GNEWWALLETADDRESS987654321' }
      }));
    });

    // Verify account changed
    await expect(page.locator('[data-testid="wallet"]')).toHaveText(/GNEW/);
  });

  test('Extension not installed handling', async ({ page }) => {
    // Don't mock Freighter - simulate missing extension
    await page.click('button:has-text("Connect Wallet")');

    // Verify error message
    await expect(page.locator('text=Freighter extension not found')).toBeVisible();
    await expect(page.locator('a[href*="freighter"]')).toBeVisible();
  });
});
```

---

## Manual Test Procedures

### Test Environment Setup

1. **Install Test Wallets**
   - Freighter: https://freighter.app
   - Ledger Live: https://www.ledger.com/ledger-live
   - Mobile wallet (e.g., Stellar Wallet): https://stellar.org/wallets

2. **Configure Test Accounts**
   - Create test accounts on testnet
   - Fund accounts with test XLM (use faucet)
   - Save private keys for recovery

3. **Browser Setup**
   - Install supported browsers
   - Install wallet extensions
   - Disable pop-up blockers for testing
   - Enable developer tools for debugging

### Manual Test Cases

#### TC-001: Freighter - Basic Connect (Chrome/Windows)

**Steps:**
1. Open Chrome on Windows
2. Navigate to https://stellarwork.org
3. Click "Connect Wallet" button
4. Select "Freighter" from wallet options
5. Approve connection in Freighter popup

**Expected Results:**
- Freighter popup appears
- Connection request shows app name and domain
- After approval, wallet address displays in app
- Network (testnet/mainnet) is correctly identified
- Balance is fetched and displayed

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

#### TC-002: Freighter - Sign Transaction (Chrome/macOS)

**Steps:**
1. Connect Freighter wallet
2. Navigate to "Post Job" page
3. Fill job details (title, amount, description)
4. Click "Post Job" button
5. Review transaction in Freighter popup
6. Approve transaction

**Expected Results:**
- Freighter popup shows transaction details
- Transaction amount and recipient are correct
- After approval, job is posted successfully
- Success message is displayed
- Transaction appears in wallet history

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

#### TC-003: Freighter - Network Switch (Brave/Linux)

**Steps:**
1. Connect Freighter on testnet
2. Open Freighter extension settings
3. Switch network from testnet to mainnet
4. Return to StellarWork tab
5. Observe network warning

**Expected Results:**
- Network warning banner appears
- Warning indicates network mismatch
- User is prompted to switch network
- After switching in wallet, app refreshes
- Balance updates for new network

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

#### TC-004: Freighter - Account Switch (Firefox/macOS)

**Steps:**
1. Connect Freighter with Account A
2. Create or switch to Account B in Freighter
3. Return to StellarWork tab
4. Observe account change detection

**Expected Results:**
- Account change is detected automatically
- Confirmation dialog appears
- After confirmation, UI updates with new account
- Cached data is cleared
- New account balance is displayed

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

#### TC-005: WalletConnect - QR Code Flow (Mobile Safari/iOS)

**Steps:**
1. Open Safari on iOS device
2. Navigate to https://stellarwork.org
3. Click "Connect Wallet"
4. Select "WalletConnect"
5. Scan QR code with mobile wallet app
6. Approve connection in mobile app

**Expected Results:**
- QR code is displayed in browser
- Mobile wallet scans QR code successfully
- Connection request appears in mobile app
- After approval, wallet address displays in browser
- Network is correctly identified

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected results not met

---

#### TC-006: WalletConnect - Sign Transaction (Mobile Chrome/Android)

**Steps:**
1. Connect via WalletConnect
2. Navigate to "Post Job" page
3. Fill job details
4. Click "Post Job"
5. Approve transaction in mobile wallet

**Expected Results:**
- Transaction request appears in mobile wallet
- Transaction details are correct
- After approval, job is posted successfully
- Success message displays in browser

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

#### TC-007: Ledger - Connect Flow (Chrome/Windows)

**Steps:**
1. Connect Ledger device via USB
2. Open Stellar app on Ledger
3. Open Chrome on Windows
4. Navigate to https://stellarwork.org
5. Click "Connect Wallet"
6. Select "Ledger"
7. Approve connection on Ledger device

**Expected Results:**
- Ledger device is detected
- "Connect Ledger" option is available
- After selection, prompt appears on Ledger
- Address is displayed on Ledger for verification
- After approval, address displays in app

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

#### TC-008: Ledger - Sign Transaction (Chrome/macOS)

**Steps:**
1. Connect Ledger wallet
2. Navigate to "Post Job" page
3. Fill job details
4. Click "Post Job"
5. Review transaction on Ledger device
6. Approve transaction on Ledger

**Expected Results:**
- Transaction details appear on Ledger screen
- Amount and recipient are correct
- User can scroll through full transaction
- After approval, job is posted successfully
- Success message is displayed

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

#### TC-009: Extension Not Installed (Edge/Windows)

**Steps:**
1. Open Edge without Freighter installed
2. Navigate to https://stellarwork.org
3. Click "Connect Wallet"
4. Select "Freighter"

**Expected Results:**
- Error message: "Freighter extension not found"
- Link to install Freighter is provided
- User can click link to install
- After installation, retry works

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

#### TC-010: Permission Denied (Safari/macOS)

**Steps:**
1. Open Safari with Freighter installed
2. Navigate to https://stellarwork.org
3. Click "Connect Wallet"
4. Select "Freighter"
5. Deny connection in Freighter popup

**Expected Results:**
- Connection is cancelled
- Error message: "Connection denied by user"
- User can retry connection
- App remains in disconnected state

**Pass/Fail Criteria:**
- ✅ Pass: All expected results met
- ❌ Fail: Any expected result not met

---

## Test Execution Schedule

### Pre-Release Testing

Run full matrix before each release:

1. **Automated Smoke Tests** (CI/CD)
   - Run on all PRs
   - Run on main branch builds
   - Run before release tagging

2. **Manual Matrix Testing** (Weekly)
   - Test primary combinations (Chrome/Freighter)
   - Test secondary combinations (Brave, Edge)
   - Test mobile flows (WalletConnect)
   - Test hardware wallet (Ledger)

3. **Browser Update Testing** (Monthly)
   - Test when major browser updates release
   - Test when wallet extensions update
   - Test when OS updates release

### Critical Path Testing

Before critical deployments, test:

- ✅ Chrome + Freighter (Windows, macOS, Linux)
- ✅ Safari + Freighter (macOS)
- ✅ Mobile Chrome + WalletConnect (Android)
- ✅ Mobile Safari + WalletConnect (iOS)

---

## Test Results Template

Use this template to document test results:

```markdown
## Test Results - [Date]

### Environment
- Tester: [Name]
- OS: [Windows/macOS/Linux/iOS/Android]
- Browser: [Chrome/Brave/Edge/Firefox/Safari]
- Wallet: [Freighter/WalletConnect/Ledger]
- Wallet Version: [Version]
- Browser Version: [Version]

### Test Cases Executed

| TC ID | Description | Result | Notes |
|-------|-------------|--------|-------|
| TC-001 | Freighter - Basic Connect | ✅/❌ | [Notes] |
| TC-002 | Freighter - Sign Transaction | ✅/❌ | [Notes] |
| ... | ... | ... | ... |

### Issues Found
1. [Issue description]
   - Severity: [Critical/High/Medium/Low]
   - Steps to reproduce: [Steps]
   - Expected: [Expected behavior]
   - Actual: [Actual behavior]

### Recommendations
- [Any recommendations for improvements]
```

---

## Updating the Matrix

When adding a new wallet:

1. **Add wallet to supported wallets table**
   - Document wallet type and use case
   - Mark as "Beta" during testing phase

2. **Update compatibility matrix**
   - Add row for new wallet
   - Test across all supported browsers/OS
   - Mark combinations as ✅ Tested, ⚠️ Limited, or ❌ N/A

3. **Create test cases**
   - Add manual test cases for new wallet
   - Add automated smoke tests
   - Document wallet-specific edge cases

4. **Update documentation**
   - Add wallet to user-facing docs
   - Update installation instructions
   - Add troubleshooting steps

5. **Communicate changes**
   - Announce new wallet support
   - Update release notes
   - Train support team

---

## References

- Freighter Documentation: https://freighter.app/docs
- WalletConnect Documentation: https://docs.walletconnect.com
- Ledger Developer Docs: https://developers.ledger.com
- Stellar SDK: https://github.com/stellar/js-stellar-sdk
- Frontend Contract Interaction: `docs/FRONTEND_CONTRACT_INTERACTION.md`
- Frontend Testing: `docs/FRONTEND_TESTING.md`
