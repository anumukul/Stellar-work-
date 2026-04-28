import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/page";

const mockGetJobCount = vi.fn();
const mockGetJob = vi.fn();

vi.mock("@/lib/contract", () => ({
  getJobCount: (...args: unknown[]) => mockGetJobCount(...args),
  getJob: (...args: unknown[]) => mockGetJob(...args),
  acceptJob: vi.fn(),
}));

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({
    wallet: null,
    connectWallet: vi.fn(),
  }),
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
      });

    render(<HomePage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Job #2" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { name: "Job #1" })).not.toBeInTheDocument();
    expect(screen.getByText("Accept Job")).toBeDisabled();
  });
});
