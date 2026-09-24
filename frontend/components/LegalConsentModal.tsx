"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useModalFocusTrap } from "@/lib/modal";

const LEGAL_VERSION_KEY = "stellarwork:legal-version";
const LEGAL_ACCEPTED_KEY = "stellarwork:legal-accepted";
const CURRENT_LEGAL_VERSION = 1;

export function getLegalVersion(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(LEGAL_VERSION_KEY) ?? 0);
}

export function hasAcceptedLegal(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LEGAL_ACCEPTED_KEY) === "true"
    && getLegalVersion() >= CURRENT_LEGAL_VERSION;
}

export function acceptLegal(): void {
  localStorage.setItem(LEGAL_ACCEPTED_KEY, "true");
  localStorage.setItem(LEGAL_VERSION_KEY, String(CURRENT_LEGAL_VERSION));
}

interface LegalConsentModalProps {
  onAccept: () => void;
  onClose?: () => void;
}

export default function LegalConsentModal({ onAccept, onClose }: LegalConsentModalProps) {
  const [agreed, setAgreed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useModalFocusTrap(true, dialogRef, handleClose, {
    initialFocusRef: checkboxRef,
    shouldCloseOnEscape: () => Boolean(onClose),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-consent-title"
        aria-describedby="legal-consent-description"
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl focus:outline-none"
      >
        <h2 id="legal-consent-title" className="text-xl font-semibold text-slate-900">Terms of Service</h2>
        <p id="legal-consent-description" className="mt-2 text-sm leading-6 text-slate-600">
          Before using StellarWork, please read and agree to our{" "}
          <Link href="/legal/terms" className="text-blue-600 underline hover:text-blue-700" target="_blank">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-blue-600 underline hover:text-blue-700" target="_blank">
            Privacy Policy
          </Link>.
        </p>

        <label className="mt-4 flex items-start gap-3">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          />
          <span className="text-sm leading-6 text-slate-600">
            I have read and agree to the{" "}
            <Link href="/legal/terms" className="text-blue-600 underline hover:text-blue-700" target="_blank">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="text-blue-600 underline hover:text-blue-700" target="_blank">
              Privacy Policy
            </Link>.
          </span>
        </label>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => {
              acceptLegal();
              onAccept();
            }}
            disabled={!agreed}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Accept
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"
            >
              Decline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
