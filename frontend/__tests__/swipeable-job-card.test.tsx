import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SwipeableJobCard from "@/components/SwipeableJobCard";
import {
  SWIPE_FULL_PX,
  SWIPE_PINNED_PX,
  SWIPE_REVEAL_PX,
  clampSwipeOffset,
  getRevealedSwipeAction,
  getSwipeDirection,
  isCoarsePointerDevice,
  resolveSwipeOutcome,
  triggerHapticFeedback,
} from "@/lib/swipe-actions";

/** Deterministic springs: reduced-motion makes animateSpringTo jump instantly. */
function stubReducedMotionMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const BASE_PROPS = {
  jobId: 7,
  canAccept: true,
  canCancel: true,
  bookmarked: false,
  onAccept: vi.fn(),
  onBookmark: vi.fn(),
  onCancel: vi.fn(),
};

function renderCard(overrides: Partial<typeof BASE_PROPS> = {}) {
  const props = { ...BASE_PROPS, ...overrides };
  render(
    <SwipeableJobCard {...props} enabled>
      <article>Job card content</article>
    </SwipeableJobCard>,
  );
  return props;
}

describe("swipe gesture thresholds (issue spec)", () => {
  it("uses 50px reveal and 150px full-swipe thresholds", () => {
    expect(SWIPE_REVEAL_PX).toBe(50);
    expect(SWIPE_FULL_PX).toBe(150);
    expect(SWIPE_FULL_PX).toBeGreaterThan(SWIPE_REVEAL_PX);
    expect(SWIPE_PINNED_PX).toBeGreaterThan(0);
  });

  it("resolves swipe direction from the offset", () => {
    expect(getSwipeDirection(0)).toBe("none");
    expect(getSwipeDirection(49)).toBe("none");
    expect(getSwipeDirection(50)).toBe("right");
    expect(getSwipeDirection(-50)).toBe("left");
  });
});

describe("getRevealedSwipeAction", () => {
  it("reveals Accept on a 50px+ right swipe", () => {
    expect(getRevealedSwipeAction(50, { canAccept: true, canCancel: false })).toBe("accept");
    expect(getRevealedSwipeAction(200, { canAccept: true, canCancel: false })).toBe("accept");
  });

  it("reveals nothing on a right swipe when Accept is unavailable", () => {
    expect(getRevealedSwipeAction(80, { canAccept: false, canCancel: true })).toBeNull();
  });

  it("reveals Bookmark on a 50px+ left swipe", () => {
    expect(getRevealedSwipeAction(-50, { canAccept: true, canCancel: false })).toBe("bookmark");
    expect(getRevealedSwipeAction(-149, { canAccept: true, canCancel: true })).toBe("bookmark");
  });

  it("reveals Cancel on a 150px+ left swipe for the client's own jobs only", () => {
    expect(getRevealedSwipeAction(-150, { canAccept: false, canCancel: true })).toBe("cancel");
    expect(getRevealedSwipeAction(-150, { canAccept: false, canCancel: false })).toBe("bookmark");
  });

  it("reveals nothing below the threshold", () => {
    expect(getRevealedSwipeAction(10, { canAccept: true, canCancel: true })).toBeNull();
    expect(getRevealedSwipeAction(-49, { canAccept: true, canCancel: true })).toBeNull();
  });
});

