import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
    toString: vi.fn().mockReturnValue(""),
  }),
}));

const mockGetJobCount = vi.fn();
const mockGetJob = vi.fn();

vi.mock("@/lib/contract", () => ({
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: vi.fn(),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn(),
  fetchFromIpfs: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({
    wallet: null,
    connectWallet: vi.fn(),
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

describe("Home page job listing after getJobCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders the expected number of job cards when jobs are fetched", async () => {
    mockGetJobCount.mockResolvedValue(3);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "10000000",
        description_hash: "hash-one",
        status: "Open",
        created_at: "1710000002",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "20000000",
        description_hash: "hash-two",
        status: "Open",
        created_at: "1710000001",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "30000000",
        description_hash: "hash-three",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /^Job #/ })).toHaveLength(3);
  });

  it("only shows Open status jobs and filters out non-Open statuses", async () => {
    mockGetJobCount.mockResolvedValue(3);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "10000000",
        description_hash: "hash-one",
        status: "Completed",
        created_at: "1710000002",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: "GFREELANCER",
        amount: "20000000",
        description_hash: "hash-two",
        status: "InProgress",
        created_at: "1710000001",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "30000000",
        description_hash: "hash-three",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Job #2" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Job #1" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /^Job #/ })).toHaveLength(1);
  });

  it("debounces keyword filtering by description and clears the search", async () => {
    mockGetJobCount.mockResolvedValue(3);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "10000000",
        description_hash: "hash-one",
        status: "Open",
        created_at: "1710000002",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "20000000",
        description_hash: "hash-two",
        status: "Open",
        created_at: "1710000001",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "30000000",
        description_hash: "hash-three",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    localStorage.setItem("job-desc:hash-one", "backend api onboarding");
    localStorage.setItem("job-desc:hash-two", "frontend dashboard optimization");
    localStorage.setItem("job-desc:hash-three", "content writing and editing");

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/search jobs/i);
    fireEvent.change(searchInput, { target: { value: "backend" } });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Job #2" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Job #3" })).not.toBeInTheDocument();
    }, { timeout: 1500 });

    fireEvent.change(searchInput, { target: { value: "missing-keyword" } });

    await waitFor(() => {
      expect(screen.getByText("No jobs match your search")).toBeInTheDocument();
    }, { timeout: 1500 });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });
  });

  it("shows empty state when getJobCount returns zero", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText("No open jobs found")).toBeInTheDocument();
    });

    expect(mockGetJob).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /^Job #/ })).not.toBeInTheDocument();
  });

  it("shows loading state while job count is being fetched", async () => {
    let resolveCount: ((value: number) => void) | undefined;
    const countPromise = new Promise<number>((resolve) => {
      resolveCount = resolve;
    });
    mockGetJobCount.mockReturnValue(countPromise);

    render(<HomePage />);

    expect(screen.getByText("Loading jobs...")).toBeInTheDocument();

    resolveCount?.(3);
    await waitFor(() => {
      expect(screen.queryByText("Loading jobs...")).not.toBeInTheDocument();
    });
  });

  it("calls getJob for each job after getJobCount resolves", async () => {
    mockGetJobCount.mockResolvedValue(2);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "10000000",
        description_hash: "hash-one",
        status: "Open",
        created_at: "1710000001",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "20000000",
        description_hash: "hash-two",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    });

    expect(mockGetJobCount).toHaveBeenCalledTimes(1);
    expect(mockGetJob).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("heading", { name: /^Job #/ })).toHaveLength(2);
  });

  it("handles partial fetch failures gracefully", async () => {
    mockGetJobCount.mockResolvedValue(3);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "10000000",
        description_hash: "hash-one",
        status: "Open",
        created_at: "1710000002",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "30000000",
        description_hash: "hash-three",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Job #2" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /^Job #/ })).toHaveLength(2);
  });
});
