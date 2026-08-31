import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "@/app/job/[id]/page";
import { ToastProvider } from "@/components/ToastProvider";
import type { Job } from "@/lib/types";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetJob = vi.fn();
const mockUseWallet = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
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
  getJobViews: vi.fn().mockResolvedValue(0),
  recordJobView: vi.fn().mockResolvedValue(undefined),
  rateJob: vi.fn(),
  topUpEscrow: vi.fn(),
}));

vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn(),
  fetchFromIpfs: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => mockUseWallet(),
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    client: "GCLIENT",
    freelancer: "GFREELANCER",
    amount: "10000000",
    description_hash: "abc",
    status: "SubmittedForReview",
    created_at: "1710000000",
    deadline: "0",
    token: "GTOKEN",
    revision_count: 0,
    submitted_at: "0",
    ...overrides,
  };
}

function renderJobPage() {
  return render(
    <ToastProvider>
      <JobDetailPage />
    </ToastProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Approve Work button visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: connected wallet is the client on a SubmittedForReview job
    mockUseWallet.mockReturnValue({
      wallet: "GCLIENT",
      connectWallet: vi.fn(),
    });
  });

  // ── Eligible state ────────────────────────────────────────────────────────

  it("shows Approve Work for the client when work is pending approval", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "SubmittedForReview", client: "GCLIENT" }),
    );
    renderJobPage();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Approve Work" }),
      ).toBeInTheDocument(),
    );
  });

  // ── Ineligible statuses ───────────────────────────────────────────────────

  it("hides Approve Work when the job is Open", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "Open", freelancer: null }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Approve Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Approve Work when the job is InProgress", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "InProgress", client: "GCLIENT" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Approve Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Approve Work when the job is Completed", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "Completed", client: "GCLIENT" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Approve Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Approve Work when the job is Cancelled", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "Cancelled", client: "GCLIENT" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Approve Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Approve Work when the job is Disputed", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "Disputed", client: "GCLIENT" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Approve Work" }),
    ).not.toBeInTheDocument();
  });

  // ── Role-based exclusions on SubmittedForReview jobs ─────────────────────

  it("hides Approve Work for the freelancer on a SubmittedForReview job", async () => {
    mockUseWallet.mockReturnValue({ wallet: "GFREELANCER", connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(
      makeJob({ status: "SubmittedForReview", client: "GCLIENT", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Approve Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Approve Work for a third-party wallet on a SubmittedForReview job", async () => {
    mockUseWallet.mockReturnValue({ wallet: "GTHIRDPARTY", connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(
      makeJob({ status: "SubmittedForReview", client: "GCLIENT", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Approve Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Approve Work when no wallet is connected", async () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(
      makeJob({ status: "SubmittedForReview", client: "GCLIENT" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Approve Work" }),
    ).not.toBeInTheDocument();
  });
});
