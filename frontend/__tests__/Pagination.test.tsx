import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import Pagination from "../components/Pagination";

describe("Pagination", () => {
  it("labels navigation controls and exposes the current page", () => {
    render(<Pagination page={2} pageSize={10} total={42} onPageChange={vi.fn()} />);

    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to first page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to last page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Go to page 1" })).not.toHaveAttribute("aria-current");
  });

  it("announces the current page and result range", () => {
    const { rerender } = render(<Pagination page={2} pageSize={10} total={42} onPageChange={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Page 2 of 5. Showing 11-20 of 42 results.");

    rerender(<Pagination page={3} pageSize={10} total={42} onPageChange={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Page 3 of 5. Showing 21-30 of 42 results.");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Pagination page={2} pageSize={10} total={42} onPageChange={vi.fn()} />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("changes pages through the labeled controls", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={10} total={42} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("announces an empty result range without a phantom first result", () => {
    render(<Pagination page={1} pageSize={10} total={0} onPageChange={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Showing 0-0 of 0 results.");
  });
});