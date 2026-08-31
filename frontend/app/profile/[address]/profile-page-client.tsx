"use client";

import ErrorBanner from "@/components/ErrorBanner";
import AvailabilityIndicator from "@/components/AvailabilityIndicator";
import StatusPill from "@/components/StatusPill";
import TruncatedAddress from "@/components/TruncatedAddress";
import CertificateDownloadButton from "@/components/CertificateDownloadButton";
import { buildCertificateData } from "@/lib/certificate-pdf";
import { getJob, getJobCount, isBlacklisted, isWhitelisted, isWhitelistModeEnabled, getCertificates, getCertificateCount } from "@/lib/contract";
import type { CompletionCertificate } from "@/lib/contract";
import { toXlm } from "@/lib/format";
import {
  MAX_BIO_LENGTH,
  MAX_HIGHLIGHTS,
  MAX_LINKS,
  MAX_SKILLS,
  MAX_TESTIMONIAL_LENGTH,
  emptyPortfolio,
  isProfileComplete,
  loadPortfolio,
  loadTestimonials,
  sanitizeUrl,
  savePortfolio,
  upsertTestimonial,
  type ExternalLink,
  type Portfolio,
  type Testimonial,
} from "@/lib/portfolio";
import type { Job } from "@/lib/types";
import {
  countActiveJobsFromProfileJobs,
  emptyAvailability,
  getEffectiveAvailability,
  loadAvailability,
  saveAvailability,
  type AvailabilityPreference,
  type FreelancerAvailability,
} from "@/lib/availability";
import { useWallet } from "@/lib/wallet-context";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface ProfileJob {
  id: number;
  job: Job;
  role: "client" | "freelancer";
}

// ─── Verification badge ───────────────────────────────────────────────────────

function VerifiedBadge() {
  return (
    <span
      title="Profile complete – all portfolio sections filled"
      aria-label="Verified complete profile"
      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      Verified
    </span>
  );
}

// ─── Skills tag input ─────────────────────────────────────────────────────────

function SkillsEditor({
  skills,
  onChange,
}: {
  skills: string[];
  onChange: (s: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addSkill() {
    const tag = input.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || skills.includes(tag) || skills.length >= MAX_SKILLS) return;
    onChange([...skills, tag]);
    setInput("");
    inputRef.current?.focus();
  }

  function removeSkill(tag: string) {
    onChange(skills.filter((s) => s !== tag));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
          >
            {s}
            <button
              type="button"
              onClick={() => removeSkill(s)}
              aria-label={`Remove skill ${s}`}
              className="ml-0.5 rounded-full text-slate-400 hover:text-slate-700"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {skills.length < MAX_SKILLS && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder="Add skill (press Enter)"
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="New skill"
          />
          <button
            type="button"
            onClick={addSkill}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add
          </button>
        </div>
      )}
      <p className="text-xs text-slate-400">{skills.length}/{MAX_SKILLS} skills</p>
    </div>
  );
}

// ─── Links editor ─────────────────────────────────────────────────────────────

const LINK_PRESETS = ["GitHub", "LinkedIn", "Website", "Twitter", "Other"];

function LinksEditor({
  links,
  onChange,
}: {
  links: ExternalLink[];
  onChange: (l: ExternalLink[]) => void;
}) {
  const [label, setLabel] = useState(LINK_PRESETS[0]);
  const [url, setUrl] = useState("");

  function addLink() {
    const sanitized = sanitizeUrl(url);
    if (!sanitized || links.length >= MAX_LINKS) return;
    onChange([...links, { label, url: sanitized }]);
    setUrl("");
  }

  function removeLink(idx: number) {
    onChange(links.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-20 shrink-0 font-medium text-slate-600">{l.label}</span>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-blue-600 hover:underline"
          >
            {l.url}
          </a>
          <button
            type="button"
            onClick={() => removeLink(i)}
            aria-label={`Remove ${l.label} link`}
            className="shrink-0 rounded px-1 text-xs text-slate-400 hover:text-red-500"
          >
            ✕
          </button>
        </div>
      ))}
      {links.length < MAX_LINKS && (
        <div className="flex flex-wrap gap-2">
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Link type"
          >
            {LINK_PRESETS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Link URL"
          />
          <button
            type="button"
            onClick={addLink}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add
          </button>
        </div>
      )}
      <p className="text-xs text-slate-400">{links.length}/{MAX_LINKS} links</p>
    </div>
  );
}

