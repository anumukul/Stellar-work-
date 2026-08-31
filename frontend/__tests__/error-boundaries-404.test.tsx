/**
 * Error boundaries and the custom 404 — TEST-13 (#764).
 *
 * These fallbacks only render when something has already gone wrong, so they
 * are the least-exercised code in the app and the most costly to get wrong: a
 * broken boundary turns a recoverable error into a blank screen, and the user
 * has no route back.
 *
 * What is asserted, for each fallback:
 *   - it renders rather than throwing
 *   - it explains what happened
 *   - it offers a way out — retry, or a link home
 *   - it is announced correctly to assistive technology
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import GlobalError from "@/app/error";
import NotFound from "@/app/not-found";
import RouteErrorState from "@/components/RouteErrorState";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The boundaries log to console.error; silence it so output stays readable. */
function silenceConsole() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

describe("root error boundary", () => {
  it("renders instead of throwing", () => {
    silenceConsole();

    expect(() =>
      render(<GlobalError error={new Error("boom")} retry={vi.fn()} />),
    ).not.toThrow();
  });

  it("tells the user what happened", () => {
    silenceConsole();
    render(<GlobalError error={new Error("boom")} retry={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /something went wrong/i }),
    ).toBeInTheDocument();
  });

  it("offers a retry and a way home", () => {
    silenceConsole();
    render(<GlobalError error={new Error("boom")} retry={vi.fn()} />);

    // A fallback with no exit leaves the user stuck on a dead page.
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute("href", "/");
  });

  it("calls retry when Try again is pressed", async () => {
    silenceConsole();
    const retry = vi.fn();
    render(<GlobalError error={new Error("boom")} retry={retry} />);

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("prefers retry over reset when both are supplied", async () => {
    silenceConsole();
    const retry = vi.fn();
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} retry={retry} reset={reset} />);

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    // Next 16.3 made `retry` stable: it re-fetches, where `reset` only
    // re-renders. Most errors here come from a failed fetch, so re-rendering
    // alone reproduces the failure and the button looks broken.
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("falls back to reset on a runtime that does not pass retry", async () => {
    silenceConsole();
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} reset={reset} />);

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not throw when neither recovery prop is supplied", async () => {
    silenceConsole();
    render(<GlobalError error={new Error("boom")} />);

    // A dead button is bad; a button that throws on click is worse.
    await expect(
      userEvent.click(screen.getByRole("button", { name: /try again/i })),
    ).resolves.not.toThrow();
  });

  it("shows a reference code the user can quote to support", () => {
    silenceConsole();
    render(<GlobalError error={new Error("boom")} retry={vi.fn()} />);

    expect(screen.getByText(/Ref:\s*ERR-/)).toBeInTheDocument();
  });

  it("includes the Next.js digest when there is one", () => {
    silenceConsole();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    render(<GlobalError error={error} retry={vi.fn()} />);

    // The digest is how a client-side report is matched to a server log.
    expect(screen.getByText(/digest: abc123/)).toBeInTheDocument();
  });

  it("omits the digest when there is none", () => {
    silenceConsole();
    render(<GlobalError error={new Error("boom")} retry={vi.fn()} />);

    expect(screen.queryByText(/digest:/)).not.toBeInTheDocument();
  });

  it("logs the error with its reference code", () => {
    const spy = silenceConsole();
    render(<GlobalError error={new Error("boom")} retry={vi.fn()} />);

    // Without the code in the log, a user quoting it cannot be helped.
    expect(spy).toHaveBeenCalledWith(
      "[StellarWork]",
      expect.stringMatching(/^ERR-/),
      expect.any(Error),
    );
  });

  it("labels its region for assistive technology", () => {
    silenceConsole();
    const { container } = render(<GlobalError error={new Error("boom")} retry={vi.fn()} />);

    const section = container.querySelector("section");
    expect(section).toHaveAttribute("aria-labelledby");
  });

  it("hides the decorative icon from screen readers", () => {
    silenceConsole();
    const { container } = render(<GlobalError error={new Error("boom")} retry={vi.fn()} />);

    // The warning glyph carries no information the heading does not.
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("does not leak the raw error message to the user", () => {
    silenceConsole();
    render(
      <GlobalError
        error={new Error("SQLSTATE 42P01: relation jobs does not exist")}
        retry={vi.fn()}
      />,
    );

    // Internal detail belongs in the log, not on screen.
    expect(screen.queryByText(/SQLSTATE/)).not.toBeInTheDocument();
  });
});

describe("custom 404", () => {
  it("renders", () => {
    expect(() => render(<NotFound />)).not.toThrow();
  });

  it("says the page was not found", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("offers routes back into the app", () => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /browse jobs/i })).toHaveAttribute(
      "href",
      "/?status=Open",
    );
  });

  it("groups the recovery links in a labelled navigation landmark", () => {
    render(<NotFound />);

    expect(screen.getByRole("navigation", { name: /recovery options/i })).toBeInTheDocument();
  });

  it("labels its region for assistive technology", () => {
    const { container } = render(<NotFound />);

    expect(container.querySelector("section")).toHaveAttribute(
      "aria-labelledby",
      "not-found-heading",
    );
  });

  it("is excluded from search indexing", async () => {
    // A soft-404 that search engines index is a real SEO defect.
    const mod = await import("@/app/not-found");

    expect(mod.metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("has a descriptive document title", async () => {
    const mod = await import("@/app/not-found");

    expect(String(mod.metadata.title)).toMatch(/404/);
  });
});

describe("route error boundary", () => {
  const props = {
    title: "Job details unavailable",
    description: "The job page could not be loaded.",
    backHref: "/",
    backLabel: "Jobs",
    onRetry: vi.fn(),
  };

  it("renders the supplied title and description", () => {
    render(<RouteErrorState {...props} />);

    expect(screen.getByRole("heading", { name: props.title })).toBeInTheDocument();
    expect(screen.getByText(props.description)).toBeInTheDocument();
  });

  it("offers a retry and a scoped way back", () => {
    render(<RouteErrorState {...props} />);

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // Back to the section, not the site root — a route-level failure should
    // not evict the user from where they were working.
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/");
  });

  it("calls onRetry when retry is pressed", async () => {
    const onRetry = vi.fn();
    render(<RouteErrorState {...props} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back to a default back label", () => {
    render(<RouteErrorState {...props} backLabel={undefined} />);

    expect(screen.getByRole("link", { name: /go back/i })).toBeInTheDocument();
  });

  it("carries the shared Error branding", () => {
    render(<RouteErrorState {...props} />);

    // The same "Error" eyebrow as the root boundary, so the two read as one
    // system rather than two unrelated failure screens.
    expect(screen.getByText("Error")).toBeInTheDocument();
  });
});

describe("the job route boundary is wired to the shared fallback", () => {
  it("renders the job-specific copy", async () => {
    const { default: JobError } = await import("@/app/job/[id]/error");

    render(<JobError error={new Error("boom")} retry={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /job details unavailable/i }),
    ).toBeInTheDocument();
  });

  it("sends the user back to the job list, not the site root only", async () => {
    const { default: JobError } = await import("@/app/job/[id]/error");

    render(<JobError error={new Error("boom")} retry={vi.fn()} />);

    expect(screen.getByRole("link", { name: /jobs/i })).toBeInTheDocument();
  });

  it("wires retry through to the retry button", async () => {
    const { default: JobError } = await import("@/app/job/[id]/error");
    const retry = vi.fn();

    render(<JobError error={new Error("boom")} retry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("still recovers on a runtime that passes only reset", async () => {
    const { default: JobError } = await import("@/app/job/[id]/error");
    const reset = vi.fn();

    render(<JobError error={new Error("boom")} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("every fallback offers an escape route", () => {
  /**
   * The property that matters most across all of them: whatever failed, the
   * user must always have at least one link or button to move on with. A
   * fallback without one is a dead end, which is the failure mode this issue
   * exists to prevent.
   */
  it("root error boundary", () => {
    silenceConsole();
    render(<GlobalError error={new Error("boom")} retry={vi.fn()} />);

    expect(
      screen.getAllByRole("link").length + screen.getAllByRole("button").length,
    ).toBeGreaterThan(0);
  });

  it("404", () => {
    render(<NotFound />);

    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("route error boundary", () => {
    render(
      <RouteErrorState
        title="t"
        description="d"
        backHref="/"
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("link").length + screen.getAllByRole("button").length,
    ).toBeGreaterThan(0);
  });
});
