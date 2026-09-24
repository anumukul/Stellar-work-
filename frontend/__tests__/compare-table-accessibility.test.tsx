import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComparePage from "@/app/compare/page";

const mockGetJob = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("ids=1,2"),
}));

vi.mock("@/lib/contract", () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
}));

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    client: "GCLIENT",
    freelancer: null,
    amount: "10000000",
    description_hash: "abcdef1234567890",
    status: "Open",
    created_at: "1710000000",
    deadline: "0",
    token: "GTOKEN",
    revision_count: 0,
    submitted_at: "0",
    ...overrides,
  };
}

describe("Compare jobs table accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJob
      .mockResolvedValueOnce(makeJob({ amount: "10000000" }))
      .mockResolvedValueOnce(makeJob({ amount: "25000000" }));
  });

  it("exposes a caption and scoped row and column headers", async () => {
    render(<ComparePage />);

    const table = await screen.findByRole("table", {
      name: /side-by-side comparison of selected jobs/i,
    });

    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Field",
      "Job #1",
      "Job #2",
    ]);
    expect(headers.every((header) => header.getAttribute("scope") === "col")).toBe(true);

    await waitFor(() => {
      expect(within(table).getByRole("rowheader", { name: "Amount" })).toHaveAttribute("scope", "row");
    });
  });
});