// ─── Testimonial form ─────────────────────────────────────────────────────────

function TestimonialForm({
  freelancerAddress,
  jobId,
  clientAddress,
  existingText,
  onSaved,
}: {
  freelancerAddress: string;
  jobId: number;
  clientAddress: string;
  existingText: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState(existingText);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    upsertTestimonial(freelancerAddress, {
      jobId,
      clientAddress,
      text: trimmed.slice(0, MAX_TESTIMONIAL_LENGTH),
      createdAt: Date.now(),
    });
    setSaved(true);
    onSaved();
  }

  if (saved) {
    return (
      <p className="text-sm text-emerald-700">
        ✓ Testimonial saved.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_TESTIMONIAL_LENGTH}
        rows={3}
        placeholder="Share your experience working with this freelancer…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Testimonial text"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">{text.length}/{MAX_TESTIMONIAL_LENGTH}</span>
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {existingText ? "Update" : "Submit"} Testimonial
        </button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProfilePageClient({ address }: { address: string }) {
  const { wallet } = useWallet();

  const [jobs, setJobs] = useState<ProfileJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [restricted, setRestricted] = useState(false);
  const [restrictionReason, setRestrictionReason] = useState("");

  // Portfolio state
  const [portfolio, setPortfolio] = useState<Portfolio>(emptyPortfolio());
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Portfolio>(emptyPortfolio());
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [certificates, setCertificates] = useState<CompletionCertificate[]>([]);
  const [availability, setAvailability] = useState<FreelancerAvailability>(emptyAvailability());

  const addressValid = isValidStellarAddress(address);
  const isOwner = wallet === address;
  const verified = isProfileComplete(portfolio);

  // Load portfolio + testimonials from localStorage
  useEffect(() => {
    if (!addressValid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPortfolio(loadPortfolio(address));
    setTestimonials(loadTestimonials(address));
    setAvailability(loadAvailability(address));
  }, [address, addressValid]);

  const refreshTestimonials = useCallback(() => {
    setTestimonials(loadTestimonials(address));
  }, [address]);

  const fetchJobs = useCallback(async () => {
    if (!addressValid) return;
    setLoading(true);
    setError(null);
    try {
      try {
        const [blacklisted, whitelistMode, whitelisted] = await Promise.all([
          isBlacklisted(address),
          isWhitelistModeEnabled(),
          isWhitelisted(address),
        ]);
        
        if (blacklisted) {
          setRestricted(true);
          setRestrictionReason("Your account has been restricted.");
        } else if (whitelistMode && !whitelisted) {
          setRestricted(true);
          setRestrictionReason("Your account is pending whitelist approval. Some actions may be restricted.");
        } else {
          setRestricted(false);
        }
      } catch {
        // ignore errors reading access control
      }

      const count = await getJobCount();
      const fetched: ProfileJob[] = [];
      for (let id = 1; id <= count; id += 1) {
        const job = await getJob(String(id));
        if (!job) continue;
        if (job.client === address) fetched.push({ id, job, role: "client" });
        else if (job.freelancer === address) fetched.push({ id, job, role: "freelancer" });
      }
      setJobs(fetched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch job history.");
    } finally {
      setLoading(false);
    }
  }, [address, addressValid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!wallet || !addressValid) return;
    let cancelled = false;
    getCertificateCount(address)
      .then((count) => {
        if (cancelled || count === 0) return;
        return getCertificates(address, 0, count);
      })
      .then((certs) => {
        if (!cancelled && certs) setCertificates(certs);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [wallet, address, addressValid]);

  // Derived stats
  const jobsPosted = jobs.filter((j) => j.role === "client").length;
  const jobsCompleted = jobs.filter((j) => j.job.status === "Completed").length;
  const completedAsFreelancer = jobs.filter(
    (j) => j.role === "freelancer" && j.job.status === "Completed",
  );
  const activeJobsAsFreelancer = countActiveJobsFromProfileJobs(jobs, address);
  const effectiveAvailability = getEffectiveAvailability(
    availability.preference,
    activeJobsAsFreelancer,
  );
  const totalEarnedStroops = completedAsFreelancer.reduce((sum, j) => {
    const a = BigInt(j.job.amount);
    return sum + a - (a * 250n) / 10_000n;
  }, 0n);
  const totalSpentStroops = jobs
    .filter((j) => j.role === "client" && j.job.status === "Completed")
    .reduce((sum, j) => sum + BigInt(j.job.amount), 0n);

  const reputationScore = (() => {
    const completed = completedAsFreelancer.length;
    const testimonialCount = testimonials.length;
    const hasVerified = isProfileComplete(portfolio);
    let score = 1;
    score += Math.min(completed, 4);
    score += Math.min(testimonialCount * 0.5, 2);
    if (hasVerified) score += 0.5;
    return Math.min(score, 5);
  })();

  const activityTimeline = [...jobs]
    .sort((a, b) => Number(b.job.created_at) - Number(a.job.created_at))
    .slice(0, 10)
    .map(({ id, job, role }) => ({
      id,
      role,
      job,
      description:
        role === "client"
          ? job.status === "Completed"
            ? `Approved Job #${id}`
            : job.status === "Cancelled"
              ? `Cancelled Job #${id}`
              : `Posted Job #${id}`
          : job.status === "Completed"
            ? `Completed Job #${id}`
            : job.status === "Cancelled"
              ? `Cancelled Job #${id}`
              : job.status === "SubmittedForReview"
                ? `Submitted work for Job #${id}`
                : `Accepted Job #${id}`,
    }));

  function startEdit() {
    if (!isOwner) return;
    setDraft({ ...portfolio, skills: [...portfolio.skills], links: [...portfolio.links], highlightedJobIds: [...portfolio.highlightedJobIds] });
    setEditMode(true);
    setSaveSuccess(false);
  }

  function cancelEdit() {
    setEditMode(false);
  }

  function saveEdit() {
    if (!isOwner) return;
    const cleaned: Portfolio = {
      version: 1,
      bio: draft.bio.trim().slice(0, MAX_BIO_LENGTH),
      skills: draft.skills.slice(0, MAX_SKILLS),
      links: draft.links.slice(0, MAX_LINKS),
      highlightedJobIds: draft.highlightedJobIds.slice(0, MAX_HIGHLIGHTS),
    };
    savePortfolio(address, cleaned);
    setPortfolio(cleaned);
    setEditMode(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  function toggleHighlight(jobId: number) {
    setDraft((prev) => {
      const already = prev.highlightedJobIds.includes(jobId);
      if (already) return { ...prev, highlightedJobIds: prev.highlightedJobIds.filter((id) => id !== jobId) };
      if (prev.highlightedJobIds.length >= MAX_HIGHLIGHTS) return prev;
      return { ...prev, highlightedJobIds: [...prev.highlightedJobIds, jobId] };
    });
  }

  // ── Invalid address ──────────────────────────────────────────────────────
  if (!addressValid) {
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-blue-600 hover:underline">Back to Home</Link>
          <h1 className="text-2xl font-semibold">Profile</h1>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-medium text-red-800">Invalid Address</p>
          <p className="mt-1 text-sm text-red-600">&ldquo;{address}&rdquo; is not a valid Stellar address.</p>
          <p className="mt-3 text-xs text-red-600">Stellar addresses start with &ldquo;G&rdquo; and are 56 characters long.</p>
        </div>
      </section>
    );
  }

  // ── Not connected ────────────────────────────────────────────────────────
  // Completed jobs eligible for highlights (as freelancer)
  const highlightableJobs = completedAsFreelancer;
  const highlightedJobs = jobs.filter((j) =>
    portfolio.highlightedJobIds.includes(j.id),
  );

  // Jobs where connected wallet is client and address is the freelancer (for testimonials)
  const clientCanTestifyJobs = jobs.filter(
    (j) =>
      wallet &&
      j.role === "freelancer" &&
      j.job.client === wallet &&
      j.job.freelancer === address &&
      j.job.status === "Completed" &&
      wallet !== address,
  );

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-blue-600 hover:underline">Back to Home</Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">Profile</h1>
              {verified && <VerifiedBadge />}
            </div>
            <p className="mt-1 font-mono text-sm text-slate-500 break-all">{address}</p>
            <div className="mt-2">
              <AvailabilityIndicator
                address={address}
                activeJobCount={activeJobsAsFreelancer}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && !editMode && (
            <button
              type="button"
              onClick={startEdit}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit Portfolio
            </button>
          )}
          {!isOwner && wallet && (
            <Link
              href={`/messages/${address}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 10c0 2.21-2.686 4-6 4a7.232 7.232 0 01-3.115-.674L2 14l.897-2.392A3.954 3.954 0 012 10c0-2.21 2.686-4 6-4s6 1.79 6 4z" />
              </svg>
              Message
            </Link>
          )}
        </div>
      </div>

      {restricted && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-medium text-red-800">
              {restrictionReason}
            </p>
          </div>
        </div>
      )}

      {saveSuccess && (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          ✓ Portfolio saved.
        </p>
      )}

      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={() => void fetchJobs()} />
      )}

      {isOwner && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Account Security &amp; Key Management
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Your wallet is non-custodial. Ensure you have backed up your 12-word recovery phrase.
                </p>
              </div>
            </div>
            <Link
              href="/help"
              className="shrink-0 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              View Recovery Guide &rarr;
            </Link>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Freelancer availability
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Let clients know if you are open for new work. Saved on this device.
          </p>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <AvailabilityIndicator
                address={address}
                activeJobCount={activeJobsAsFreelancer}
              />
              <span className="text-xs text-slate-500">
                {activeJobsAsFreelancer} active job
                {activeJobsAsFreelancer === 1 ? "" : "s"} on-chain
              </span>
            </div>
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <label
                htmlFor="availability-preference"
                className="text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                Availability status
              </label>
              <select
                id="availability-preference"
                value={availability.preference}
                onChange={(e) => {
                  const preference = e.target.value as AvailabilityPreference;
                  setAvailability(
                    saveAvailability(address, { ...availability, preference }),
                  );
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </div>
            <label
              htmlFor="open-to-offers"
              className="flex cursor-pointer items-center justify-between gap-4"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Open to offers
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Show that you welcome new proposals even when busy.
                </span>
              </span>
              <button
                id="open-to-offers"
                role="switch"
                aria-checked={availability.openToOffers}
                type="button"
                onClick={() =>
                  setAvailability(
                    saveAvailability(address, {
                      ...availability,
                      openToOffers: !availability.openToOffers,
                    }),
                  )
                }
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  availability.openToOffers
                    ? "bg-blue-600"
                    : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                    availability.openToOffers ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
            <p className="text-xs text-slate-400">
              Clients see: <strong>{effectiveAvailability}</strong>
              {effectiveAvailability === "busy" && activeJobsAsFreelancer > 0
                ? ` (${activeJobsAsFreelancer} active)`
                : ""}
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-slate-200 bg-white p-4">
              <div className="mx-auto h-8 w-16 rounded bg-slate-200" />
              <div className="mx-auto mt-2 h-3 w-20 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard value={String(jobsPosted)} label="Jobs Posted" />
          <StatCard value={String(jobsCompleted)} label="Jobs Completed" />
          <StatCard value={String(activeJobsAsFreelancer)} label="Active Jobs" />
          <StatCard value={toXlm(totalEarnedStroops)} label="XLM Earned" unit="XLM" />
          <StatCard value={toXlm(totalSpentStroops)} label="XLM Spent" unit="XLM" />
        </div>
      )}

      {!loading && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Reputation</h2>
            <span className="inline-flex items-center gap-0.5" aria-label={`Reputation score: ${reputationScore.toFixed(1)} out of 5`}>
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = reputationScore >= star;
                const half = !filled && reputationScore >= star - 0.5;
                return (
                  <svg
                    key={star}
                    className={`h-5 w-5 ${filled ? "text-amber-400" : half ? "text-amber-300" : "text-slate-200"}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                );
              })}
            </span>
            <span className="text-sm font-medium text-slate-600">{reputationScore.toFixed(1)}/5</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Based on {completedAsFreelancer.length} completed jobs, {testimonials.length} testimonials, and portfolio completeness.
          </p>
        </div>
      )}

      {/* ── EDIT MODE ──────────────────────────────────────────────────────── */}
      {editMode && (
        <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Edit Portfolio</h2>
            <div className="flex gap-2">
              <button type="button" onClick={cancelEdit}
                className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={saveEdit}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                Save
              </button>
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700" htmlFor="portfolio-bio">
              Bio / About
            </label>
            <textarea
              id="portfolio-bio"
              value={draft.bio}
              onChange={(e) => setDraft((p) => ({ ...p, bio: e.target.value }))}
              maxLength={MAX_BIO_LENGTH}
              rows={4}
              placeholder="Tell potential clients about yourself, your expertise, and what makes you a great freelancer…"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-right text-xs text-slate-400">{draft.bio.length}/{MAX_BIO_LENGTH}</p>
          </div>

          {/* Skills */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">Skills</p>
            <SkillsEditor
              skills={draft.skills}
              onChange={(s) => setDraft((p) => ({ ...p, skills: s }))}
            />
          </div>

          {/* Links */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">External Links</p>
            <LinksEditor
              links={draft.links}
              onChange={(l) => setDraft((p) => ({ ...p, links: l }))}
            />
          </div>

          {/* Highlighted jobs */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">
              Highlighted Completed Jobs
              <span className="ml-1 text-xs font-normal text-slate-400">
                ({draft.highlightedJobIds.length}/{MAX_HIGHLIGHTS} selected)
              </span>
            </p>
            {highlightableJobs.length === 0 ? (
              <p className="text-xs text-slate-400">No completed jobs as freelancer yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {highlightableJobs.map(({ id, job }) => {
                  const selected = draft.highlightedJobIds.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleHighlight(id)}
                      aria-pressed={selected}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      #{id} · {toXlm(job.amount)} XLM
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Verification hint */}
          {!isProfileComplete(draft) && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Complete all sections (bio ≥ 20 chars, 1+ skill, 1+ link, 1+ highlighted job) to earn the Verified badge.
            </p>
          )}
        </div>
      )}

      {/* ── VIEW MODE PORTFOLIO ─────────────────────────────────────────────── */}
      {!editMode && (
        <>
          {/* Bio */}
          {portfolio.bio ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-2 text-lg font-semibold">About</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                {portfolio.bio}
              </p>
            </div>
          ) : isOwner ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
              <p className="text-sm text-slate-500">No bio yet.</p>
              <button type="button" onClick={startEdit}
                className="mt-2 text-sm font-medium text-blue-600 hover:underline">
                Add a bio →
              </button>
            </div>
          ) : null}

          {/* Skills */}
          {portfolio.skills.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-lg font-semibold">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {portfolio.skills.map((s) => (
                  <span key={s}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Links */}
          {portfolio.links.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-lg font-semibold">Links</h2>
              <ul className="space-y-2">
                {portfolio.links.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-20 shrink-0 font-medium text-slate-600">{l.label}</span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-blue-600 hover:underline">
                      {l.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Highlighted completed jobs */}
          {highlightedJobs.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-lg font-semibold">Featured Work</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {highlightedJobs.map(({ id, job }) => {
                  const jobTestimonials = testimonials.filter((t) => t.jobId === id);
                  return (
                    <li key={id}
                      className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/job/${id}`}
                          className="font-medium text-blue-600 hover:underline">
                          Job #{id}
                        </Link>
                        <StatusPill status={job.status} />
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {toXlm(job.amount)} XLM
                      </p>
                      {jobTestimonials.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {jobTestimonials.map((t, ti) => (
                            <blockquote key={ti}
                              className="rounded-md bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
                              &ldquo;{t.text}&rdquo;
                              <footer className="mt-1 not-italic text-slate-400">
                                — {shortAddress(t.clientAddress)}
                              </footer>
                            </blockquote>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Client testimonial forms */}
          {clientCanTestifyJobs.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-lg font-semibold">Leave a Testimonial</h2>
              <p className="mb-4 text-sm text-slate-500">
                You have completed jobs with this freelancer. Share your experience.
              </p>
              <div className="space-y-5">
                {clientCanTestifyJobs.map(({ id }) => {
                  const existing = testimonials.find(
                    (t) => t.jobId === id && t.clientAddress === wallet,
                  );
                  return (
                    <div key={id}>
                      <p className="mb-1 text-sm font-medium text-slate-700">
                        Job #{id}
                      </p>
                      <TestimonialForm
                        freelancerAddress={address}
                        jobId={id}
                        clientAddress={wallet!}
                        existingText={existing?.text ?? ""}
                        onSaved={refreshTestimonials}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All testimonials received */}
          {testimonials.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-lg font-semibold">Testimonials</h2>
              <div className="space-y-3">
                {testimonials.map((t, i) => (
                  <blockquote key={i}
                    className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm italic text-slate-700">
                    &ldquo;{t.text}&rdquo;
                    <footer className="mt-2 flex items-center justify-between not-italic text-xs text-slate-400">
                      <span>
                        <Link href={`/profile/${t.clientAddress}`}
                          className="font-mono hover:underline">
                          {shortAddress(t.clientAddress)}
                        </Link>{" "}
                        · Job{" "}
                        <Link href={`/job/${t.jobId}`} className="hover:underline">
                          #{t.jobId}
                        </Link>
                      </span>
                      <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                    </footer>
                  </blockquote>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Activity Timeline ────────────────────────────────────────────────── */}
      {!loading && activityTimeline.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <div className="mt-3 space-y-3">
            {activityTimeline.map((item) => (
              <div key={`${item.id}-${item.role}`} className="flex items-start gap-3">
                <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  item.job.status === "Completed" ? "bg-emerald-500" :
                  item.job.status === "Cancelled" ? "bg-red-400" :
                  item.job.status === "Disputed" ? "bg-amber-500" :
                  "bg-blue-500"
                }`} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/job/${item.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {item.description}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <StatusPill status={item.job.status} />
                    <span>{toXlm(item.job.amount)} XLM</span>
                    <span>·</span>
                    <span>{new Date(Number(item.job.created_at) * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Completion Certificates ─────────────────────────────────────────── */}
      {!loading && certificates.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Completion Certificates</h2>
          <p className="mt-1 text-xs text-slate-400">{certificates.length} on-chain proof{certificates.length !== 1 ? "s" : ""} of completed work</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((cert, idx) => (
              <div
                key={`${cert.job_id}-${idx}`}
                className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"
              >
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 15l-2 5l9-9l-9-9l2 5" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  <Link
                    href={`/job/${cert.job_id}`}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Job #{cert.job_id}
                  </Link>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <p><span className="font-medium">Client:</span> <TruncatedAddress address={cert.client} /></p>
                  <p><span className="font-medium">Amount:</span> {toXlm(cert.amount)} XLM</p>
                  <p><span className="font-medium">Completed:</span> ledger {cert.completed_at}</p>
                </div>
                <div className="mt-3">
                  <CertificateDownloadButton
                    variant="compact"
                    certificateData={buildCertificateData(cert)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!loading && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Job History</h2>
          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No jobs found for this address.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Job history with role, status, amount, and date</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th scope="col" className="pb-2 pr-4">ID</th>
                    <th scope="col" className="pb-2 pr-4">Role</th>
                    <th scope="col" className="pb-2 pr-4">Status</th>
                    <th scope="col" className="pb-2 pr-4 text-right">Amount</th>
                    <th scope="col" className="pb-2 pr-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(({ id, job, role }) => (
                    <tr key={`${id}-${role}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <th scope="row" className="py-2 pr-4">
                        <Link href={`/job/${id}`} className="font-medium text-blue-600 hover:underline">
                          #{id}
                        </Link>
                      </th>
                      <td className="py-2 pr-4 capitalize">{role}</td>
                      <td className="py-2 pr-4"><StatusPill status={job.status} /></td>
                      <td className="py-2 pr-4 text-right">
                        <span className="inline-flex min-w-0 items-baseline justify-end gap-1">
                          <span className="min-w-0 max-w-[10rem] overflow-hidden text-ellipsis whitespace-nowrap tabular-nums">
                            {toXlm(job.amount)}
                          </span>
                          <span className="shrink-0">XLM</span>
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {new Date(Number(job.created_at) * 1000).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ value, label, unit }: { value: string; label: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
      <p className="flex min-w-0 items-baseline justify-center gap-1 text-2xl font-bold">
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap tabular-nums">
          {value}
        </span>
        {unit && <span className="shrink-0 text-xs font-semibold">{unit}</span>}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
