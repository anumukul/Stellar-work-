export type JobStatus =
  | "Open"
  | "InProgress"
  | "SubmittedForReview"
  | "Completed"
  | "Cancelled"
  | "Disputed";

/** Aggregated job counts returned by the `get_job_status_counts` contract query. */
export interface JobStatusCounts {
  open: number;
  in_progress: number;
  submitted_for_review: number;
  completed: number;
  cancelled: number;
  disputed: number;
  total: number;
}

/** Maps each JobStatus to its corresponding snake_case key in JobStatusCounts. */
export const STATUS_TO_COUNTS_KEY: Record<JobStatus, keyof JobStatusCounts> = {
  Open: "open",
  InProgress: "in_progress",
  SubmittedForReview: "submitted_for_review",
  Completed: "completed",
  Cancelled: "cancelled",
  Disputed: "disputed",
} as const;

export interface Job {
  /** Schema version for contract upgrades. Initialized to 1. */
  version?: number;
  client: string;
  freelancer: string | null;
  amount: string;
  description_hash: string;
  status: JobStatus;
  created_at: string;
  deadline: string;
  token: string;
  revision_count: number;
  submitted_at: string;
  title?: string;
  category?: string;
}

/** A single milestone within a milestone-based job. */
export interface Milestone {
  id: number;
  description_hash: string;
  amount: string; // stroops as string
  is_released: boolean;
}

export type NotificationEvent =
  | "job_accepted"
  | "work_submitted"
  | "work_approved"
  | "job_cancelled"
  | "dispute_raised"
  | "dispute_resolved";

export interface Notification {
  id: string;
  event: NotificationEvent;
  jobId: number;
  message: string;
  timestamp: number;
  seen: boolean;
}

export type NotificationPreferences = Record<NotificationEvent, boolean>;
