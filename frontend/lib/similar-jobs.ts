import { getJob, getJobsBatch, getJobsByCategory } from "@/lib/contract";
import type { Job } from "@/lib/types";

export type SimilarityCriteria = "amount" | "category" | "description" | "all";

export interface ScoredJob {
  id: number;
  job: Job;
  score: number;
  reasons: SimilarityCriteria[];
}

export interface SimilarJobsResult {
  jobs: ScoredJob[];
  fromCache: boolean;
}

const CACHE_KEY = "stellarwork:similar-jobs-cache";
const CACHE_TTL_MS = 5 * 60 * 1000;
const NOT_INTERESTED_KEY = "stellarwork:similar-jobs-not-interested";
const MAX_CANDIDATES = 60;
const DEFAULT_LIMIT = 6;
const MAX_BATCH = 120;

/** Frontend category id -> on-chain JobCategory symbol (contract only has a subset). */
const ON_CHAIN_CATEGORY: Record<string, string> = {
  development: "Development",
  design: "Design",
  writing: "Writing",
  marketing: "Marketing",
  data: "Data",
  consulting: "Other",
  other: "Other",
  devops: "DevOps",
};

interface CacheEntry {
  key: string;
  jobs: ScoredJob[];
  at: number;
}

interface NotInterestedEntry {
  jobId: number;
  sourceJobId: number;
  at: number;
}

function getCacheKey(sourceJobId: string, criteria: SimilarityCriteria): string {
  return `${sourceJobId}:${criteria}`;
}

function readCache<T>(key: string, ttl: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { at: number; value: T };
    if (Date.now() - entry.at > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Storage full or unavailable — skip caching.
  }
}

export function getSimilarJobsCache(
  sourceJobId: string,
  criteria: SimilarityCriteria,
): SimilarJobsResult | null {
  const cached = readCache<CacheEntry>(CACHE_KEY, CACHE_TTL_MS);
  if (cached && cached.key === getCacheKey(sourceJobId, criteria)) {
    return { jobs: cached.jobs, fromCache: true };
  }
  return null;
}

export function setSimilarJobsCache(
  sourceJobId: string,
  criteria: SimilarityCriteria,
  jobs: ScoredJob[],
): void {
  const entry: CacheEntry = {
    key: getCacheKey(sourceJobId, criteria),
    jobs,
    at: Date.now(),
  };
  writeCache(CACHE_KEY, entry);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "your", "our", "are",
  "you", "will", "can", "have", "from", "please", "nbsp", "about",
  "into", "has", "its", "all", "was", "but", "not", "what", "when",
  "them", "than", "then", "they", "their", "there", "these", "those",
]);

function amountRatio(aAmount: string, bAmount: string): number {
  const a = BigInt(aAmount || "0");
  const b = BigInt(bAmount || "0");
  if (a <= 0n || b <= 0n) return 0;
  if (a > b) return Number((b * 10000n) / a) / 10000;
  return Number((a * 10000n) / b) / 10000;
}

export function scoreSimilarity(
  source: Job,
  candidate: Job,
  sourceDescription: string,
  candidateDescription: string,
): { score: number; reasons: SimilarityCriteria[] } {
  let score = 0;
  const reasons: SimilarityCriteria[] = [];

  const sourceCategory = (source.category || "").toLowerCase().trim();
  const candidateCategory = (candidate.category || "").toLowerCase().trim();

  if (sourceCategory && candidateCategory && sourceCategory === candidateCategory) {
    score += 0.5;
    reasons.push("category");
  }

  const ratio = amountRatio(source.amount, candidate.amount);
  if (ratio >= 0.5) {
    score += ratio * 0.25;
    reasons.push("amount");
  }

  const sourceTokens = tokenize(sourceDescription);
  const candidateTokens = tokenize(candidateDescription);
  if (sourceTokens.length > 0 && candidateTokens.length > 0) {
    const sourceSet = new Set(sourceTokens);
    const candidateSet = new Set(candidateTokens);
    let overlap = 0;
    for (const token of candidateSet) {
      if (sourceSet.has(token)) overlap++;
    }
    const descScore = overlap / Math.min(sourceSet.size, candidateSet.size);
    if (descScore > 0) {
      score += Math.min(1, descScore) * 0.25;
      reasons.push("description");
    }
  }

  const sourceTitle = (source.title || "").toLowerCase().trim();
  const candidateTitle = (candidate.title || "").toLowerCase().trim();
  if (sourceTitle && candidateTitle && sourceTitle === candidateTitle) {
    score += 0.1;
  }

  return { score: Math.min(1, score), reasons };
}

