import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(() => "event-safe-reference"),
}));

function BrokenComponent(): never {
  throw new Error("RPC https://internal.example secret payload");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("inline ErrorBoundary", () => {
  it("renders stable copy and a report reference without leaking exception details", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/could not display this section/i)).toBeInTheDocument();
    expect(screen.getByText(/event-safe-reference/i)).toBeInTheDocument();
    expect(screen.queryByText(/internal\.example/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/secret payload/i)).not.toBeInTheDocument();
  });
});
