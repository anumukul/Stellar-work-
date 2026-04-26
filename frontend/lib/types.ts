export type JobStatus =
  | "Open"
  | "InProgress"
  | "SubmittedForReview"
  | "Completed"
  | "Cancelled"
  | "Disputed";

export interface Job {
  client: string;
  freelancer: string | null;
  amount: string;
  description_hash: string;
  status: JobStatus;
  created_at: string;
  deadline: string;
  token: string;
}
