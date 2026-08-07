import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PullToRefresh from "@/components/PullToRefresh";

/** Dispatch a touch-shaped event; jsdom has no real TouchEvent constructor. */
function touch(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY }],
  });
  act(() => {
    window.dispatchEvent(event);
  });
}

beforeEach(() => {
  // The hook only binds touch listeners on touch-capable browsers.
  Object.defineProperty(window, "ontouchstart", { value: null, configurable: true });
  window.scrollY = 0;
});

describe("PullToRefresh", () => {
  it("exposes a keyboard-accessible refresh button", async () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh onRefresh={onRefresh} label="Refresh job listings" />);

    const button = screen.getByRole("button", { name: "Refresh job listings" });
    act(() => {
      button.click();
    });

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("refreshes when the pull passes the threshold", async () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh onRefresh={onRefresh} />);

    touch("touchstart", 0);
    touch("touchmove", 200);
    touch("touchend", 200);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("ignores a pull that stops short of the threshold", async () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh onRefresh={onRefresh} />);

    touch("touchstart", 0);
    touch("touchmove", 20);
    touch("touchend", 20);

    await waitFor(() => expect(screen.queryByText("Refreshing…")).not.toBeInTheDocument());
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("debounces rapid repeat pulls", async () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh onRefresh={onRefresh} />);

    touch("touchstart", 0);
    touch("touchmove", 200);
    touch("touchend", 200);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    touch("touchstart", 0);
    touch("touchmove", 200);
    touch("touchend", 200);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("does not bind gestures when disabled", async () => {
    const onRefresh = vi.fn();
    render(<PullToRefresh onRefresh={onRefresh} disabled />);

    touch("touchstart", 0);
    touch("touchmove", 200);
    touch("touchend", 200);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Refresh content" })).toBeDisabled();
  });
});
