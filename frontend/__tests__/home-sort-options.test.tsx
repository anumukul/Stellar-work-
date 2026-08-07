import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

const mockGetJobCount = vi.fn();
const mockGetJob = vi.fn();
const mockReplace = vi.fn();
const mockSearchParamsGet = vi.fn().mockReturnValue(null);

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsGet(key),
    toString: () => "",
  }),
}));

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

const JOB_FIXTURES = [
  {
    id: 1,
    job: {
      client: "GCLIENT",
      freelancer: null,
      amount: "10000000",
      description_hash: "hash-one",
      status: "Open",
      created_at: "1710000000",
      deadline: "0",
      token: "GTOKEN",
      revision_count: 0,
      submitted_at: "0",
    },
  },
  {
    id: 2,
    job: {
      client: "GCLIENT",
      freelancer: null,
      amount: "30000000",
      description_hash: "hash-two",
      status: "Open",
      created_at: "1710000001",
      deadline: "1720000000",
      token: "GTOKEN",
      revision_count: 0,
      submitted_at: "0",
    },
  },
  {
    id: 3,
    job: {
      client: "GCLIENT",
      freelancer: null,
      amount: "20000000",
      description_hash: "hash-three",
      status: "Open",
      created_at: "1710000002",
      deadline: "1715000000",
      token: "GTOKEN",
      revision_count: 0,
      submitted_at: "0",
    },
  },
];

describe("Home page sort options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockSearchParamsGet.mockReturnValue(null);
    mockGetJobCount.mockResolvedValue(3);
    mockGetJob.mockImplementation(async (id: string) => {
      const found = JOB_FIXTURES.find(({ id: jobId }) => String(jobId) === id);
      return found ? found.job : null;
    });
  });

  const renderHome = async () => {
    render(<HomePage />);
    return screen.findByRole("combobox", { name: /sort:/i });
  };

  const jobOrder = () =>
    screen.getAllByRole("heading", { name: /^Job #/ }).map((el) => el.textContent ?? "");

  it("renders all sort options including deadline ascending", async () => {
    const sortSelect = await renderHome();
    const options = Array.from(sortSelect.querySelectorAll("option")).map((option) => option.textContent);
    expect(options).toEqual([
      "Newest first",
      "Oldest first",
      "Highest amount",
      "Deadline ascending",
    ]);
  });

  it("defaults to newest first", async () => {
    await renderHome();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });
    expect(jobOrder()).toEqual(["Job #3", "Job #2", "Job #1"]);
  });

  it("re-renders the list sorted by highest amount when selected", async () => {
    const sortSelect = await renderHome();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });

    fireEvent.change(sortSelect, { target: { value: "highest_amount" } });

    await waitFor(() => {
      expect(jobOrder()).toEqual(["Job #2", "Job #3", "Job #1"]);
    });
  });

  it("re-renders the list sorted by deadline ascending with no-deadline jobs last", async () => {
    const sortSelect = await renderHome();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });

    fireEvent.change(sortSelect, { target: { value: "deadline_asc" } });

    await waitFor(() => {
      expect(jobOrder()).toEqual(["Job #3", "Job #2", "Job #1"]);
    });
  });

  it("persists the sort selection to the URL query string", async () => {
    const sortSelect = await renderHome();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Job #3" })).toBeInTheDocument();
    });

    fireEvent.change(sortSelect, { target: { value: "deadline_asc" } });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("sort=deadline_asc"),
        expect.anything(),
      );
    });
  });

  it("restores the sort selection from the URL query string", async () => {
    window.history.replaceState({}, "", "/?sort=deadline_asc");

    await renderHome();

    await waitFor(() => {
      const sortSelect = screen.getByRole("combobox", { name: /sort:/i }) as HTMLSelectElement;
      expect(sortSelect.value).toBe("deadline_asc");
    });
  });
});
