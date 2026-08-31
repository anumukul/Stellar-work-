import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Spinner from "@/components/Spinner";
import LoadingState from "@/components/LoadingState";

describe("Spinner", () => {
  it("renders an accessible SVG spinner with the default label", () => {
    render(<Spinner />);

    const spinner = screen.getByRole("status", { name: "Loading" });
    expect(spinner.tagName.toLowerCase()).toBe("svg");
    expect(spinner).toHaveAttribute("aria-busy", "true");
    expect(spinner).toHaveAttribute("width", "24");
    expect(spinner).toHaveAttribute("height", "24");
  });

  it("supports preset and numeric sizes", () => {
    const { rerender } = render(<Spinner size="sm" />);
    expect(screen.getByRole("status")).toHaveAttribute("width", "16");

    rerender(<Spinner size="lg" />);
    expect(screen.getByRole("status")).toHaveAttribute("width", "32");

    rerender(<Spinner size={40} />);
    expect(screen.getByRole("status")).toHaveAttribute("width", "40");
  });

  it("applies a custom color and label", () => {
    render(<Spinner color="#0f766e" label="Fetching jobs" />);

    const spinner = screen.getByRole("status", { name: "Fetching jobs" });
    expect(spinner).toHaveStyle({ color: "#0f766e" });
  });
});

describe("LoadingState", () => {
  it("uses Spinner and exposes the loading text", () => {
    render(<LoadingState text="Loading jobs..." />);

    expect(screen.getByText("Loading jobs...")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading jobs..." })).toBeInTheDocument();
  });
});
