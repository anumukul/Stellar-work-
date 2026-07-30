export type DisputeStatus =
  | "Active"
  | "Resolved"
  | "PendingEvidence"
  | "UnderReview"
  | "Closed";

export interface Dispute {
  id: string;
  jobId: string;
  jobTitle: string;
  client: string;
  freelancer: string;
  amount: number;
  raisedBy: "client" | "freelancer";
  raisedAt: string;
  status: DisputeStatus;
  reason: string;
  evidence?: string;
  resolution?: {
    resolvedAt: string;
    clientShare: number;
    freelancerShare: number;
    note: string;
  };
}

export interface EligibleJob {
  id: string;
  title: string;
  counterparty: string;
  amount: number;
}

export type DisputesPageData = {
  disputes: Dispute[];
  eligibleJobs: EligibleJob[];
};

export async function loadDisputesPageData(wallet: string): Promise<DisputesPageData> {
  const { getJobCount, getJobsBatch } = await import("@/lib/contract");
  const count = await getJobCount();

  const disputes: Dispute[] = [];
  const eligibleJobs: EligibleJob[] = [];
  const now = new Date().toISOString();

  const allJobs = count > 0 ? await getJobsBatch(1, count) : [];
  for (let id = 1; id <= allJobs.length; id++) {
    const job = allJobs[id - 1];
    if (!job) continue;

    if (job.client !== wallet && job.freelancer !== wallet) continue;

    if (job.status === "Disputed") {
      disputes.push({
        id: `D-${String(id).padStart(3, "0")}`,
        jobId: String(id),
        jobTitle: `Job #${id}`,
        client: job.client,
        freelancer: job.freelancer ?? "unknown",
        amount: Number(job.amount),
        raisedBy: job.client === wallet ? "client" : "freelancer",
        raisedAt: now,
        status: "Active",
        reason: "Dispute raised on-chain. See job details for more information.",
      });
    }

    if (job.status === "InProgress" || job.status === "SubmittedForReview") {
      eligibleJobs.push({
        id: String(id),
        title: `Job #${id}`,
        counterparty: job.client === wallet ? (job.freelancer ?? "unknown") : job.client,
        amount: Number(job.amount),
      });
    }
  }

  return { disputes, eligibleJobs };
}
