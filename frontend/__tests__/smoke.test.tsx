import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

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

describe("Home page render states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows loading state while jobs are being fetched", async () => {
    let resolveCount: ((value: number) => void) | undefined;
    const countPromise = new Promise<number>((resolve) => {
      resolveCount = resolve;
    });
    mockGetJobCount.mockReturnValue(countPromise);

    render(<HomePage />);

    expect(screen.getByText("Loading jobs...")).toBeInTheDocument();

    resolveCount?.(0);
    await waitFor(() =>
      expect(
        screen.getByText("No open jobs found"),
      ).toBeInTheDocument(),
    );
  });

  it("shows empty state when no jobs exist", async () => {
    mockGetJobCount.mockResolvedValue(0);

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByText("No open jobs found")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("New jobs will appear here as clients post them."),
    ).toBeInTheDocument();
  });

  it("shows error state when contract read fails", async () => {
    mockGetJobCount.mockRejectedValue(new Error("boom"));

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("boom"),
    );
  });

  it("shows data state with fetched open jobs", async () => {
    mockGetJobCount.mockResolvedValue(2);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "25000000",
        description_hash: "hash-two",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: "GFREELANCER",
        amount: "10000000",
        description_hash: "hash-one",
        status: "InProgress",
        created_at: "1710000001",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      });

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { name: "Job #1" })).not.toBeInTheDocument();
    expect(screen.getByText("Accept Job")).toBeDisabled();
  });

  it("supports bookmarking jobs and favorites filter", async () => {
    mockGetJobCount.mockResolvedValue(2);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "25000000",
        description_hash: "hash-two",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
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
      });

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument(),
    );
    const bookmarkButtons = screen.getAllByRole("button", { name: "Bookmark" });
    fireEvent.click(bookmarkButtons[0]);
    fireEvent.click(screen.getByLabelText("Favorites only"));
    expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Job #1" })).not.toBeInTheDocument();
  });

  it("marks newly loaded jobs after refresh and clears after view", async () => {
    mockGetJobCount.mockResolvedValue(1);
    mockGetJob.mockResolvedValue({
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
    });

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument(),
    );
    expect(screen.queryByText("New")).not.toBeInTheDocument();

    mockGetJobCount.mockResolvedValue(2);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "25000000",
        description_hash: "hash-two",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
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
      });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() =>
      expect(screen.getByText("1 new job since last refresh")).toBeInTheDocument(),
    );
    expect(screen.getByText("New")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /Job #2/i }));

    await waitFor(() => expect(screen.queryByText("New")).not.toBeInTheDocument());
  });

  it("shows new job indicators with favorites filter applied", async () => {
    mockGetJobCount.mockResolvedValue(1);
    mockGetJob.mockResolvedValue({
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
    });

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument(),
    );

    mockGetJobCount.mockResolvedValue(2);
    mockGetJob
      .mockResolvedValueOnce({
        client: "GCLIENT",
        freelancer: null,
        amount: "25000000",
        description_hash: "hash-two",
        status: "Open",
        created_at: "1710000000",
        deadline: "0",
        token: "GTOKEN",
        revision_count: 0,
        submitted_at: "0",
      })
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
      });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByText("New")).toBeInTheDocument());

    const bookmarkButtons = screen.getAllByRole("button", { name: "Bookmark" });
    fireEvent.click(bookmarkButtons[0]);
    fireEvent.click(screen.getByLabelText("Favorites only"));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument(),
    );
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Job #1" })).not.toBeInTheDocument();
  });

  it("announces result counts without duplicate spam", async () => {
    mockGetJobCount.mockResolvedValue(1);
    mockGetJob.mockResolvedValue({
      client: "GCLIENT",
      freelancer: null,
      amount: "25000000",
      description_hash: "hash-two",
      status: "Open",
      created_at: "1710000000",
      deadline: "0",
      token: "GTOKEN",
      revision_count: 0,
      submitted_at: "0",
    });

    const { rerender } = render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByText("1 result shown")).toBeInTheDocument(),
    );
    rerender(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText("1 result shown")).toBeInTheDocument(),
    );
  });

  it("resets preferences and restores defaults", async () => {
    // Set up initial preferences
    localStorage.setItem("stellarwork:bookmarked-jobs", JSON.stringify([1, 2, 3]));
    sessionStorage.setItem("stellarwork:jobs-view-mode", "list");

    mockGetJobCount.mockResolvedValue(1);
    mockGetJob.mockResolvedValue({
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
    });

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Job #1" })).toBeInTheDocument(),
    );

    // Verify preferences were loaded
    expect(localStorage.getItem("stellarwork:bookmarked-jobs")).toBe("[1,2,3]");
    expect(sessionStorage.getItem("stellarwork:jobs-view-mode")).toBe("list");

    // Click reset button
    fireEvent.click(screen.getByRole("button", { name: "Reset Preferences" }));

    // Verify localStorage was cleared
    expect(localStorage.getItem("stellarwork:bookmarked-jobs")).toBeNull();
    // Verify sessionStorage was cleared
    expect(sessionStorage.getItem("stellarwork:jobs-view-mode")).toBeNull();
  });
});
