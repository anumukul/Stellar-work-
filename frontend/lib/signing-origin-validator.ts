/**
 * Signing-request origin and domain validation (Issue: wallet signing origin)
 *
 * Every call to `submitWriteContract` passes through `validateSigningOrigin`
 * before the transaction is handed to the wallet. This module:
 *
 *  1. Builds an allowlist of trusted origins from env vars and the window
 *     location so the platform itself is always trusted.
 *  2. Compares the current document origin against the allowlist.
 *  3. Detects network mismatches (app network ≠ wallet network) before signing.
 *  4. Returns a structured `OriginValidationResult` callers can act on —
 *     ALLOWED (proceed), WARN (show boundary, but allow), or REJECT (throw).
 *
 * Design decisions:
 *  - "Unknown" origins are WARN, not REJECT. The app is a browser-based SPA,
 *    so same-origin requests are normal. An unfamiliar but non-malicious host
 *    (e.g. a preview deployment) should surface a visible warning without hard-
 *    blocking the user.
 *  - Network mismatches are always REJECT because signing on the wrong network
 *    produces an invalid transaction, and Freighter will surface its own error
 *    anyway — we preempt that with a clear message.
 *  - The validator is pure/synchronous so it can be unit-tested without a DOM.
 */

import {
  type StellarNetwork,
  getNetworkConfig,
} from "@/lib/network-config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OriginDecision = "ALLOWED" | "WARN" | "REJECT";

export interface OriginValidationResult {
  /** Whether the origin passed validation. */
  decision: OriginDecision;
  /**
   * The origin that was checked (e.g. "https://app.stellarwork.org").
   * "unknown" when `window` is unavailable (SSR / tests without jsdom).
   */
  origin: string;
  /** Human-readable reason for the decision. Shown in the UI boundary. */
  reason: string;
  /**
   * True when this origin is one of the configured platform origins.
   * Used to suppress the "external request" boundary inside the official UI.
   */
  isPlatformOrigin: boolean;
}

export interface NetworkMismatchResult {
  /** True when app network differs from the wallet's reported network. */
  mismatch: boolean;
  appNetwork: StellarNetwork;
  walletNetwork: StellarNetwork | null;
  /** Ready-to-display message when mismatch is true. */
  message: string;
}

// ─── Allowlist construction ───────────────────────────────────────────────────

/**
 * The canonical platform origins. Populated from:
 *  1. The current `window.location.origin` (always trusted — same-origin).
 *  2. `NEXT_PUBLIC_ALLOWED_ORIGINS` — comma-separated list for preview/prod
 *     deployments that are served from a different origin.
 *  3. Hard-coded well-known StellarWork origins so builds that forget to set
 *     the env var still behave correctly in production.
 */
const WELL_KNOWN_PLATFORM_ORIGINS: readonly string[] = [
  "https://stellarwork.org",
  "https://www.stellarwork.org",
  "https://app.stellarwork.org",
];

function buildAllowlist(): Set<string> {
  const set = new Set<string>(WELL_KNOWN_PLATFORM_ORIGINS);

  // Env-configured additional origins (preview URLs, staging, etc.).
  const fromEnv = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? "";
  for (const raw of fromEnv.split(",")) {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        // Normalise via URL so trailing slashes / case differences collapse.
        const { origin } = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
        set.add(origin);
      } catch {
        // Malformed entry — silently skip rather than crash.
      }
    }
  }

  // Add the runtime origin when we have a DOM (covers localhost dev and any
  // deployment whose URL was not listed above).
  if (typeof window !== "undefined") {
    set.add(window.location.origin);
  }

  return set;
}

// Computed once per module load. Re-computed in tests via `resetAllowlistCache`.
let _allowlistCache: Set<string> | null = null;
function getAllowlist(): Set<string> {
  if (!_allowlistCache) {
    _allowlistCache = buildAllowlist();
  }
  return _allowlistCache;
}

/** Exposed for unit tests that need to reset between cases. */
export function resetAllowlistCache(): void {
  _allowlistCache = null;
}

/**
 * Synchronously compute the origin validation result for the current page.
 * Useful for components that need to show the `SigningOriginWarning` before
 * any transaction is actually prepared.
 */
export function getCurrentOriginResult(): OriginValidationResult {
  return validateSigningOrigin();
}

// ─── Core validation ──────────────────────────────────────────────────────────

