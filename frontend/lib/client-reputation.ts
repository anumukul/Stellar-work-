import { getJob, getJobCount } from "./contract";

export interface ClientStats {
  jobsPosted: number;
  jobsCompleted: number;
  jobsCancelled: number;
  score: number | null;
}

const cache: Record<string, { stats: ClientStats; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000;

export async function getClientStats(clientAddress: string): Promise<ClientStats> {
  const now = Date.now();
  if (cache[clientAddress] && now - cache[clientAddress].timestamp < CACHE_TTL) {
    return cache[clientAddress].stats;
  }

  const count = await getJobCount();
  let jobsPosted = 0;
  let jobsCompleted = 0;
  let jobsCancelled = 0;

  for (let id = 1; id <= count; id++) {
    const job = await getJob(String(id));
    if (!job) continue;
    if (job.client === clientAddress) {
      jobsPosted++;
      if (job.status === "Completed") {
        jobsCompleted++;
      } else if (job.status === "Cancelled") {
        jobsCancelled++;
      }
    }
  }

  let score: number | null = null;
  if (jobsPosted >= 3) {
    const completionRate = jobsCompleted / jobsPosted;
    score = Math.round(completionRate * 50) / 10;
  }

  const stats = { jobsPosted, jobsCompleted, jobsCancelled, score };
  cache[clientAddress] = { stats, timestamp: now };
  return stats;
}
