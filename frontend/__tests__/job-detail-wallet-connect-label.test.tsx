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

describe("Job detail wallet connect CTA copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Disconnected state: hint text ─────────────────────────────────────────

  it("shows the wallet connect hint when no wallet is connected", async () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open" }));
    renderJobPage();

    await waitFor(() =>
      expect(
        screen.getByText("Connect your wallet to enable contract actions."),
      ).toBeInTheDocument(),
    );
  });

  it("hint text is visible inside the job detail article", async () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open" }));
    renderJobPage();

    const hint = await screen.findByText(
      "Connect your wallet to enable contract actions.",
    );
    // The hint lives inside the article element that holds job metadata
    expect(hint.closest("article")).not.toBeNull();
  });

  it("Accept Job button carries the connect-wallet tooltip when disconnected", async () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open" }));
    renderJobPage();

    const acceptBtn = await screen.findByRole("button", { name: "Accept Job" });
    expect(acceptBtn).toHaveAttribute(
      "title",
      "Connect your wallet to accept this job.",
    );
  });

  it("Accept Job button is disabled when no wallet is connected", async () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open" }));
    renderJobPage();

    const acceptBtn = await screen.findByRole("button", { name: "Accept Job" });
    expect(acceptBtn).toBeDisabled();
  });

  // ── Connected state: hint text absent ─────────────────────────────────────

  it("hides the wallet connect hint when a wallet is connected", async () => {
    mockUseWallet.mockReturnValue({ wallet: "GCLIENT", connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    renderJobPage();

    await waitFor(() => expect(screen.getByText("Job #1")).toBeInTheDocument());
    expect(
      screen.queryByText("Connect your wallet to enable contract actions."),
    ).not.toBeInTheDocument();
  });

  it("Accept Job button has no connect-wallet tooltip when wallet is connected", async () => {
    mockUseWallet.mockReturnValue({ wallet: "GCLIENT", connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    renderJobPage();

    const acceptBtn = await screen.findByRole("button", { name: "Accept Job" });
    expect(acceptBtn).not.toHaveAttribute(
      "title",
      "Connect your wallet to accept this job.",
    );
  });

  it("Accept Job button is enabled when a wallet is connected", async () => {
    mockUseWallet.mockReturnValue({ wallet: "GCLIENT", connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(makeJob({ status: "Open", client: "GCLIENT" }));
    renderJobPage();

    const acceptBtn = await screen.findByRole("button", { name: "Accept Job" });
    expect(acceptBtn).not.toBeDisabled();
  });

  // ── Hint text absent when job is not yet loaded ───────────────────────────

  it("does not show the hint while the job is still loading", () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    // Never-resolving promise keeps the component in the fetching state
    mockGetJob.mockReturnValue(new Promise(() => { void 0; }));
    renderJobPage();

    expect(
      screen.queryByText("Connect your wallet to enable contract actions."),
    ).not.toBeInTheDocument();
  });

  // ── Hint text absent when job is not found ────────────────────────────────

  it("does not show the hint when the job is not found", async () => {
    mockUseWallet.mockReturnValue({ wallet: null, connectWallet: vi.fn() });
    mockGetJob.mockResolvedValue(null);
    renderJobPage();

    await waitFor(() =>
      expect(screen.getByText("Job not found.")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Connect your wallet to enable contract actions."),
    ).not.toBeInTheDocument();
  });
});