/**
 * Validate the origin from which a signing request is being made.
 *
 * @param overrideOrigin - Supply in tests or for programmatic checks. When
 *   omitted the current `window.location.origin` is used.
 */
export function validateSigningOrigin(
  overrideOrigin?: string,
): OriginValidationResult {
  const origin =
    overrideOrigin ??
    (typeof window !== "undefined" ? window.location.origin : "unknown");

  if (origin === "unknown") {
    // SSR path — never sign server-side.
    return {
      decision: "REJECT",
      origin,
      reason:
        "Signing requests must originate from a browser context. " +
        "Server-side signing is not supported.",
      isPlatformOrigin: false,
    };
  }

  const allowlist = getAllowlist();
  const isPlatformOrigin = allowlist.has(origin);

  if (isPlatformOrigin) {
    return {
      decision: "ALLOWED",
      origin,
      reason: "Request originates from a trusted platform origin.",
      isPlatformOrigin: true,
    };
  }

  // Unrecognised origin — show the warning boundary but don't hard-block.
  // The hard block lives in the REJECT path (network mismatch, SSR).
  return {
    decision: "WARN",
    origin,
    reason:
      `This signing request originates from "${origin}", which is not a ` +
      "recognised StellarWork platform address. Review the transaction " +
      "details carefully before approving.",
    isPlatformOrigin: false,
  };
}

// ─── Network mismatch check ───────────────────────────────────────────────────

/**
 * Check whether the app's configured network matches the wallet's reported
 * network. A mismatch means the signed transaction would target the wrong
 * ledger and would be rejected by the Stellar network, so we surface a clear
 * error *before* the wallet prompt appears.
 *
 * @param appNetwork    - Network the app is currently set to.
 * @param walletNetwork - Network the wallet last reported (null when unknown).
 */
export function checkNetworkMismatch(
  appNetwork: StellarNetwork,
  walletNetwork: StellarNetwork | null,
): NetworkMismatchResult {
  if (walletNetwork === null) {
    // Wallet network unknown (extension not installed / not yet queried).
    // Don't block — Freighter itself will reject if there's a real mismatch.
    return {
      mismatch: false,
      appNetwork,
      walletNetwork: null,
      message: "",
    };
  }

  if (appNetwork === walletNetwork) {
    return {
      mismatch: false,
      appNetwork,
      walletNetwork,
      message: "",
    };
  }

  const appLabel = getNetworkConfig(appNetwork).label;
  const walletLabel = getNetworkConfig(walletNetwork).label;

  return {
    mismatch: true,
    appNetwork,
    walletNetwork,
    message:
      `Network mismatch: the app is set to ${appLabel} but your wallet is ` +
      `connected to ${walletLabel}. Switch both to the same network before ` +
      "signing to avoid a failed transaction.",
  };
}

// ─── Combined guard ───────────────────────────────────────────────────────────

export interface SigningGuardResult {
  /** True when the request should be allowed to proceed to signing. */
  allowed: boolean;
  originResult: OriginValidationResult;
  networkResult: NetworkMismatchResult;
  /**
   * Aggregated user-facing message when `allowed` is false.
   * Empty when `allowed` is true.
   */
  blockReason: string;
}

/**
 * Single entry-point used by `submitWriteContract`.
 *
 * - Network mismatches always block (REJECT).
 * - Unknown origins produce a warning but do not block.
 * - "unknown" origins (SSR) block.
 *
 * @param appNetwork    - From `getActiveNetwork()`.
 * @param walletNetwork - From `WalletContext.walletNetwork` (may be null).
 * @param overrideOrigin - Override for tests.
 */
export function guardSigningRequest(
  appNetwork: StellarNetwork,
  walletNetwork: StellarNetwork | null,
  overrideOrigin?: string,
): SigningGuardResult {
  const originResult = validateSigningOrigin(overrideOrigin);
  const networkResult = checkNetworkMismatch(appNetwork, walletNetwork);

  const networkBlocks = networkResult.mismatch;
  const originBlocks = originResult.decision === "REJECT";

  const allowed = !networkBlocks && !originBlocks;

  const reasons: string[] = [];
  if (networkBlocks) reasons.push(networkResult.message);
  if (originBlocks) reasons.push(originResult.reason);

  return {
    allowed,
    originResult,
    networkResult,
    blockReason: reasons.join(" "),
  };
}
