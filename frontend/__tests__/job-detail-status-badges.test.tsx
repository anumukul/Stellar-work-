import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "@/app/job/[id]/page";
import { ToastProvider } from "@/components/ToastProvider";
import type { Job, JobStatus } from "@/lib/types";

const mockGetJob = vi.fn();
const mockUseWallet = vi.fn();
let mockRouteId = "1";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: mockRouteId }),
}));

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: vi.fn(),
  submitWork: vi.fn(),
  approveWork: vi.fn(),
  cancelJob: vi.fn(),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn(),
  fetchFromIpfs: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => mockUseWallet(),
}));

// Mock stellar lib to avoid side effects
vi.mock("@/lib/stellar", () => ({
  getExplorerTxUrl: (hash: string) => `https://stellar.expert/tx/${hash}`,
  getNetwork: () => "testnet",
}));

vi.mock("@/lib/notifications-context", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    addNotification: vi.fn(),
    markAsSeen: vi.fn(),
    markAllAsSeen: vi.fn(),
    preferences: { job_accepted: true, work_submitted: true, work_approved: true, job_cancelled: true, dispute_raised: true, dispute_resolved: true },
    setPreference: vi.fn(),
    clearNotifications: vi.fn(),
  }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getEventLabel: (event: string) => event,
}));

vi.mock("@/lib/meetings-context", () => ({
  useMeetings: () => ({
    meetings: [],
    proposeMeeting: vi.fn(),
    cancelMeeting: vi.fn(),
    confirmMeeting: vi.fn(),
    getMeetingsForJob: () => [],
    getUpcomingMeetings: () => [],
    getPastMeetings: () => [],
  }),
  MeetingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeJob(status: JobStatus): Job {
  return {
    client: "GCLIENT",
    freelancer: status === "Open" ? null : "GFREELANCER",
    amount: "10000000",
    description_hash: "abc",
    status,
    created_at: "1710000000",
    deadline: "1720000000",
    token: "GTOKEN",
    revision_count: 0,
    submitted_at: "0",
  };
}

describe("JobDetailPage status badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteId = "1";
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
  });

  const statuses: JobStatus[] = [
    "Open",
    "InProgress",
    "SubmittedForReview",
    "Completed",
    "Cancelled",
    "Disputed",
  ];

  const statusLabels: Record<JobStatus, string> = {
    Open: "Open",
    InProgress: "In Progress",
    SubmittedForReview: "Submitted for Review",
    Completed: "Completed",
    Cancelled: "Cancelled",
    Disputed: "Disputed",
  };

  it.each(statuses)("renders the correct badge for status: %s", async (status) => {
    mockGetJob.mockResolvedValue(makeJob(status));
    
    render(
      <ToastProvider>
        <JobDetailPage />
      </ToastProvider>
    );

    // Wait for the job to load and the status to be displayed
    await waitFor(() => {
      expect(screen.getByText(statusLabels[status])).toBeInTheDocument();
    });

    const badge = screen.getByText(statusLabels[status]);
    expect(badge).toHaveClass("rounded-full");
    expect(badge).toHaveClass("px-2.5");
  });

  it("handles loading state", async () => {
    // Return a promise that doesn't resolve immediately
    let resolvePromise: (value: Job) => void;
    const promise = new Promise<Job>((resolve) => {
      resolvePromise = resolve;
    });
    mockGetJob.mockReturnValue(promise);

    render(
      <ToastProvider>
        <JobDetailPage />
      </ToastProvider>
    );

    expect(screen.getByText(/Loading job details/i)).toBeInTheDocument();

    // Now resolve it
    await waitFor(() => {
      resolvePromise!(makeJob("Open"));
    });

    await waitFor(() => {
      expect(screen.queryByText(/Loading job details/i)).not.toBeInTheDocument();
      expect(screen.getByText("Open")).toBeInTheDocument();
    });
  });
});
