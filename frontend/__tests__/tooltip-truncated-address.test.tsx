import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Tooltip from "@/components/Tooltip";
import TruncatedAddress from "@/components/TruncatedAddress";

const FULL_ADDRESS = "GALVPSP4DOAQTNBPRYMHFJNRXFJPCJQQGFPRP5DBQKXGYGDHMHXBVHGF";

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows content after the hover delay and hides on leave", () => {
    render(
      <Tooltip content="Full value" delay={400}>
        <span>Trigger</span>
      </Tooltip>,
    );

    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).toHaveClass("opacity-0");

    fireEvent.mouseEnter(tip.parentElement!);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(tip).toHaveClass("opacity-0");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(tip).toHaveClass("opacity-100");

    fireEvent.mouseLeave(tip.parentElement!);
    expect(tip).toHaveClass("opacity-0");
  });

  it("shows on keyboard focus", () => {
    render(
      <Tooltip content="Focused tip" delay={200}>
        <span>Focus me</span>
      </Tooltip>,
    );

    const tip = screen.getByRole("tooltip", { hidden: true });
    const trigger = tip.previousElementSibling as HTMLElement;
    fireEvent.focus(trigger.parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(tip).toHaveClass("opacity-100");
  });
});

describe("TruncatedAddress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders truncated text and reveals the full address in a tooltip", () => {
    render(<TruncatedAddress address={FULL_ADDRESS} />);

    expect(screen.getByText("GALVPS...VHGF")).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(FULL_ADDRESS);
  });

  it("renders short addresses without a tooltip trigger truncation", () => {
    render(<TruncatedAddress address="GTOKEN" />);
    expect(screen.getByText("GTOKEN")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
  });

  it("renders the empty label when address is blank", () => {
    render(<TruncatedAddress address="" emptyLabel="N/A" />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });
});
