# Cross-Browser Testing Matrix

This document defines the supported browsers, devices, and operating systems for StellarWork, along with manual test checklists and known compatibility issues.

## Desktop Browsers

| Browser | Versions | Windows 10/11 | macOS 13+ | Ubuntu 22.04+ |
|---------|----------|:---:|:---:|:---:|
| Chrome | Latest 2 versions | Supported | Supported | Supported |
| Firefox | Latest 2 versions | Supported | Supported | Supported |
| Safari | Latest 2 versions | N/A | Supported | N/A |
| Edge | Latest 2 versions | Supported | N/A | N/A |

## Mobile Browsers

| Browser | Versions | iPhone (iOS 16+) | iPad (iPadOS 16+) | Android Phone (12+) | Android Tablet (12+) |
|---------|----------|:---:|:---:|:---:|:---:|
| Safari iOS | Latest 2 versions | Supported | Supported | N/A | N/A |
| Chrome Android | Latest 2 versions | N/A | N/A | Supported | Supported |
| Samsung Internet | Latest version | N/A | N/A | Supported | Supported |

## Wallet Compatibility

| Wallet | Chrome | Firefox | Edge | Safari | Mobile Browser |
|--------|:---:|:---:|:---:|:---:|:---:|
| Freighter (Desktop) | Supported | Supported | Supported | Not Supported | N/A |
| Freighter (Mobile) | N/A | N/A | N/A | N/A | Supported (Chrome Android, Safari iOS) |
| WalletConnect | Supported | Supported | Supported | Supported | Supported |

## Manual Test Checklist

Run the following checklist on each browser/device combination listed in the matrix above before each release.

### Wallet Connection

- [ ] Freighter extension detected and connect flow completes
- [ ] Wallet address displays correctly in header
- [ ] Disconnect wallet and reconnect without errors
- [ ] WalletConnect QR code flow works on mobile
- [ ] Ledger hardware wallet connection (Chrome/Edge only)

### Core Job Flows

- [ ] Post a job: form renders, validation works, transaction signs and submits
- [ ] Accept a job: accept button visible, transaction signs and submits
- [ ] Submit work: submit button visible, transaction signs and submits
- [ ] Approve work: approve button visible, transaction signs and submits, payment releases
- [ ] Cancel job (client): cancel button visible, confirmation dialog appears, refund processes
- [ ] Cancel job (freelancer): cancel button visible, confirmation dialog appears

### Messaging

- [ ] Open messaging panel
- [ ] Send a message and verify it appears in the conversation
- [ ] Receive a message and verify notification appears
- [ ] Message history loads correctly on page refresh
- [ ] Typing indicators display correctly

### Responsive Layout

- [ ] Layout renders correctly at 1920px (desktop)
- [ ] Layout renders correctly at 1440px (laptop)
- [ ] Layout renders correctly at 1024px (tablet landscape)
- [ ] Layout renders correctly at 768px (tablet portrait)
- [ ] Layout renders correctly at 375px (mobile)
- [ ] Navigation collapses to hamburger menu below 768px
- [ ] Tables scroll horizontally on narrow viewports
- [ ] Modals and dialogs are usable on touch devices

### Accessibility

- [ ] Keyboard navigation works for all interactive elements
- [ ] Screen reader announces page changes and status updates
- [ ] Focus indicators are visible in all browsers
- [ ] Color contrast meets WCAG AA in both light and dark themes

## Automated Cross-Browser Testing

### BrowserStack Integration

To run automated cross-browser screenshots, configure BrowserStack credentials and run:

```bash
cd frontend
BROWSERSTACK_USERNAME=<user> BROWSERSTACK_ACCESS_KEY=<key> npx playwright test --config=playwright.browserstack.config.ts
```

### LambdaTest Integration

Alternatively, use LambdaTest for parallel cross-browser testing:

```bash
cd frontend
LT_USERNAME=<user> LT_ACCESS_KEY=<key> npx playwright test --config=playwright.lambdatest.config.ts
```

### Playwright Browser Matrix

The default Playwright configuration (`playwright.config.ts`) should include:

```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
]
```

## Known Issues and Workarounds

| Browser | Issue | Workaround | Status |
|---------|-------|------------|--------|
| Safari 16 | Freighter extension not available | Use WalletConnect on Safari desktop | Known |
| Firefox (Linux) | Occasional font rendering differences in tabular numbers | No user impact; cosmetic only | Known |
| Samsung Internet | WalletConnect deep link may require manual app switch | Instruct users to copy link if auto-redirect fails | Known |
| Edge | Ledger WebHID requires explicit permission grant | Prompt users to allow HID access in browser settings | Known |

## Pre-Release Testing Checklist

Before tagging a release, verify the following:

1. Run the full manual test checklist above on at least:
   - Chrome (latest) on Windows and macOS
   - Firefox (latest) on Windows
   - Safari (latest) on macOS
   - Safari iOS (latest) on iPhone
   - Chrome Android (latest) on Android phone

2. Run Playwright E2E tests across all configured projects:
   ```bash
   cd frontend && npm run test:e2e
   ```

3. Verify no regressions in the wallet connection flow on all supported wallet types.

4. Check responsive layout at all breakpoints listed above.

5. Confirm all known issues in the table above are still accurate and no new issues have been introduced.

6. Run Lighthouse audit on Chrome (latest) and verify no score regressions below thresholds defined in `.lighthouserc.json`.
