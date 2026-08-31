"use client";

import type { Job, JobStatus } from "@/lib/types";

export type AvailabilityPreference = "available" | "busy" | "unavailable";
export type EffectiveAvailabilityStatus = "available" | "busy" | "unavailable";

export interface FreelancerAvailability {
  version: 1;
  preference: AvailabilityPreference;
  openToOffers: boolean;
  updatedAt: number;
}

const STORAGE_PREFIX = "stellarwork:availability:";
export const AVAILABILITY_UPDATED_EVENT = "stellarwork:availability-updated";

const ACTIVE_FREELANCER_STATUSES: JobStatus[] = ["InProgress", "SubmittedForReview"];

export function emptyAvailability(): FreelancerAvailability {
  return {
    version: 1,
    preference: "available",
    openToOffers: false,
    updatedAt: Date.now(),
  };
}

function storageKey(address: string): string {
  return `${STORAGE_PREFIX}${address}`;
}

export function loadAvailability(address: string): FreelancerAvailability {
  if (typeof window === "undefined") return emptyAvailability();
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return emptyAvailability();
    const parsed = JSON.parse(raw) as Partial<FreelancerAvailability>;
    const preference = parsed.preference;
    const validPreference =
      preference === "available" || preference === "busy" || preference === "unavailable"
        ? preference
        : "available";
    return {
      version: 1,
      preference: validPreference,
      openToOffers: parsed.openToOffers === true,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return emptyAvailability();
  }
}

export function saveAvailability(
  address: string,
  data: FreelancerAvailability,
): FreelancerAvailability {
  const next: FreelancerAvailability = {
    ...data,
    version: 1,
    updatedAt: Date.now(),
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(storageKey(address), JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent(AVAILABILITY_UPDATED_EVENT, { detail: { address } }),
    );
  }
  return next;
}

export function countActiveJobsAsFreelancer(
  jobs: Job[],
  freelancerAddress: string,
): number {
  return jobs.filter(
    (job) =>
      job.freelancer === freelancerAddress &&
      ACTIVE_FREELANCER_STATUSES.includes(job.status),
  ).length;
}

export function countActiveJobsFromProfileJobs(
  profileJobs: Array<{ job: Job; role: "client" | "freelancer" }>,
  freelancerAddress: string,
): number {
  return profileJobs.filter(
    (entry) =>
      entry.role === "freelancer" &&
      entry.job.freelancer === freelancerAddress &&
      ACTIVE_FREELANCER_STATUSES.includes(entry.job.status),
  ).length;
}

export function buildActiveFreelancerJobCountMap(
  jobs: Array<{ job: Job }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const { job } of jobs) {
    if (!job.freelancer || !ACTIVE_FREELANCER_STATUSES.includes(job.status)) {
      continue;
    }
    map.set(job.freelancer, (map.get(job.freelancer) ?? 0) + 1);
  }
  return map;
}

export function getEffectiveAvailability(
  preference: AvailabilityPreference,
  activeJobCount: number,
): EffectiveAvailabilityStatus {
  if (preference === "unavailable") return "unavailable";
  if (preference === "busy" || activeJobCount > 0) return "busy";
  return "available";
}

export const AVAILABILITY_LABELS: Record<EffectiveAvailabilityStatus, string> = {
  available: "Available",
  busy: "Busy",
  unavailable: "Unavailable",
};

export const AVAILABILITY_STYLES: Record<EffectiveAvailabilityStatus, string> = {
  available: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  busy: "bg-amber-100 text-amber-800 ring-amber-200",
  unavailable: "bg-slate-100 text-slate-600 ring-slate-200",
};
