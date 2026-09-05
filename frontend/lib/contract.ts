"use client";

import { callContract, nativeToScVal, xdr } from "@/lib/stellar";
import { requireContractId } from "@/lib/config";
import { getContractIdForNetwork, getPersistedNetwork } from "@/lib/network-config";
export { requireContractId };
import type { Job, Milestone, JobStatusCounts } from "@/lib/types";

export function getActiveContractId(): string {
  if (typeof window !== "undefined") {
    const id = getContractIdForNetwork(getPersistedNetwork());
    if (id) return id;
  }
  return requireContractId();
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex input.");
  }
  if (!/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error("Invalid hex input.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Convert a title string to a 64-byte hex representation for BytesN<64>. */
export function titleToBytesN64(title: string): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(title);
  const padded = new Uint8Array(64);
  padded.set(encoded.slice(0, 64));
  return padded;
}

/**
 * Build the ScVal arguments for `post_job`. Exported separately so the fee
 * estimator can simulate the exact same transaction the form will submit.
 */
export function buildPostJobArgs(
  client: string,
  amount: string,
  bonusAmount: string,
  descHashHex: string,
  descriptionPayloadLen: number,
  deadline: string,
  tokenAddress: string,
  title: string,
  category: string,
) {
  return [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(amount, { type: "i128" }),
    nativeToScVal(bonusAmount, { type: "i128" }),
    nativeToScVal(hexToBytes(descHashHex), { type: "bytes" }),
    nativeToScVal(descriptionPayloadLen, { type: "u32" }),
    nativeToScVal(deadline, { type: "u64" }),
    nativeToScVal(tokenAddress, { type: "address" }),
    nativeToScVal(titleToBytesN64(title), { type: "bytes" }),
    nativeToScVal(category, { type: "symbol" }),
  ];
}

export async function postJob(
  client: string,
  amount: string,
  bonusAmount: string,
  descHashHex: string,
  descriptionPayloadLen: number,
  deadline: string,
  tokenAddress: string,
  title: string,
  category: string,
) {
  return callContract(
    getActiveContractId(),
    "post_job",
    buildPostJobArgs(
      client,
      amount,
      bonusAmount,
      descHashHex,
      descriptionPayloadLen,
      deadline,
      tokenAddress,
      title,
      category,
    ),
  );
}

export async function getCompletedJobsCount(): Promise<number> {
  const response = await callContract(
    getActiveContractId(),
    "get_completed_jobs_count",
    [],
    { readOnly: true },
  );
  return Number(response.data ?? 0);
}

export async function getDescPayloadMax(): Promise<number> {
  const response = await callContract(
    getActiveContractId(),
    "get_desc_payload_max",
    [],
    { readOnly: true },
  );
  return Number(response.data ?? 0);
}

export async function acceptJob(freelancer: string, jobId: string) {
  return callContract(getActiveContractId(), "accept_job", [
    nativeToScVal(freelancer, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function submitWork(freelancer: string, jobId: string) {
  return callContract(getActiveContractId(), "submit_work", [
    nativeToScVal(freelancer, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function approveWork(client: string, jobId: string) {
  return callContract(getActiveContractId(), "approve_work", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function batchApproveJobs(client: string, jobIds: string[]) {
  return callContract(requireContractId(), "batch_approve_jobs", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobIds.map((id) => nativeToScVal(id, { type: "u64" })), { type: "vec" }),
  ]);
}

export async function rateJob(
  caller: string,
  jobId: string,
  score: number,
  commentHash = "0000000000000000000000000000000000000000000000000000000000000000",
) {
  return callContract(getActiveContractId(), "rate_job", [
    nativeToScVal(caller, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(score, { type: "u32" }),
    nativeToScVal(hexToBytes(commentHash), { type: "bytes" }),
  ]);
}

export async function setPaymentPreference(
  freelancer: string,
  jobId: string,
  desiredToken: string,
  maxSlippageBps: number,
) {
  return callContract(requireContractId(), "set_payment_preference", [
    nativeToScVal(freelancer, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(desiredToken, { type: "address" }),
    nativeToScVal(maxSlippageBps, { type: "u32" }),
  ]);
}

export async function getSwapQuote(
  fromToken: string,
  toToken: string,
  amount: string,
) {
  return callContract(
    requireContractId(),
    "get_swap_quote",
    [
      nativeToScVal(fromToken, { type: "address" }),
      nativeToScVal(toToken, { type: "address" }),
      nativeToScVal(amount, { type: "i128" }),
    ],
    { readOnly: true },
  );
}

export async function cancelJob(client: string, jobId: string) {
  const result = await callContract(getActiveContractId(), "cancel_job", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("stellarwork:job-cancelled", { detail: { jobId, status: "Cancelled" } }),
    );
    window.dispatchEvent(
      new CustomEvent("stellarwork:job-status-changed", { detail: { jobId, status: "Cancelled" } }),
    );
  }
  return result;
}

export async function topUpEscrow(client: string, jobId: string, additionalAmount: string) {
  return callContract(getActiveContractId(), "top_up_escrow", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(additionalAmount, { type: "i128" }),
  ]);
}

export async function enforceDeadline(client: string, jobId: string) {
  return callContract(getActiveContractId(), "enforce_deadline", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function extendDeadline(
  client: string,
  jobId: string,
  newDeadline: string,
  freelancerConsent?: string,
) {
  const args = [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(newDeadline, { type: "u64" }),
  ];
  if (freelancerConsent) {
    return callContract(getActiveContractId(), "extend_deadline", [
      ...args,
      nativeToScVal(xdr.ScVal.scvVec([nativeToScVal(freelancerConsent, { type: "address" })])),
    ]);
  }
  return callContract(getActiveContractId(), "extend_deadline", [
    ...args,
    xdr.ScVal.scvVec([]),
  ]);
}

export async function extendJobTtl(caller: string, jobId: string) {
  return callContract(getActiveContractId(), "extend_job_ttl", [
    nativeToScVal(caller, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function raiseDispute(caller: string, jobId: string) {
  return callContract(getActiveContractId(), "raise_dispute", [
    nativeToScVal(caller, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function resolveDispute(jobId: string, clientBps: number) {
  return callContract(getActiveContractId(), "resolve_dispute", [
    nativeToScVal(jobId, { type: "u64" }),
    xdr.ScVal.scvVec([nativeToScVal(clientBps, { type: "u32" })]),
  ]);
}

export async function withdrawFees(tokenAddress: string) {
  return callContract(getActiveContractId(), "withdraw_fees", [
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}

export async function getFees(tokenAddress: string): Promise<number> {
  const response = await callContract(
    getActiveContractId(),
    "get_fees",
    [nativeToScVal(tokenAddress, { type: "address" })],
    { readOnly: true },
  );
  return Number(response.data ?? 0);
}

export async function addAllowedToken(tokenAddress: string) {
  return callContract(getActiveContractId(), "add_allowed_token", [
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}

export async function removeAllowedToken(tokenAddress: string) {
  return callContract(getActiveContractId(), "remove_allowed_token", [
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}

export async function isTokenAllowed(tokenAddress: string): Promise<boolean> {
  const response = await callContract(
    getActiveContractId(),
    "is_token_allowed",
    [nativeToScVal(tokenAddress, { type: "address" })],
    { readOnly: true },
  );
  return Boolean(response.data ?? false);
}

export async function getNativeToken(): Promise<string> {
  const response = await callContract(
    getActiveContractId(),
    "get_native_token",
    [],
    { readOnly: true },
  );
  return String(response.data ?? "");
}

export async function getJobEscrowBalance(jobId: string): Promise<string> {
  const response = await callContract(
    getActiveContractId(),
    "get_job_escrow_balance",
    [nativeToScVal(jobId, { type: "u64" })],
    { readOnly: true },
  );
  return String(response.data ?? "0");
}

export async function getJob(jobId: string): Promise<Job | null> {
  const response = await callContract(
    getActiveContractId(),
    "get_job",
    [nativeToScVal(jobId, { type: "u64" })],
    { readOnly: true },
  );
  return (response.data as Job) ?? null;
}

export async function getJobsBatch(start: string, limit: number): Promise<Job[]> {
  const response = await callContract(
    getActiveContractId(),
    "get_jobs_batch",
    [
      nativeToScVal(start, { type: "u64" }),
      nativeToScVal(limit, { type: "u32" }),
    ],
    { readOnly: true },
  );
  return (response.data as Job[]) ?? [];
}

export async function getJobsByCategory(category: string): Promise<number[]> {
  const response = await callContract(
    getActiveContractId(),
    "get_jobs_by_category",
    [nativeToScVal(category, { type: "symbol" })],
    { readOnly: true },
  );
  const data = response.data as number[] | string[] | undefined;
  if (!data) return [];
  return data.map((id) => Number(id));
}

export async function getJobCount(): Promise<number> {
  const response = await callContract(
    getActiveContractId(),
    "get_job_count",
    [],
    {
      readOnly: true,
    },
  );
  return Number(response.data ?? 0);
}

export async function freelancerCancelJob(freelancer: string, jobId: string) {
  const result = await callContract(getActiveContractId(), "freelancer_cancel_job", [
    nativeToScVal(freelancer, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("stellarwork:job-cancelled", { detail: { jobId, status: "Cancelled" } }),
    );
    window.dispatchEvent(
      new CustomEvent("stellarwork:job-status-changed", { detail: { jobId, status: "Cancelled" } }),
    );
  }
  return result;
}

export async function storeDescriptionCid(caller: string, descHashHex: string, cid: string) {
  return callContract(getActiveContractId(), "store_description_cid", [
    nativeToScVal(caller, { type: "address" }),
    nativeToScVal(hexToBytes(descHashHex), { type: "bytes" }),
    nativeToScVal(cid, { type: "string" }),
  ]);
}

export async function getDescriptionCid(descHashHex: string): Promise<string | null> {
  const response = await callContract(
    getActiveContractId(),
    "get_description_cid",
    [nativeToScVal(hexToBytes(descHashHex), { type: "bytes" })],
    { readOnly: true },
  );
  const cid = response.data as string;
  return cid || null;
}

// ─── Milestone helpers ────────────────────────────────────────────────────────

/** Input for a single milestone when creating a milestone-based job. */
export interface MilestoneInput {
  /** 32-byte description hash as a hex string (64 hex chars). */
  descriptionHashHex: string;
  /** Amount in stroops as a string. */
  amount: string;
}

/**
 * Create a job whose total escrow is the sum of all milestone amounts.
 * Returns the new job ID.
 */
export async function createJobWithMilestones(
  client: string,
  milestones: MilestoneInput[],
  descHashHex: string,
  descriptionPayloadLen: number,
  deadline: string,
  tokenAddress: string,
  title: string,
  category: string,
  bonusAmount: string,
) {
  // Encode milestones as a Vec<MilestoneInput> — each element is a struct map.
  const encodedMilestones = xdr.ScVal.scvVec(
    milestones.map((m) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("description_hash"),
          val: nativeToScVal(hexToBytes(m.descriptionHashHex), { type: "bytes" }),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("amount"),
          val: nativeToScVal(m.amount, { type: "i128" }),
        }),
      ])
    )
  );

  return callContract(getActiveContractId(), "create_job_with_milestones", [
    nativeToScVal(client, { type: "address" }),
    encodedMilestones,
    nativeToScVal(hexToBytes(descHashHex), { type: "bytes" }),
    nativeToScVal(descriptionPayloadLen, { type: "u32" }),
    nativeToScVal(deadline, { type: "u64" }),
    nativeToScVal(tokenAddress, { type: "address" }),
    nativeToScVal(titleToBytesN64(title), { type: "bytes" }),
    nativeToScVal(category, { type: "symbol" }),
    nativeToScVal(bonusAmount, { type: "i128" }),
  ]);
}

/**
 * Release payment for a single milestone.
 * Only the client may call this; the job must be InProgress.
 */
export async function approveMilestone(
  client: string,
  jobId: string,
  milestoneId: number,
) {
  return callContract(getActiveContractId(), "approve_milestone", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(milestoneId, { type: "u32" }),
  ]);
}

/**
 * Complete a milestone by index, releasing payment to the freelancer
 * with the platform fee deducted. Only the client may call this.
 */
export async function completeMilestone(
  client: string,
  jobId: string,
  milestoneIndex: number,
) {
  return callContract(getActiveContractId(), "complete_milestone", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(milestoneIndex, { type: "u32" }),
  ]);
}

/**
 * Fetch all milestones for a job.
 * Returns null if the job has no milestones (regular job).
 */
export async function getMilestones(jobId: string): Promise<Milestone[] | null> {
  try {
    const response = await callContract(
      getActiveContractId(),
      "get_milestones",
      [nativeToScVal(jobId, { type: "u64" })],
      { readOnly: true },
    );
    if (!response.data) return null;
    return response.data as Milestone[];
  } catch {
    // Contract panics with NoMilestones (#23) for regular jobs — treat as null.
    return null;
  }
}

// --- Admin Job Views ---

export async function adminGetAllJobs(admin: string, startIndex: number, limit: number): Promise<Job[]> {
  const response = await callContract(
    getActiveContractId(),
    "admin_get_all_jobs",
    [
      nativeToScVal(admin, { type: "address" }),
      nativeToScVal(startIndex, { type: "u32" }),
      nativeToScVal(limit, { type: "u32" }),
    ],
    { readOnly: true },
  );
  return (response.data as Job[]) ?? [];
}

export async function adminGetJobCount(admin: string): Promise<number> {
  const response = await callContract(
    getActiveContractId(),
    "admin_get_job_count",
    [nativeToScVal(admin, { type: "address" })],
    { readOnly: true },
  );
  return Number(response.data ?? 0);
}

export async function adminGetJobsByStatus(admin: string, status: string, startIndex: number, limit: number): Promise<Job[]> {
  const response = await callContract(
    getActiveContractId(),
    "admin_get_jobs_by_status",
    [
      nativeToScVal(admin, { type: "address" }),
      // For enums, nativeToScVal converts the string literal cleanly for Soroban
      nativeToScVal(status, { type: "symbol" }),
      nativeToScVal(startIndex, { type: "u32" }),
      nativeToScVal(limit, { type: "u32" }),
    ],
    { readOnly: true },
  );
  return (response.data as Job[]) ?? [];
}

// --- Access Control ---

export async function setWhitelistMode(admin: string, enabled: boolean) {
  return callContract(getActiveContractId(), "set_whitelist_mode", [
    nativeToScVal(admin, { type: "address" }),
    nativeToScVal(enabled, { type: "bool" }),
  ]);
}

export async function isWhitelistModeEnabled(): Promise<boolean> {
  const response = await callContract(
    getActiveContractId(),
    "is_whitelist_mode_enabled",
    [],
    { readOnly: true },
  );
  return Boolean(response.data ?? false);
}

export async function addToBlacklist(admin: string, address: string) {
  return callContract(getActiveContractId(), "add_to_blacklist", [
    nativeToScVal(admin, { type: "address" }),
    nativeToScVal(address, { type: "address" }),
  ]);
}

export async function removeFromBlacklist(admin: string, address: string) {
  return callContract(getActiveContractId(), "remove_from_blacklist", [
    nativeToScVal(admin, { type: "address" }),
    nativeToScVal(address, { type: "address" }),
  ]);
}

export async function addToWhitelist(admin: string, address: string) {
  return callContract(getActiveContractId(), "add_to_whitelist", [
    nativeToScVal(admin, { type: "address" }),
    nativeToScVal(address, { type: "address" }),
  ]);
}

export async function removeFromWhitelist(admin: string, address: string) {
  return callContract(getActiveContractId(), "remove_from_whitelist", [
    nativeToScVal(admin, { type: "address" }),
    nativeToScVal(address, { type: "address" }),
  ]);
}

export async function isBlacklisted(address: string): Promise<boolean> {
  const response = await callContract(
    getActiveContractId(),
    "is_blacklisted",
    [nativeToScVal(address, { type: "address" })],
    { readOnly: true },
  );
  return Boolean(response.data ?? false);
}

export async function isWhitelisted(address: string): Promise<boolean> {
  const response = await callContract(
    getActiveContractId(),
    "is_whitelisted",
    [nativeToScVal(address, { type: "address" })],
    { readOnly: true },
  );
  return Boolean(response.data ?? false);
}

// Issue #463 — Partial split dispute resolution
export async function resolveDisputeSplit(jobId: string, clientPayoutBps: number) {
  return callContract(getActiveContractId(), "resolve_dispute_split", [
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(String(clientPayoutBps), { type: "u32" }),
  ]);
}

// Issue #456 — Trusted forwarder / gasless operations
export async function setTrustedForwarder(forwarder: string, isTrusted: boolean) {
  return callContract(getActiveContractId(), "set_trusted_forwarder", [
    nativeToScVal(forwarder, { type: "address" }),
    nativeToScVal(isTrusted, { type: "bool" }),
  ]);
}

export async function isTrustedForwarder(forwarder: string): Promise<boolean> {
  const response = await callContract(
    getActiveContractId(),
    "is_trusted_forwarder",
    [nativeToScVal(forwarder, { type: "address" })],
    { readOnly: true },
  );
  return Boolean(response.data ?? false);
}

export async function getJobStatusCounts(): Promise<JobStatusCounts> {
  const response = await callContract(
    getActiveContractId(),
    "get_job_status_counts",
    [],
    { readOnly: true },
  );
  return (response.data as JobStatusCounts) ?? {
    open: 0,
    in_progress: 0,
    submitted_for_review: 0,
    completed: 0,
    cancelled: 0,
    disputed: 0,
    total: 0,
  };
}

export async function relayCancelJob(relayer: string, client: string, jobId: string) {
  return callContract(getActiveContractId(), "relay_cancel_job", [
    nativeToScVal(relayer, { type: "address" }),
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

// ─── SC-106: Job Versioning ───────────────────────────────────────────────────

/**
 * Returns the schema version number for a given job.
 * All jobs created from this schema version onwards will have version = 1.
 */
export async function getJobVersion(jobId: string): Promise<number> {
  const response = await callContract(
    getActiveContractId(),
    "get_job_version",
    [nativeToScVal(jobId, { type: "u64" })],
    { readOnly: true },
  );
  return Number(response.data ?? 1);
}

/**
 * Migrate a job's schema version to a target version.
 * Only the job's client or the platform admin may call this.
 * The targetVersion must be >= the current version (no downgrades allowed).
 * Returns the new version number.
 */
export async function migrateJobVersion(
  caller: string,
  jobId: string,
  targetVersion: number,
): Promise<number> {
  const response = await callContract(getActiveContractId(), "migrate_job_version", [
    nativeToScVal(caller, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(targetVersion, { type: "u32" }),
  ]);
  return Number(response.data ?? targetVersion);
}

// ─── Job View Counter ────────────────────────────────────────────────────────

export async function recordJobView(viewer: string, jobId: string) {
  return callContract(getActiveContractId(), "record_job_view", [
    nativeToScVal(viewer, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function getJobViews(jobId: string): Promise<number> {
  const response = await callContract(
    getActiveContractId(),
    "get_job_views",
    [nativeToScVal(jobId, { type: "u64" })],
    { readOnly: true },
  );
  return Number(response.data ?? 0);
}

// ─── Completion Certificates ─────────────────────────────────────────────────

export interface CompletionCertificate {
  job_id: number;
  client: string;
  freelancer: string;
  amount: string;
  completed_at: string;
  metadata_uri: string;
}

export async function getCertificates(
  freelancer: string,
  start: number,
  limit: number,
): Promise<CompletionCertificate[]> {
  const response = await callContract(
    getActiveContractId(),
    "get_certificates",
    [
      nativeToScVal(freelancer, { type: "address" }),
      nativeToScVal(start, { type: "u64" }),
      nativeToScVal(limit, { type: "u64" }),
    ],
    { readOnly: true },
  );
  return (response.data as CompletionCertificate[]) ?? [];
}

export async function getCertificateCount(freelancer: string): Promise<number> {
  const response = await callContract(
    getActiveContractId(),
    "get_certificate_count",
    [nativeToScVal(freelancer, { type: "address" })],
    { readOnly: true },
  );
  return Number(response.data ?? 0);
}
