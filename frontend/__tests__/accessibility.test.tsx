import React from 'react';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, it, expect } from 'vitest';

// Components under test
import Spinner from '../components/Spinner';
import AppFooter from '../components/AppFooter';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import NetworkBadge from '../components/NetworkBadge';
import ErrorBanner from '../components/ErrorBanner';
import StatusPill from '../components/StatusPill';

/**
 * Accessibility test suite using axe-core via vitest-axe.
 *
 * Every presentational component should be tested here to catch
 * WCAG 2.1 AA regressions automatically in CI.
 *
 * To add a new component:
 *   1. Import it above.
 *   2. Add an `it()` block that renders it and asserts `toHaveNoViolations()`.
 *   3. Supply the minimum props needed for a meaningful render.
 *
 * Custom axe rules for Stellar-specific patterns (e.g. wallet address
 * truncation) can be passed via the second argument to `axe()`:
 *   await axe(container, { rules: { 'color-contrast': { enabled: false } } })
 */
describe('Accessibility Tests', () => {
  // ── Feedback / Status ──────────────────────────────────────────────

  it('Spinner has no accessibility violations', async () => {
    const { container } = render(<Spinner size="md" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('LoadingState has no accessibility violations', async () => {
    const { container } = render(<LoadingState />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('EmptyState has no accessibility violations', async () => {
    const { container } = render(<EmptyState message="No items found" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('ErrorBanner has no accessibility violations', async () => {
    const { container } = render(<ErrorBanner message="Something went wrong" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('StatusPill has no accessibility violations', async () => {
    const { container } = render(<StatusPill status="Open" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // ── Navigation / Layout ────────────────────────────────────────────

  it('AppFooter has no accessibility violations', async () => {
    const { container } = render(<AppFooter />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // ── Stellar-specific ──────────────────────────────────────────────

  it('NetworkBadge has no accessibility violations', async () => {
    const { container } = render(<NetworkBadge network="testnet" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

/**
 * Stellar-specific accessibility patterns
 *
 * These tests verify custom accessibility patterns unique to the Stellar
 * application, such as wallet address display, transaction previews,
 * and network indicators.
 */
describe('Stellar-Specific Accessibility Patterns', () => {
  it('NetworkBadge conveys network info without relying solely on color', async () => {
    const { container } = render(<NetworkBadge network="testnet" />);
    // The badge must include text content, not just a colored dot
    expect(container.textContent).toBeTruthy();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('StatusPill conveys status without relying solely on color', async () => {
    const { container } = render(<StatusPill status="Completed" />);
    expect(container.textContent).toBeTruthy();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});