import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClientAnalyticsPage from "@/app/dashboard/analytics/page";

const mockGetJob = vi.fn();
const mockGetJobCount = vi.fn();
const mockGetCompletedJobsCount = vi.fn();

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getCompletedJobsCount: (...args: unknown[]) => mockGetCompletedJobsCount(...args),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({
    wallet: "GCLIENTWALLET",
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
    preferences: {},
    setPreference: vi.fn(),
    clearNotifications: vi.fn(),
  }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getEventLabel: (event: string) => event,
}));

function selectAllTime() {
  fireEvent.click(screen.getByText("All time"));
}

describe("Client Analytics Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCompletedJobsCount.mockResolvedValue(5);
  });

  it("renders the analytics heading and date range filter", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Client Analytics" })).toBeInTheDocument();
    });

    expect(screen.getByText("7 days")).toBeInTheDocument();
    expect(screen.getByText("30 days")).toBeInTheDocument();
    expect(screen.getByText("90 days")).toBeInTheDocument();
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("shows empty state when no jobs exist", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("No jobs in this period")).toBeInTheDocument();
    });
  });

  it("renders overall metrics when jobs are present", async () => {
    mockGetJobCount.mockResolvedValue(2);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENTWALLET",
        freelancer: "GFREELANCER1",
        amount: "10000000",
        description_hash: "hash1",
        status: "Completed",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENTWALLET",
        freelancer: null,
        amount: "20000000",
        description_hash: "hash2",
        status: "Open",
        created_at: "1710100000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Client Analytics" })).toBeInTheDocument();
    });

    selectAllTime();

    await waitFor(() => {
      expect(screen.getByText("Overall Metrics")).toBeInTheDocument();
    });

    expect(screen.getByText("Jobs Posted")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Total Spend (XLM)")).toBeInTheDocument();
  });

  it("renders job performance table with job data", async () => {
    mockGetJobCount.mockResolvedValue(1);
    mockGetJob.mockResolvedValueOnce({
      client: "GCLIENTWALLET",
      freelancer: "GFREELANCER1",
      amount: "15000000",
      description_hash: "hash1",
      status: "InProgress",
      created_at: "1710000000",
      deadline: "0",
      token: "GTOKEN",
      revision_count: 0,
      submitted_at: "0",
    });

    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Client Analytics" })).toBeInTheDocument();
    });

    selectAllTime();

    await waitFor(() => {
      expect(screen.getByText("Job Performance")).toBeInTheDocument();
    });

    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("switches date range when clicking filter buttons", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText("No jobs in this period")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("All time"));

    expect(screen.getByText("All time").closest("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows export CSV button when jobs exist", async () => {
    mockGetJobCount.mockResolvedValue(1);
    mockGetJob.mockResolvedValueOnce({
      client: "GCLIENTWALLET",
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

    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Client Analytics" })).toBeInTheDocument();
    });

    selectAllTime();

    await waitFor(() => {
      expect(screen.getByText("Export CSV")).toBeInTheDocument();
    });
  });

  it("shows error banner when fetch fails", async () => {
    mockGetJobCount.mockRejectedValueOnce(new Error("RPC error"));

    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("RPC error");
    });
  });

  it("renders insights section when jobs have data", async () => {
    mockGetJobCount.mockResolvedValue(3);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENTWALLET",
        freelancer: "GF1",
        amount: "5000000",
        description_hash: "hash1",
        status: "Completed",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENTWALLET",
        freelancer: "GF2",
        amount: "5000000",
        description_hash: "hash2",
        status: "Completed",
        created_at: "1710100000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENTWALLET",
        freelancer: "GF3",
        amount: "5000000",
        description_hash: "hash3",
        status: "Completed",
        created_at: "1710200000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Client Analytics" })).toBeInTheDocument();
    });

    selectAllTime();

    await waitFor(() => {
      expect(screen.getByText("Insights")).toBeInTheDocument();
    });
  });
});
