import { test, expect } from '@playwright/test';

/**
 * Wallet Compatibility Smoke Tests
 * 
 * These tests verify basic wallet connectivity and signing flows across
 * different wallet implementations. Tests use mocked wallet interfaces
 * for CI/CD compatibility.
 * 
 * Full manual testing matrix: frontend/docs/wallet-compatibility-testing-matrix.md
 */

test.describe('Wallet Compatibility Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Freighter Wallet', () => {
    test('should connect and display wallet address', async ({ page, context }) => {
      // Mock Freighter extension
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      
      // Wait for connection and verify wallet address
      await expect(page.locator('[data-testid="wallet"]')).toBeVisible();
      const walletText = await page.locator('[data-testid="wallet"]').textContent();
      expect(walletText).toContain('GTEST');
    });

    test('should display correct network after connection', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      
      // Verify network is displayed
      await expect(page.locator('[data-testid="wallet-network"]')).toHaveText('testnet');
    });

    test('should handle network mismatch warning', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'mainnet', // Wallet on mainnet
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      
      // Verify network warning appears
      await expect(page.locator('[data-testid="network-warning"]')).toBeVisible();
    });

    test('should detect account changes', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      await expect(page.locator('[data-testid="wallet"]')).toHaveText(/GTEST/);
      
      // Simulate account change
      await page.evaluate(() => {
        (window as any).freighter.getPublicKey = async () => 'GNEWWALLETADDRESS987654321';
        window.dispatchEvent(new CustomEvent('stellarwork:account-changed', {
          detail: { address: 'GNEWWALLETADDRESS987654321' }
        }));
      });

      // Verify account changed
      await expect(page.locator('[data-testid="wallet"]')).toHaveText(/GNEW/);
    });

    test('should disconnect wallet', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      await expect(page.locator('[data-testid="wallet"]')).toBeVisible();
      
      // Disconnect
      await page.click('button:has-text("Disconnect")');
      
      // Confirm disconnect
      await page.click('button:has-text("Yes, disconnect")');
      
      // Verify disconnected state
      await expect(page.locator('button:has-text("Connect Wallet")')).toBeVisible();
    });
  });

  test.describe('WalletConnect', () => {
    test('should display QR code for connection', async ({ page }) => {
      await page.click('button:has-text("Connect Wallet")');
      await page.click('button:has-text("WalletConnect")');
      
      // Verify QR code container is displayed
      await expect(page.locator('[data-testid="walletconnect-qr"]')).toBeVisible();
    });

    test('should show wallet selection options', async ({ page }) => {
      await page.click('button:has-text("Connect Wallet")');
      
      // Verify wallet options are displayed
      await expect(page.locator('button:has-text("Freighter")')).toBeVisible();
      await expect(page.locator('button:has-text("WalletConnect")')).toBeVisible();
      await expect(page.locator('button:has-text("Ledger")')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle missing extension gracefully', async ({ page }) => {
      // Don't mock Freighter - simulate missing extension
      await page.click('button:has-text("Connect Wallet")');
      
      // Verify error message or fallback to install prompt
      const errorMessage = page.locator('text=extension not found').or(
        page.locator('text=install')
      );
      await expect(errorMessage.first()).toBeVisible();
    });

    test('should handle connection denial', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => {
            throw new Error('User denied connection');
          },
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => false,
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      
      // Verify error handling - should not crash
      await expect(page.locator('button:has-text("Connect Wallet")')).toBeVisible();
    });

    test('should handle network errors', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => {
            throw new Error('Network error');
          },
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      
      // Verify error handling
      await expect(page.locator('text=error').or(page.locator('text=failed'))).toBeVisible();
    });
  });

  test.describe('Auto-reconnect', () => {
    test('should auto-reconnect when enabled', async ({ page, context }) => {
      // Set auto-reconnect preference
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('stellarwork:wallet-auto-reconnect', 'true');
        localStorage.setItem('stellarwork:last-connected-account', 'GTESTWALLETADDRESS123456789');
      });

      // Reload page
      await page.reload();

      // Mock Freighter for auto-reconnect
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      // Wait for auto-reconnect
      await expect(page.locator('[data-testid="wallet"]')).toHaveText(/GTEST/, { timeout: 5000 });
    });

    test('should not auto-reconnect when disabled', async ({ page, context }) => {
      await page.evaluate(() => {
        localStorage.setItem('stellarwork:wallet-auto-reconnect', 'false');
      });

      await page.reload();

      // Mock Freighter but don't expect auto-connect
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      // Verify wallet is not connected
      await expect(page.locator('button:has-text("Connect Wallet")')).toBeVisible();
    });
  });

  test.describe('Balance Display', () => {
    test('should fetch and display balance', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
          getBalance: async () => '100000000', // 10 XLM in stroops
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      
      // Wait for balance to load
      await expect(page.locator('[data-testid="balance"]')).toBeVisible();
      const balance = await page.locator('[data-testid="balance"]').textContent();
      expect(balance).toContain('XLM');
    });

    test('should handle balance fetch errors', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
          getBalance: async () => {
            throw new Error('Failed to fetch balance');
          },
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      
      // Verify error handling - should show 0 or error state
      await expect(page.locator('[data-testid="balance"]')).toBeVisible();
    });
  });

  test.describe('Account Switching', () => {
    test('should prompt confirmation before switching accounts', async ({ page, context }) => {
      await context.addInitScript(() => {
        (window as any).freighter = {
          getPublicKey: async () => 'GTESTWALLETADDRESS123456789',
          getNetwork: async () => 'testnet',
          signTransaction: async (xdr: string) => 'SIGNED_' + xdr,
          isConnected: () => true,
        };
      });

      await page.click('button:has-text("Connect Wallet")');
      
      // Trigger account switch
      await page.evaluate(() => {
        (window as any).freighter.getPublicKey = async () => 'GNEWWALLETADDRESS987654321';
        window.dispatchEvent(new CustomEvent('stellarwork:account-changed', {
          detail: { address: 'GNEWWALLETADDRESS987654321' }
        }));
      });

      // Verify confirmation dialog appears
      await expect(page.locator('[data-testid="account-switch-confirm"]')).toBeVisible();
    });
  });
});