describe("resolveSwipeOutcome", () => {
  it("triggers Accept with confirmation on a full right swipe", () => {
    expect(resolveSwipeOutcome(150, { canAccept: true, canCancel: false })).toEqual({
      action: "accept",
      mode: "trigger",
    });
    expect(resolveSwipeOutcome(400, { canAccept: true, canCancel: false })).toEqual({
      action: "accept",
      mode: "trigger",
    });
  });

  it("pins Accept open for tapping on a partial right swipe", () => {
    expect(resolveSwipeOutcome(75, { canAccept: true, canCancel: false })).toEqual({
      action: "accept",
      mode: "reveal",
    });
  });

  it("closes when Accept is unavailable on a right swipe", () => {
    expect(resolveSwipeOutcome(200, { canAccept: false, canCancel: true })).toEqual({
      action: null,
      mode: "close",
    });
  });

  it("triggers Cancel on a full left swipe for the client's own jobs", () => {
    expect(resolveSwipeOutcome(-150, { canAccept: true, canCancel: true })).toEqual({
      action: "cancel",
      mode: "trigger",
    });
  });

  it("falls back to Bookmark on a full left swipe for other users", () => {
    expect(resolveSwipeOutcome(-300, { canAccept: true, canCancel: false })).toEqual({
      action: "bookmark",
      mode: "trigger",
    });
  });

  it("pins Bookmark open for tapping on a partial left swipe", () => {
    expect(resolveSwipeOutcome(-60, { canAccept: false, canCancel: false })).toEqual({
      action: "bookmark",
      mode: "reveal",
    });
  });

  it("closes below the reveal threshold", () => {
    expect(resolveSwipeOutcome(0, { canAccept: true, canCancel: true })).toEqual({
      action: null,
      mode: "close",
    });
    expect(resolveSwipeOutcome(-20, { canAccept: true, canCancel: true })).toEqual({
      action: null,
      mode: "close",
    });
  });
});

describe("clampSwipeOffset", () => {
  it("passes through offsets inside the travel limit", () => {
    expect(clampSwipeOffset(100, { canAccept: true, canCancel: true })).toBe(100);
    expect(clampSwipeOffset(-100, { canAccept: true, canCancel: true })).toBe(-100);
    expect(clampSwipeOffset(0, { canAccept: true, canCancel: true })).toBe(0);
  });

  it("rubber-bands drags past the travel limit with diminishing travel", () => {
    const clamped = clampSwipeOffset(500, { canAccept: true, canCancel: true });
    expect(clamped).toBeGreaterThan(0);
    expect(clamped).toBeLessThan(500);
    // past the limit it grows sub-linearly
    expect(clamped - clampSwipeOffset(400, { canAccept: true, canCancel: true })).toBeLessThan(100);
  });

  it("hard-resists right swipes when Accept is not available", () => {
    const clamped = clampSwipeOffset(300, { canAccept: false, canCancel: false });
    expect(clamped).toBeGreaterThan(0); // still gives tactile feedback
    expect(clamped).toBeLessThan(SWIPE_REVEAL_PX); // but never reveals an action
  });
});

describe("haptic feedback", () => {
  it("is a safe no-op without the Vibration API", () => {
    expect(() => triggerHapticFeedback(10)).not.toThrow();
    expect(() => triggerHapticFeedback([20, 40, 20])).not.toThrow();
  });

  it("invokes navigator.vibrate when available", () => {
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    });
    triggerHapticFeedback(25);
    expect(vibrate).toHaveBeenCalledWith(25);
    // @ts-expect-error - cleanup the stubbed API
    delete window.navigator.vibrate;
  });
});

describe("isCoarsePointerDevice", () => {
  it("defaults to false where matchMedia is unavailable (jsdom/desktop)", () => {
    // jsdom ships no matchMedia implementation by default
    expect(typeof window.matchMedia).not.toBe("function");
    expect(isCoarsePointerDevice()).toBe(false);
  });

  it("honours the (pointer: coarse) media query when available", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
    })) as unknown as typeof window.matchMedia;
    expect(isCoarsePointerDevice()).toBe(true);
    // @ts-expect-error - restore jsdom default
    window.matchMedia = undefined;
  });
});

