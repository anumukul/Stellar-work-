import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeadlineCountdown from "@/components/DeadlineCountdown";

describe("DeadlineCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a live countdown for upcoming deadlines", () => {
    const deadline = Math.floor((Date.now() + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000 + 4 * 60 * 1000) / 1000).toString();

    render(<DeadlineCountdown deadline={deadline} />);

    expect(screen.getByText(/2d 3h 4m remaining/i)).toBeInTheDocument();

    vi.advanceTimersByTime(60_000);

    expect(screen.getByText(/2d 3h 3m remaining/i)).toBeInTheDocument();
  });

  it("shows an expired state after the deadline passes", () => {
    const deadline = Math.floor((Date.now() - 60_000) / 1000).toString();

    render(<DeadlineCountdown deadline={deadline} />);

    expect(screen.getByText(/expired/i)).toBeInTheDocument();
  });
});
