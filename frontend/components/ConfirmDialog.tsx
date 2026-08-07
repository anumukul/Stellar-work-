"use client";

import { useCallback, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import { useModalFocusTrap } from "@/lib/modal";
import { suppressConfirm, type ConfirmKey } from "@/lib/confirm-prefs";

export type ConfirmVariant = "danger" | "warning" | "primary";

export interface ConfirmDialogProps {
  /** Whether the dialog is currently visible. */
  open: boolean;
  /** Dialog title. */
  title: string;
  /** One or two sentences explaining what the action does. */
  description: string;
  /** Optional bullet-point list of consequences shown below the description. */
  consequences?: string[];
  /**
   * Optional amount/ledger impact line displayed in a tinted badge.
   * e.g. "50.00 XLM will be transferred to the freelancer"
   */
  impactLine?: string;
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /**
   * Visual style of the confirm button.
   * - "danger"  → red  (irreversible destructive actions)
   * - "warning" → amber (significant but not immediately destructive)
   * - "primary" → slate-900 (neutral confirmation)
   */
  variant?: ConfirmVariant;
  /** Whether the confirm action is currently in progress. Disables both buttons. */
  loading?: boolean;
  /**
   * Storage key used to persist "Don't show this again". When provided, the
   * checkbox is rendered. Pass `undefined` to hide it.
   */
  suppressKey?: ConfirmKey;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES: Record<ConfirmVariant, { confirm: string; icon: string; badge: string }> = {
  danger: {
    confirm:
      "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600 disabled:bg-red-300",
    icon: "bg-red-100 text-red-600",
    badge: "bg-red-50 text-red-700 ring-red-200",
  },
  warning: {
    confirm:
      "bg-amber-500 text-white hover:bg-amber-600 focus-visible:outline-amber-500 disabled:bg-amber-300",
    icon: "bg-amber-100 text-amber-600",
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  primary: {
    confirm:
      "bg-slate-900 text-white hover:bg-slate-700 focus-visible:outline-slate-900 disabled:bg-slate-400",
    icon: "bg-slate-100 text-slate-600",
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
  },
};

/**
 * ConfirmDialog — reusable confirmation modal for destructive / irreversible
 * actions.
 *
 * Features:
 *  - Variant-aware warning icon + button colours
 *  - Consequence bullet list and optional ledger-impact badge
 *  - "Don't show this again" checkbox that writes to localStorage
 *  - Full keyboard support: Escape → cancel, Enter on confirm button → confirm
 *  - Focus trap via useModalFocusTrap; focus returns to trigger on close
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  consequences,
  impactLine,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  suppressKey,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const styles = VARIANT_STYLES[variant];

  const handleCancel = useCallback(() => {
    if (!loading) onCancel();
  }, [loading, onCancel]);

  const handleConfirm = useCallback(() => {
    if (loading) return;
    if (dontShowAgain && suppressKey) {
      suppressConfirm(suppressKey);
    }
    onConfirm();
  }, [dontShowAgain, loading, onConfirm, suppressKey]);

  useModalFocusTrap(open, dialogRef, handleCancel);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      aria-hidden={!open}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 focus:outline-none"
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${styles.icon}`}
              aria-hidden="true"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>

            {/* Title + description */}
            <div className="min-w-0 flex-1">
              <h2
                id="confirm-dialog-title"
                className="text-base font-semibold text-slate-900"
              >
                {title}
              </h2>
              <p
                id="confirm-dialog-description"
                className="mt-1 text-sm text-slate-600 leading-relaxed"
              >
                {description}
              </p>
            </div>
          </div>

          {/* Consequence list */}
          {consequences && consequences.length > 0 && (
            <ul className="mt-4 space-y-1.5 pl-14">
              {consequences.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
          )}

          {/* Impact badge */}
          {impactLine && (
            <div
              className={`mt-4 ml-14 rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset ${styles.badge}`}
              role="note"
            >
              {impactLine}
            </div>
          )}
        </div>

        {/* ── "Don't show again" checkbox ────────────────────────── */}
        {suppressKey && (
          <div className="px-6 pb-2">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-500 select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
              />
              Don&apos;t show this again
            </label>
          </div>
        )}

        {/* ── Footer buttons ──────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors ${styles.confirm}`}
            aria-busy={loading}
          >
            {loading && <Spinner size={14} color="currentColor" label="Processing" />}
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
