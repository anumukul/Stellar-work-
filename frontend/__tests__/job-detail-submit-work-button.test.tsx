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
    status: "InProgress",
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

describe("Submit Work button visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: connected wallet is the freelancer on an InProgress job
    mockUseWallet.mockReturnValue({
      wallet: "GFREELANCER",
      connectWallet: vi.fn(),
    });
  });

  // ── Eligible state ────────────────────────────────────────────────────────

  it("shows Submit Work for the freelancer on an InProgress job", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "InProgress", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Submit Work" }),
      ).toBeInTheDocument(),
    );
  });

  // ── Ineligible statuses ───────────────────────────────────────────────────

  it("hides Submit Work when the job is Open (no freelancer assigned yet)", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "Open", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Submit Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Submit Work when the job is SubmittedForReview", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "SubmittedForReview", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Submit Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Submit Work when the job is Completed", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "Completed", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Submit Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Submit Work when the job is Cancelled", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "Cancelled", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Submit Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Submit Work when the job is Disputed", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({ status: "Disputed", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Submit Work" }),
    ).not.toBeInTheDocument();
  });

  // ── Role-based exclusions on InProgress jobs ─────────────────────────────

  it("hides Submit Work for the client on an InProgress job", async () => {
    mockUseWallet.mockReturnValue({ wallet: "GCLIENT", connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(
      makeJob({ status: "InProgress", client: "GCLIENT", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    // Approve Work is not available (SubmittedForReview only); Submit Work must not appear either
    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Submit Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Submit Work for a third-party wallet on an InProgress job", async () => {
    mockUseWallet.mockReturnValue({ wallet: "GTHIRDPARTY", connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(
      makeJob({ status: "InProgress", client: "GCLIENT", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Submit Work" }),
    ).not.toBeInTheDocument();
  });

  it("hides Submit Work when no wallet is connected", async () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(
      makeJob({ status: "InProgress", freelancer: "GFREELANCER" }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByRole("button", { name: "Submit Work" }),
    ).not.toBeInTheDocument();
  });
});
