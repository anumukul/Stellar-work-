import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JobDetailPage from "@/app/job/[id]/page";
import { ToastProvider } from "@/components/ToastProvider";
import type { Job } from "@/lib/types";

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

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    client: "GCLIENT",
    freelancer: null,
    amount: "10000000",
    description_hash: "abc",
    status: "Open",
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

describe("Job detail accept button visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWallet.mockReturnValue({
      wallet: "GWALLET",
      connectWallet: vi.fn(),
    });
  });

  it("shows Accept Job for open jobs", async () => {
    mockGetJob.mockResolvedValue(makeJob({ status: "Open" }));
    renderJobPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Accept Job" })).toBeInTheDocument(),
    );
  });

  it("hides Accept Job for completed jobs", async () => {
    mockGetJob.mockResolvedValue(
      makeJob({
        status: "Completed",
        freelancer: "GFREELANCER",
      }),
    );
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Accept Job" })).not.toBeInTheDocument();
  });

  it("disables Accept Job when wallet is disconnected", async () => {
    mockUseWallet.mockReturnValue({
      wallet: null,
      connectWallet: vi.fn(),
    });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    renderJobPage();

    const acceptButton = await screen.findByRole("button", { name: "Accept Job" });
    expect(acceptButton).toBeDisabled();
    expect(acceptButton).toHaveAttribute("title", "Connect your wallet to accept this job.");
  });
});
