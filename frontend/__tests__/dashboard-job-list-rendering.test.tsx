import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";

const mockGetJob = vi.fn();
const mockGetJobCount = vi.fn();
const mockGetCompletedJobsCount = vi.fn();
const mockApproveWork = vi.fn();
const mockCancelJob = vi.fn();
const mockSubmitWork = vi.fn();
const mockEnforceDeadline = vi.fn();

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getCompletedJobsCount: (...args: unknown[]) => mockGetCompletedJobsCount(...args),
  approveWork: (...args: unknown[]) => mockApproveWork(...args),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
  submitWork: (...args: unknown[]) => mockSubmitWork(...args),
  enforceDeadline: (...args: unknown[]) => mockEnforceDeadline(...args),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({
    wallet: "GTESTWALLET",
    connectWallet: vi.fn(),
  }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
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

describe("Dashboard job list rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCompletedJobsCount.mockResolvedValue(0);
  });

  it("renders Open and InProgress jobs with their titles and amounts", async () => {
    mockGetJobCount.mockResolvedValue(2);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GTESTWALLET",
        freelancer: null,
        // 10,000,000 stroops = 1 XLM
        amount: "10000000",
        description_hash: "hash1",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GTESTWALLET",
        freelancer: "GFREELANCER",
        // 25,000,000 stroops = 2.50 XLM
        amount: "25000000",
        description_hash: "hash2",
        status: "InProgress",
        created_at: "1710000001",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    });

    // Status pills for both job states render. Each label also appears in the
    // filter toolbar (button), so we expect at least two matches per status:
    // the filter chip plus the pill rendered on the job card.
    expect(screen.getAllByText("Open").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("In Progress").length).toBeGreaterThanOrEqual(2);

    // Amounts render formatted to 2dp (locale-dependent decimal separator).
    const decimalSeparator =
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
        .formatToParts(1.1)
        .find((part) => part.type === "decimal")?.value ?? ".";

    expect(
      screen.getByText(`1${decimalSeparator}00`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`2${decimalSeparator}50`),
    ).toBeInTheDocument();
  });

  it("renders the empty state when the wallet has no jobs", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<DashboardPage />);

    // Both sections show the "No jobs yet" empty state — once for posted, once
    // for accepted.
    await waitFor(() => {
      const emptyTitles = screen.getAllByText("No jobs yet");
      expect(emptyTitles.length).toBe(2);
    });
    expect(
      screen.getAllByText("No jobs match this filter yet.").length,
    ).toBe(2);
  });

  it("renders skeleton placeholders while jobs are loading", async () => {
    // Hold the count promise open so the loading state is observable.
    let resolveCount: (n: number) => void = () => { void 0; };
    mockGetJobCount.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveCount = resolve;
      }),
    );

    render(<DashboardPage />);

    // The skeleton container exposes an aria-label distinguishing it from
    // the loaded grid.
    await waitFor(() => {
      expect(screen.getByLabelText("Loading jobs")).toBeInTheDocument();
    });

    // Cleanly resolve so React state can flush and the test exits.
    resolveCount(0);
    await waitFor(() => {
      expect(screen.queryByLabelText("Loading jobs")).not.toBeInTheDocument();
    });
  });

  it("renders the error banner without crashing when fetching jobs fails", async () => {
    mockGetJobCount.mockRejectedValueOnce(new Error("RPC unreachable"));

    render(<DashboardPage />);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("RPC unreachable");
    });

    // The page header still renders — the error path is recoverable, not
    // a crash.
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });
});