describe("SwipeableJobCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubReducedMotionMatchMedia();
  });

  it("renders children untouched when gestures are disabled (desktop)", () => {
    render(
      <SwipeableJobCard {...BASE_PROPS} enabled={false}>
        <article>Job card content</article>
      </SwipeableJobCard>,
    );
    expect(screen.getByText("Job card content")).toBeInTheDocument();
    expect(screen.queryByTestId("swipe-underlay-7")).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("renders children untouched by default where no coarse pointer exists", () => {
    // @ts-expect-error - jsdom has no matchMedia; detection must be false
    window.matchMedia = undefined;
    render(
      <SwipeableJobCard {...BASE_PROPS}>
        <article>Job card content</article>
      </SwipeableJobCard>,
    );
    expect(screen.getByText("Job card content")).toBeInTheDocument();
    expect(screen.queryByTestId("swipe-underlay-7")).not.toBeInTheDocument();
  });

  it("renders a green Accept action and a blue Bookmark action when enabled", () => {
    renderCard();
    expect(screen.getByRole("group", { name: "Job #7 quick actions" })).toBeInTheDocument();

    const accept = screen.getByTestId("swipe-accept-7");
    expect(accept).toHaveClass("bg-green-600");
    expect(accept).toHaveAttribute("aria-label", "Accept job 7");

    const leftAction = screen.getByTestId("swipe-left-action-7");
    expect(leftAction).toHaveClass("bg-blue-600");
    expect(leftAction).toHaveAttribute("aria-label", "Bookmark job 7");
  });

  it("owns horizontal swipes while letting vertical scroll pass through", () => {
    renderCard();
    // touch-action: pan-y — vertical page scroll stays with the browser.
    expect(screen.getByTestId("swipe-card-7")).toHaveClass("[touch-action:pan-y]");
  });

  it("hides the Accept swipe action when unavailable for the role/status", () => {
    renderCard({ canAccept: false });
    expect(screen.queryByTestId("swipe-accept-7")).not.toBeInTheDocument();
    expect(screen.getByTestId("swipe-left-action-7")).toBeInTheDocument();
  });

  it("opens the tap-and-hold actions menu (accessibility fallback)", () => {
    renderCard();
    const card = screen.getByTestId("swipe-card-7");

    const defaultAllowed = fireEvent.contextMenu(card);
    expect(defaultAllowed).toBe(false); // native long-press menu suppressed

    const menu = screen.getByRole("menu", { name: "Quick actions for Job #7" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Accept job" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Bookmark job" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Cancel job" })).toBeInTheDocument();
  });

  it("only offers contextual actions in the hold menu", () => {
    renderCard({ canAccept: false, canCancel: false, bookmarked: true });
    fireEvent.contextMenu(screen.getByTestId("swipe-card-7"));

    expect(screen.queryByRole("menuitem", { name: "Accept job" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Cancel job" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Remove bookmark" }),
    ).toBeInTheDocument();
  });

  it("executes menu actions with callbacks and closes the menu", () => {
    const props = renderCard();
    fireEvent.contextMenu(screen.getByTestId("swipe-card-7"));

    fireEvent.click(screen.getByRole("menuitem", { name: "Bookmark job" }));
    expect(props.onBookmark).toHaveBeenCalledTimes(1);
    expect(props.onAccept).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId("swipe-card-7"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Accept job" }));
    expect(props.onAccept).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(screen.getByTestId("swipe-card-7"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel job" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("closes the menu with Escape and via the backdrop", () => {
    renderCard();
    const card = screen.getByTestId("swipe-card-7");

    fireEvent.contextMenu(card);
    fireEvent.keyDown(screen.getByRole("group", { name: "Job #7 quick actions" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.contextMenu(card);
    fireEvent.click(screen.getByTestId("swipe-hold-backdrop-7"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not open the menu or swallow context menus while disabled", () => {
    render(
      <SwipeableJobCard {...BASE_PROPS} enabled disabled>
        <article>Disabled card</article>
      </SwipeableJobCard>,
    );
    const disabledCard = screen.getByTestId("swipe-card-7");
    fireEvent.contextMenu(disabledCard);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not fire actions for plain taps on the card content", () => {
    const props = renderCard();
    fireEvent.click(screen.getByText("Job card content"));
    expect(props.onAccept).not.toHaveBeenCalled();
    expect(props.onBookmark).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });
});
