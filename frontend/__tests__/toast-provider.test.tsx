import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/components/ToastProvider";

function ToastHarness() {
  const { showSuccess, showError, showPending } = useToast();
  return (
    <div>
      <button type="button" onClick={() => showSuccess("Saved")}>
        Show success
      </button>
      <button type="button" onClick={() => showError("Failed")}>
        Show error
      </button>
      <button type="button" onClick={() => showPending("Processing")}>
        Show pending
      </button>
    </div>
  );
}

describe("ToastProvider", () => {
  it("shows success and error variants with manual dismiss", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    fireEvent.click(screen.getByRole("button", { name: "Show error" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");

    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
  });

  it("auto-dismisses toasts", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "Show success" }).click();
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("manual close does not interfere with auto-dismiss timing", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "Show success" }).click();
      screen.getByRole("button", { name: "Show error" }).click();
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Manually close the success toast
    act(() => {
      fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Error toast should still auto-dismiss at correct time
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("maintains consistent dismiss timeout across multiple toasts", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    // Show first toast
    act(() => {
      screen.getByRole("button", { name: "Show success" }).click();
    });

    // Wait 1 second, then show second toast
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      screen.getByRole("button", { name: "Show error" }).click();
    });

    // First toast should dismiss at 5s
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Second toast should dismiss 1s later (at 6s total)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows pending variant with spinning icon", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show pending" }));
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Processing");
  });

  it("stacks multiple variants simultaneously", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show pending" }));
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    fireEvent.click(screen.getByRole("button", { name: "Show error" }));

    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("deduplicates pending toasts with same message", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show pending" }));
    fireEvent.click(screen.getByRole("button", { name: "Show pending" }));

    const statusElements = screen.getAllByRole("status");
    expect(statusElements).toHaveLength(1);
  });

  describe("Toast deduplication", () => {
    it("prevents duplicate toasts with same message and variant", () => {
      render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      // Show success toast
      fireEvent.click(screen.getByRole("button", { name: "Show success" }));
      expect(screen.getByRole("status")).toHaveTextContent("Saved");

      // Try to show same success toast again
      fireEvent.click(screen.getByRole("button", { name: "Show success" }));

      // Should still only have one toast
      const statusElements = screen.getAllByRole("status");
      expect(statusElements).toHaveLength(1);
    });

    it("prevents duplicate error toasts with same message", () => {
      render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      // Show error toast
      fireEvent.click(screen.getByRole("button", { name: "Show error" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Failed");

      // Try to show same error toast again
      fireEvent.click(screen.getByRole("button", { name: "Show error" }));

      // Should still only have one toast
      const alertElements = screen.getAllByRole("alert");
      expect(alertElements).toHaveLength(1);
    });

    it("allows distinct messages to render simultaneously", () => {
      render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      // Show success toast
      fireEvent.click(screen.getByRole("button", { name: "Show success" }));
      expect(screen.getByRole("status")).toHaveTextContent("Saved");

      // Show error toast with different message
      fireEvent.click(screen.getByRole("button", { name: "Show error" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Failed");

      // Both toasts should be visible
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("allows same message with different variants", () => {
      function SameMessageHarness() {
        const { showSuccess, showError } = useToast();
        return (
          <div>
            <button type="button" onClick={() => showSuccess("Duplicate")}>
              Show success
            </button>
            <button type="button" onClick={() => showError("Duplicate")}>
              Show error
            </button>
          </div>
        );
      }

      render(
        <ToastProvider>
          <SameMessageHarness />
        </ToastProvider>,
      );

      // Show success toast
      fireEvent.click(screen.getByRole("button", { name: "Show success" }));
      expect(screen.getByRole("status")).toHaveTextContent("Duplicate");

      // Show error toast with same message
      fireEvent.click(screen.getByRole("button", { name: "Show error" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Duplicate");

      // Both toasts should be visible (different variants)
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("allows new toast after duplicate is dismissed", () => {
      render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      // Show success toast
      fireEvent.click(screen.getByRole("button", { name: "Show success" }));
      expect(screen.getByRole("status")).toHaveTextContent("Saved");

      // Try duplicate - should not add
      fireEvent.click(screen.getByRole("button", { name: "Show success" }));
      const statusElements = screen.getAllByRole("status");
      expect(statusElements).toHaveLength(1);

      // Dismiss the toast
      fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      // Now show the same message again - should work
      fireEvent.click(screen.getByRole("button", { name: "Show success" }));
      expect(screen.getByRole("status")).toHaveTextContent("Saved");
    });

    it("auto-dismisses duplicate attempts correctly", () => {
      vi.useFakeTimers();
      render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      // Show success toast
      act(() => {
        screen.getByRole("button", { name: "Show success" }).click();
      });
      expect(screen.getByRole("status")).toBeInTheDocument();

      // Try duplicate
      act(() => {
        screen.getByRole("button", { name: "Show success" }).click();
      });

      // Advance time past auto-dismiss
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Toast should be dismissed
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    it("maintains dedup with rapid successive calls", () => {
      render(
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>,
      );

      // Rapidly click the same button multiple times
      const button = screen.getByRole("button", { name: "Show success" });
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      // Should still only have one toast
      const statusElements = screen.getAllByRole("status");
      expect(statusElements).toHaveLength(1);
    });
  });
});