function getNotInterestedEntries(): NotInterestedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOT_INTERESTED_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as NotInterestedEntry[];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function isMarkedNotInterested(sourceJobId: string, jobId: string): boolean {
  return getNotInterestedEntries().some(
    (entry) => entry.sourceJobId === Number(sourceJobId) && entry.jobId === Number(jobId),
  );
}

export function markNotInterested(sourceJobId: string, jobId: string): void {
  if (typeof window === "undefined") return;
  try {
    const entries = getNotInterestedEntries();
    entries.push({ jobId: Number(jobId), sourceJobId: Number(sourceJobId), at: Date.now() });
    localStorage.setItem(NOT_INTERESTED_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage failures.
  }
}

function readLocalDescription(hash: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(`job-desc:${hash}`) || "";
  } catch {
    return "";
  }
}

/**
 * Fetch candidate open jobs, preferring same-category jobs (via the on-chain
 * `get_jobs_by_category` helper) and falling back to a positional batch scan.
 */
async function collectCandidates(
  sourceJob: Job,
  sourceId: string,
  criteria: SimilarityCriteria,
): Promise<ScoredJob[]> {
  const candidates: ScoredJob[] = [];
  const seenHashes = new Set<string>([sourceJob.description_hash]);

  const sourceCategory = (sourceJob.category || "").toLowerCase().trim();

  if ((criteria === "all" || criteria === "category") && sourceCategory) {
    const onChain = ON_CHAIN_CATEGORY[sourceCategory];
    if (onChain) {
      try {
        const categoryIds = await getJobsByCategory(onChain);
        const limited = categoryIds
          .map((id) => String(id))
          .filter((id) => id !== sourceId)
          .slice(0, MAX_CANDIDATES);
        for (const jobId of limited) {
          try {
            const job = await getJob(jobId);
            if (job && job.status === "Open" && !seenHashes.has(job.description_hash)) {
              seenHashes.add(job.description_hash);
              candidates.push({ id: Number(jobId), job, score: 0, reasons: [] });
            }
          } catch {
            // Skip unavailable jobs.
          }
        }
      } catch {
        // Fall through to batch scan.
      }
    }
  }

  if (candidates.length < MAX_CANDIDATES) {
    try {
      const needed = MAX_CANDIDATES - candidates.length;
      const size = Math.min(MAX_BATCH, Math.max(needed, 40));
      const batch = await getJobsBatch("1", size);
      batch.forEach((job, index) => {
        if (candidates.length >= MAX_CANDIDATES) return;
        if (seenHashes.has(job.description_hash)) return;
        seenHashes.add(job.description_hash);
        if (job.status === "Open") {
          candidates.push({ id: index + 1, job, score: 0, reasons: [] });
        }
      });
    } catch {
      // Batch scan failed — use whatever category matches we found.
    }
  }

  return candidates;
}

export async function getSimilarJobs(
  sourceJob: Job,
  sourceId: string,
  criteria: SimilarityCriteria = "all",
  description?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SimilarJobsResult> {
  const cached = getSimilarJobsCache(sourceId, criteria);
  if (cached) return cached;

  const candidates = await collectCandidates(sourceJob, sourceId, criteria);
  const sourceDescription = description || readLocalDescription(sourceJob.description_hash);

  const scored: ScoredJob[] = [];
  for (const candidate of candidates) {
    if (String(candidate.id) === sourceId) continue;
    if (isMarkedNotInterested(sourceId, String(candidate.id))) continue;
    if (!candidate.job.title && !candidate.job.category) continue;

    const candidateDescription = readLocalDescription(candidate.job.description_hash);
    const { score, reasons } = scoreSimilarity(
      sourceJob,
      candidate.job,
      sourceDescription,
      candidateDescription,
    );

    if (criteria === "amount" && !reasons.includes("amount")) continue;
    if (criteria === "category" && !reasons.includes("category")) continue;
    if (criteria === "description" && !reasons.includes("description")) continue;
    if (score <= 0) continue;

    scored.push({ id: candidate.id, job: candidate.job, score, reasons });
  }

  scored.sort((a, b) => b.score - a.score || a.id - b.id);

  const results = scored.slice(0, limit);
  setSimilarJobsCache(sourceId, criteria, results);
  return { jobs: results, fromCache: false };
}

export const SIMILARITY_CRITERIA: { value: SimilarityCriteria; label: string }[] = [
  { value: "all", label: "All" },
  { value: "category", label: "Category" },
  { value: "amount", label: "Amount" },
  { value: "description", label: "Description" },
];
