"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useModalFocusTrap } from "@/lib/modal";

const STORAGE_KEY = "stellarwork:onboarding-complete";
const HELP_STORAGE_KEY = "stellarwork:onboarding-dismissed";

interface Step {
  title: string;
  description: string;
  tip?: string;
  link?: {
    href: string;
    text: string;
  };
}

const STEPS: Step[] = [
  {
    title: "Welcome to StellarWork",
    description:
      "StellarWork is a decentralized freelance marketplace built on the Stellar blockchain. Clients post jobs, freelancers accept and complete work, and payments are secured by a trustless escrow smart contract.",
    tip: "No middleman, no chargebacks — just code-enforced agreements.",
  },
  {
    title: "Install Freighter Wallet",
    description:
      "To interact with the platform you need a Stellar wallet. We recommend Freighter — a free browser extension that keeps your keys safe and lets you sign transactions with a single click.",
    tip: 'Search "Freighter" in your browser\'s extension store, or visit freighter.app.',
    link: {
      href: "/help",
      text: "Read our Account Recovery & Key Management Guide",
    },
  },
  {
    title: "Connect Your Wallet",
    description:
      "Once Freighter is installed, click the wallet icon in the top navigation bar. Approve the connection request in the Freighter popup and your public address will appear in the header.",
    tip: "Your wallet address is your identity on the platform — no username or password needed.",
  },
  {
    title: "Browse Jobs as a Freelancer",
    description:
      'The home page lists all open jobs. Use the search bar to find projects by keyword, amount, or client address. Click "View Details" to read the full description and "Accept Job" to take it on.',
    tip: "Bookmark jobs you're interested in to quickly find them later.",
  },
  {
    title: "Post a Job as a Client",
    description:
      'Click "Post a Job" in the navigation or on the home page hero. Fill in a description, set the budget and optional deadline, then submit. The payment is locked in escrow immediately.',
    tip: "Funds are held securely until you approve the freelancer's work.",
  },
  {
    title: "Job Statuses & Lifecycle",
    description:
      "Jobs move through: Open → In Progress → Submitted for Review → Completed (or Cancelled / Disputed). You can track your active jobs on the Dashboard and resolve disputes via the Disputes page.",
    tip: "Head to the Dashboard page to monitor all your jobs in one place.",
  },
];

interface OnboardingWizardProps {
  /** Force-show the wizard regardless of localStorage (for help-menu re-access). */
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function OnboardingWizard({ forceOpen = false, onClose }: OnboardingWizardProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (forceOpen) {
      setVisible(true);
      setStep(0);
      return;
    }
    // Show only on first visit (flag not yet set).
    const done = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(HELP_STORAGE_KEY);
    if (!done) {
      setVisible(true);
    }
  }, [forceOpen]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
    onClose?.();
  }

  function skip() {
    localStorage.setItem(HELP_STORAGE_KEY, "1");
    setVisible(false);
    onClose?.();
  }

  useModalFocusTrap(visible, dialogRef, dismiss);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding wizard"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-t-xl bg-slate-100">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            aria-hidden="true"
          />
        </div>

        <div className="p-6">
          {/* Step counter */}
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Step {step + 1} of {STEPS.length}
          </p>

          {/* Title */}
          <h2 className="mt-2 text-xl font-semibold text-slate-900">{current.title}</h2>

          {/* Description */}
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{current.description}</p>

          {/* Tip */}
          {current.tip && (
            <div className="mt-4 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <span className="font-semibold">Tip: </span>
              {current.tip}
              {current.link && (
                <div className="mt-2 font-medium">
                  <Link href={current.link.href} className="underline hover:text-blue-950">
                    {current.link.text} &rarr;
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={skip}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back
                </button>
              )}
              {isLast ? (
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Get started
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Next
                </button>
              )}
            </div>
          </div>

          {/* Step dots */}
          <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === step ? "bg-blue-600" : "bg-slate-200 hover:bg-slate-300"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
