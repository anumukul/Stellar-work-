import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostJobPage from "@/app/post-job/page";

const mockPush = vi.fn();
const mockPostJob = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));
vi.mock("@/lib/contract", () => ({
  getDescPayloadMax: vi.fn().mockResolvedValue(4096),
  postJob: (...args: unknown[]) => mockPostJob(...args),
  storeDescriptionCid: vi.fn(),
}));
vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({ wallet: "GCLIENT", connectWallet: vi.fn() }),
}));
vi.mock("@/lib/stellar", () => ({
  getExplorerTxUrl: (hash: string) => `https://example.test/${hash}`,
}));

describe("post-job redirect", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    localStorage.clear();
    mockPostJob.mockResolvedValue({ status: "SUCCESS", hash: "TX_OK", data: 610n });
  });

  it("shows a success message before redirecting to the confirmed job ID", async () => {
    render(<PostJobPage />);
    fireEvent.change(screen.getByRole("spinbutton", { name: /Amount/ }), {
      target: { value: "1.25" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Job Description/ }), {
      target: { value: "Build escrow UI" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Token Address/ }), {
      target: { value: "GNATIVE" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Post Job" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Job #610 created successfully. Redirecting...")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mockPush).toHaveBeenCalledWith("/job/610");
    vi.useRealTimers();
  });
});