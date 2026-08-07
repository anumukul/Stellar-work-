import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";

const mockGetJob = vi.fn();
const mockGetJobCount = vi.fn();
const mockGetCompletedJobsCount = vi.fn();
const mockApproveWork = vi.fn();
const mockCancelJob = vi.fn();
const mockSubmitWork = vi.fn();
const mockEnforceDeadline = vi.fn();
const mockFreelancerCancelJob = vi.fn();

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getCompletedJobsCount: (...args: unknown[]) => mockGetCompletedJobsCount(...args),
  approveWork: (...args: unknown[]) => mockApproveWork(...args),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
  submitWork: (...args: unknown[]) => mockSubmitWork(...args),
  enforceDeadline: (...args: unknown[]) => mockEnforceDeadline(...args),
  freelancerCancelJob: (...args: unknown[]) => mockFreelancerCancelJob(...args),
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

describe("Dashboard filter chip toggling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJobCount.mockResolvedValue(3);
    mockGetCompletedJobsCount.mockResolvedValue(1);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GTESTWALLET",
        freelancer: null,
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
        amount: "20000000",
        description_hash: "hash2",
        status: "InProgress",
        created_at: "1710000001",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: "GTESTWALLET",
        amount: "30000000",
        description_hash: "hash3",
        status: "Completed",
        created_at: "1710000002",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });
  });

  it("renders all filter chips", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All statuses filter, selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Open filter, not selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /In Progress filter, not selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Submitted for Review filter, not selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Completed filter, not selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Cancelled filter, not selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Disputed filter, not selected/i })).toBeInTheDocument();
    });
  });

  it("toggles filter chip selection on click", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All statuses filter, selected/i })).toBeInTheDocument();
    });

    const openFilter = screen.getByRole("button", { name: /Open filter, not selected/i });
    fireEvent.click(openFilter);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Open filter, selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /All statuses filter, not selected/i })).toBeInTheDocument();
    });
  });

  it("enforces single-select rule - only one filter active at a time", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All statuses filter, selected/i })).toBeInTheDocument();
    });

    // Click Open filter
    const openFilter = screen.getByRole("button", { name: /Open filter, not selected/i });
    fireEvent.click(openFilter);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Open filter, selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /All statuses filter, not selected/i })).toBeInTheDocument();
    });

    // Click In Progress filter - should deselect Open
    const inProgressFilter = screen.getByRole("button", { name: /In Progress filter, not selected/i });
    fireEvent.click(inProgressFilter);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /In Progress filter, selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Open filter, not selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /All statuses filter, not selected/i })).toBeInTheDocument();
    });
  });

  it("filters jobs based on selected status", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Posted Jobs")).toBeInTheDocument();
    });

    // Initially shows all jobs (All filter selected)
    expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();

    // Click Open filter
    const openFilter = screen.getByRole("button", { name: /Open filter, not selected/i });
    fireEvent.click(openFilter);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument();
    });

    // Job #2 (InProgress) should not be visible
    expect(screen.queryByRole("heading", { name: "Job #2" })).not.toBeInTheDocument();
  });

  it("returns to All filter when clicking All button", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All statuses filter, selected/i })).toBeInTheDocument();
    });

    // Select Open filter
    const openFilter = screen.getByRole("button", { name: /Open filter, not selected/i });
    fireEvent.click(openFilter);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Open filter, selected/i })).toBeInTheDocument();
    });

    // Click All filter to reset
    const allFilter = screen.getByRole("button", { name: /All statuses filter, not selected/i });
    fireEvent.click(allFilter);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All statuses filter, selected/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Open filter, not selected/i })).toBeInTheDocument();
    });
  });

  it("maintains filter state across re-renders", async () => {
    const { rerender } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All statuses filter, selected/i })).toBeInTheDocument();
    });

    // Select Completed filter
    const completedFilter = screen.getByRole("button", { name: /Completed filter, not selected/i });
    fireEvent.click(completedFilter);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Completed filter, selected/i })).toBeInTheDocument();
    });

    // Rerender to test state persistence
    rerender(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Completed filter, selected/i })).toBeInTheDocument();
    });
  });

  it("shows NoResultsState when filter has no matches", async () => {
    mockGetJob.mockResolvedValueOnce({
      client: "GTESTWALLET",
      freelancer: null,
      amount: "10000000",
      description_hash: "hash1",
      status: "Open",
      created_at: "1710000000",
      deadline: "0",
      token: "GTOKEN",
      revision_count: 0,
      submitted_at: "0",
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument();
    });

    // Click Cancelled filter (no cancelled jobs)
    const cancelledFilter = screen.getByRole("button", { name: /Cancelled filter, not selected/i });
    fireEvent.click(cancelledFilter);

    await waitFor(() => {
      expect(screen.getAllByText("No jobs match this filter")).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: "Clear filter" })).toHaveLength(2);
      expect(screen.getAllByText("No jobs match this filter").length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: "Clear filter" }).length).toBeGreaterThan(0);
    });
  });

  it("clears filter when clicking Clear filter action", async () => {
    mockGetJob.mockResolvedValueOnce({
      client: "GTESTWALLET",
      freelancer: null,
      amount: "10000000",
      description_hash: "hash1",
      status: "Open",
      created_at: "1710000000",
      deadline: "0",
      token: "GTOKEN",
      revision_count: 0,
      submitted_at: "0",
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument();
    });

    // Click Cancelled filter
    const cancelledFilter = screen.getByRole("button", { name: /Cancelled filter, not selected/i });
    fireEvent.click(cancelledFilter);

    await waitFor(() => {
      expect(screen.getAllByText("No jobs match this filter").length).toBeGreaterThan(0);
    });

    // Click Clear filter
    const clearFilterButton = screen.getAllByRole("button", { name: "Clear filter" })[0];
    fireEvent.click(clearFilterButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All statuses filter, selected/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument();
    });
  });
});
