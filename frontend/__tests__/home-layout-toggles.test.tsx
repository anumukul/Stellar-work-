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

describe("Home page layout toggle buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
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
  });

  it("renders both Grid and List layout toggle buttons", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
    });
  });

  it("shows Grid button as selected by default", async () => {
    render(<HomePage />);

    await waitFor(() => {
      const gridButton = screen.getByRole("button", { name: "Grid" });
      expect(gridButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });
  });

  it("toggles layout selection on click", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
    });

    const listButton = screen.getByRole("button", { name: "List" });
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(listButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
      const gridButton = screen.getByRole("button", { name: "Grid" });
      expect(gridButton).not.toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });
  });

  it("enforces single-select rule - only one layout active at a time", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
    });

    // Click List button
    const listButton = screen.getByRole("button", { name: "List" });
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(listButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });

    // Click Grid button - should deselect List
    const gridButton = screen.getByRole("button", { name: "Grid" });
    fireEvent.click(gridButton);

    await waitFor(() => {
      expect(gridButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
      expect(listButton).not.toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });
  });

  it("changes job display layout when toggling between Grid and List", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    });

    // Initially in Grid mode - should have grid layout
    const jobsContainer = screen.getByRole("list", { name: "Open jobs" });
    expect(jobsContainer).toHaveClass("grid", "md:grid-cols-2");

    // Switch to List mode
    const listButton = screen.getByRole("button", { name: "List" });
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(jobsContainer).toHaveClass("flex", "flex-col");
      expect(jobsContainer).not.toHaveClass("grid", "md:grid-cols-2");
    });
  });

  it("persists layout preference to sessionStorage", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
    });

    // Switch to List mode
    const listButton = screen.getByRole("button", { name: "List" });
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(listButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });

    // Check sessionStorage
    expect(sessionStorage.getItem("stellarwork:jobs-view-mode")).toBe("list");
  });

  it("clears sessionStorage when switching back to Grid mode", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
    });

    // Switch to List mode
    const listButton = screen.getByRole("button", { name: "List" });
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(sessionStorage.getItem("stellarwork:jobs-view-mode")).toBe("list");
    });

    // Switch back to Grid mode
    const gridButton = screen.getByRole("button", { name: "Grid" });
    fireEvent.click(gridButton);

    await waitFor(() => {
      expect(gridButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });

    // sessionStorage should be cleared for Grid mode
    expect(sessionStorage.getItem("stellarwork:jobs-view-mode")).toBeNull();
  });

  it("loads layout preference from sessionStorage on mount", async () => {
    // Set initial preference in sessionStorage
    sessionStorage.setItem("stellarwork:jobs-view-mode", "list");

    render(<HomePage />);

    await waitFor(() => {
      const listButton = screen.getByRole("button", { name: "List" });
      expect(listButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });
  });

  it("maintains layout state across re-renders", async () => {
    const { rerender } = render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
    });

    // Switch to List mode
    const listButton = screen.getByRole("button", { name: "List" });
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(listButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });

    // Rerender to test state persistence
    rerender(<HomePage />);

    await waitFor(() => {
      expect(listButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });
  });

  it("applies compact styling to job cards in List mode", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument();
    });

    // Switch to List mode
    const listButton = screen.getByRole("button", { name: "List" });
    fireEvent.click(listButton);

    await waitFor(() => {
      const jobCards = screen.getAllByRole("article");
      jobCards.forEach((card: HTMLElement) => {
        expect(card).toHaveClass("sm:flex-row", "sm:items-start", "sm:justify-between");
      });
    });
  });

  it("resets layout preference when Reset Preferences is clicked", async () => {
    // Set initial preference
    sessionStorage.setItem("stellarwork:jobs-view-mode", "list");

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
    });

    // Verify List is selected
    const listButton = screen.getByRole("button", { name: "List" });
    expect(listButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");

    // Click Reset Preferences
    const resetButton = screen.getByRole("button", { name: "Reset Preferences" });
    fireEvent.click(resetButton);

    await waitFor(() => {
      const gridButton = screen.getByRole("button", { name: "Grid" });
      expect(gridButton).toHaveClass("border-slate-900", "bg-slate-900", "text-white");
      expect(listButton).not.toHaveClass("border-slate-900", "bg-slate-900", "text-white");
    });

    // Verify sessionStorage was cleared
    expect(sessionStorage.getItem("stellarwork:jobs-view-mode")).toBeNull();
  });

  it("syncs aria-pressed attribute with layout state", async () => {
    render(<HomePage />);

    await waitFor(() => {
      const gridButton = screen.getByRole("button", { name: "Grid" });
      expect(gridButton).toHaveAttribute("aria-pressed", "true");
    });

    const listButton = screen.getByRole("button", { name: "List" });
    expect(listButton).toHaveAttribute("aria-pressed", "false");

    // Switch to List mode
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(listButton).toHaveAttribute("aria-pressed", "true");
      const gridButton = screen.getByRole("button", { name: "Grid" });
      expect(gridButton).toHaveAttribute("aria-pressed", "false");
    });
  });
});
