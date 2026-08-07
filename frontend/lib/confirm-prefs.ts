/**
 * Helpers for persisting "Don't show this again" preferences for confirmation
 * dialogs. Each dialog has a unique key. When the user checks "Don't show this
 * again", subsequent calls to `isConfirmSuppressed` return true and the
 * consuming component should skip the dialog and call the action directly.
 */

const STORAGE_KEY = "stellarwork:confirm-suppressed";

/** Read the full suppressed-dialogs map from localStorage. */
function readMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Write the map back to localStorage. */
function writeMap(map: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full — ignore
  }
}

/** Returns true when the user has previously checked "Don't show this again" for the given key. */
export function isConfirmSuppressed(key: string): boolean {
  return readMap()[key] === true;
}

/** Mark a dialog as suppressed (user checked "Don't show this again"). */
export function suppressConfirm(key: string): void {
  const map = readMap();
  map[key] = true;
  writeMap(map);
}

/** Clear suppressed state for a specific key (e.g. in settings / reset). */
export function clearConfirmSuppression(key: string): void {
  const map = readMap();
  delete map[key];
  writeMap(map);
}

/** Clear all suppressed dialogs (useful for a "Reset preferences" button). */
export function clearAllConfirmSuppressions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// ── Well-known keys ──────────────────────────────────────────────────────────
// Centralised so callsites never type raw strings.

export const CONFIRM_KEYS = {
  cancelJob: "cancel-job",
  approveWork: "approve-work",
  submitWork: "submit-work",
  raiseDispute: "raise-dispute",
  withdrawFees: "withdraw-fees",
  freelancerCancelJob: "freelancer-cancel-job",
  enforceDeadline: "enforce-deadline",
  disconnectWallet: "disconnect-wallet",
} as const;

export type ConfirmKey = (typeof CONFIRM_KEYS)[keyof typeof CONFIRM_KEYS];
