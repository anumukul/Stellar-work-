"use client";

/**
 * CertificateDownloadButton — issue #818
 *
 * Renders a "Download Certificate" button plus optional LinkedIn / share
 * actions for a completed job.  Designed to be used both on the job detail
 * page and within the certificates gallery on the freelancer profile page.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import {
  downloadCertificate,
  shareToLinkedIn,
  type CertificateData,
} from "@/lib/certificate-pdf";

interface CertificateDownloadButtonProps {
  /** Certificate data built by `buildCertificateData()` in lib/certificate-pdf. */
  certificateData: CertificateData;
  /**
   * Visual variant:
   * - "button"  — a standard button row (default, used on the job detail page)
   * - "compact" — a small icon-only row (used inside the profile gallery cards)
   */
  variant?: "button" | "compact";
  className?: string;
}

export default function CertificateDownloadButton({
  certificateData,
  variant = "button",
  className = "",
}: CertificateDownloadButtonProps) {
  const { showSuccess, showError } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  const closeShare = useCallback(() => setShareOpen(false), []);

  // Close share dropdown when clicking outside
  useEffect(() => {
    if (!shareOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        closeShare();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareOpen, closeShare]);

  function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      downloadCertificate(certificateData);
      showSuccess("Certificate downloaded successfully.");
    } catch {
      showError("Failed to generate certificate. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  function handleLinkedIn() {
    shareToLinkedIn(certificateData.verificationUrl);
    setShareOpen(false);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(certificateData.verificationUrl);
      showSuccess("Verification link copied.");
    } catch {
      showError("Could not copy link.");
    }
    setShareOpen(false);
  }

  function handleNativeShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      void navigator
        .share({
          title: `${certificateData.jobTitle} — StellarWork Certificate`,
          text: `I completed "${certificateData.jobTitle}" on StellarWork. Verify it here:`,
          url: certificateData.verificationUrl,
        })
        .catch(() => {
          // user dismissed — ignore
        });
    }
    setShareOpen(false);
  }

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          aria-label={`Download certificate for ${certificateData.jobTitle}`}
          title="Download certificate"
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
        >
          <DownloadIcon aria-hidden="true" />
          {downloading ? "…" : "Download"}
        </button>

        <div ref={shareRef} className="relative">
          <button
            type="button"
            onClick={() => setShareOpen((o) => !o)}
            aria-label="Share certificate"
            title="Share certificate"
            aria-expanded={shareOpen}
            aria-haspopup="true"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ShareIcon aria-hidden="true" />
            Share
          </button>
          <ShareDropdown
            open={shareOpen}
            onClose={closeShare}
            onLinkedIn={handleLinkedIn}
            onNativeShare={handleNativeShare}
            onCopyLink={() => void handleCopyLink()}
          />
        </div>
      </div>
    );
  }

  // Default "button" variant
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Download certificate for ${certificateData.jobTitle}`}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-700 dark:hover:bg-emerald-600"
      >
        <DownloadIcon aria-hidden="true" />
        {downloading ? "Generating…" : "Download Certificate"}
      </button>

      <div ref={shareRef} className="relative">
        <button
          type="button"
          onClick={() => setShareOpen((o) => !o)}
          aria-label="Share certificate"
          aria-expanded={shareOpen}
          aria-haspopup="true"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <ShareIcon aria-hidden="true" />
          Share
        </button>
        <ShareDropdown
          open={shareOpen}
          onClose={closeShare}
          onLinkedIn={handleLinkedIn}
          onNativeShare={handleNativeShare}
          onCopyLink={() => void handleCopyLink()}
        />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ShareDropdownProps {
  open: boolean;
  onClose: () => void;
  onLinkedIn: () => void;
  onNativeShare: () => void;
  onCopyLink: () => void;
}

function ShareDropdown({
  open,
  onClose,
  onLinkedIn,
  onNativeShare,
  onCopyLink,
}: ShareDropdownProps) {
  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="absolute right-0 z-50 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        role="menu"
        aria-label="Share certificate"
      >
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            type="button"
            role="menuitem"
            onClick={onNativeShare}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ShareIcon className="h-4 w-4" aria-hidden="true" />
            Share via&hellip;
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={onLinkedIn}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <LinkedInIcon aria-hidden="true" />
          Share on LinkedIn
        </button>
        <hr className="my-1 border-slate-200 dark:border-slate-600" />
        <button
          type="button"
          role="menuitem"
          onClick={onCopyLink}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <CopyIcon aria-hidden="true" />
          Copy verification link
        </button>
      </div>
    </>
  );
}

// ─── Icon components (inline SVG, matching project style) ────────────────────

function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16v-8m0 8l-3-3m3 3l3-3M4 20h16"
      />
    </svg>
  );
}

function ShareIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

function LinkedInIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function CopyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  );
}
