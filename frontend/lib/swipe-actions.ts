/**
 * Pure swipe-gesture logic for mobile job-card quick actions.
 *
 * Extracted from `components/SwipeableJobCard` so the threshold math,
 * action resolution, spring physics and device detection can be unit
 * tested without a DOM or a real touch environment.
 */

/** Quick actions that can be performed on a job card. */
export type SwipeAction = "accept" | "bookmark" | "cancel";

/** What releasing the card at a given offset should do. */
export type SwipeMode =
  | "trigger" // full swipe — run the action immediately (with haptics)
  | "reveal" // past the reveal threshold — pin the action open for tapping
  | "close"; // below thresholds — spring the card back to rest

export type SwipeDirection = "right" | "left" | "none";

/** Distance (px) the card must travel before a quick action is revealed. */
export const SWIPE_REVEAL_PX = 50;

/** Distance (px) for a full swipe that confirms/triggers the action. */
export const SWIPE_FULL_PX = 150;

/** Resting offset (px) when a revealed action is pinned open. */
export const SWIPE_PINNED_PX = 96;

/**
 * Hard travel limit while dragging. Slightly above the full-swipe
 * threshold, then rubber-banded for physical resistance.
 */
export const SWIPE_MAX_DRAG_PX = SWIPE_FULL_PX * 1.3;

/** Spring physics used for release / snap animations. */
export const SWIPE_SPRING = { stiffness: 320, damping: 28 } as const;

/** Shared no-op used for cancelled animations / subscriptions. */
export const NOOP = () => undefined;

export interface SwipeActionAvailability {
  /** Accept is contextual: only open jobs for a connected freelancer. */
  canAccept: boolean;
  /** Cancel is contextual: only the job's own client, while still open. */
  canCancel: boolean;
}

export interface SwipeOutcome {
  action: SwipeAction | null;
  mode: SwipeMode;
}

/** Which way the card is travelling for a given horizontal offset. */
export function getSwipeDirection(offsetPx: number): SwipeDirection {
  if (offsetPx >= SWIPE_REVEAL_PX) return "right";
  if (offsetPx <= -SWIPE_REVEAL_PX) return "left";
  return "none";
}

/**
 * Which action the layer underneath the card should display for a given
 * drag offset.
 *
 * - Swipe right 50px+  → "Accept" (green)
 * - Swipe left 50px+   → "Bookmark" (blue)
 * - Swipe left 150px+  → "Cancel" (red, client's own jobs only)
 */
export function getRevealedSwipeAction(
  offsetPx: number,
  { canAccept, canCancel }: SwipeActionAvailability,
): SwipeAction | null {
  if (offsetPx >= SWIPE_REVEAL_PX) {
    return canAccept ? "accept" : null;
  }
  if (offsetPx <= -SWIPE_FULL_PX && canCancel) {
    return "cancel";
  }
  if (offsetPx <= -SWIPE_REVEAL_PX) {
    return "bookmark";
  }
  return null;
}

/**
 * Decide what happens when the user releases the card at `offsetPx`
 * (velocity-projected by the caller).
 *
 * Full swipes (150px+) trigger the action with confirmation haptics;
 * partial swipes (50px+) pin the action open so it can be tapped.
 */
export function resolveSwipeOutcome(
  offsetPx: number,
  availability: SwipeActionAvailability,
): SwipeOutcome {
  const { canAccept, canCancel } = availability;

  if (offsetPx >= SWIPE_FULL_PX) {
    return canAccept
      ? { action: "accept", mode: "trigger" }
      : { action: null, mode: "close" };
  }

  if (offsetPx <= -SWIPE_FULL_PX) {
    // A full left swipe confirms "Cancel" for the client's own jobs and
    // falls back to "Bookmark" otherwise.
    return canCancel
      ? { action: "cancel", mode: "trigger" }
      : { action: "bookmark", mode: "trigger" };
  }

  if (offsetPx >= SWIPE_REVEAL_PX) {
    return canAccept
      ? { action: "accept", mode: "reveal" }
      : { action: null, mode: "close" };
  }

  if (offsetPx <= -SWIPE_REVEAL_PX) {
    return { action: "bookmark", mode: "reveal" };
  }

  return { action: null, mode: "close" };
}

/** iOS-style rubber banding for over-drag resistance. */
function rubberband(overshootPx: number, dimensionPx: number): number {
  const c = 0.55;
  return (overshootPx * dimensionPx * c) / (dimensionPx + c * overshootPx);
}

/**
 * Clamp a drag offset to the usable range. Directions with no available
 * action are heavily resisted so the card communicates "nothing here".
 */
export function clampSwipeOffset(
  offsetPx: number,
  { canAccept, canCancel }: SwipeActionAvailability,
): number {
  if (offsetPx > 0) {
    // With no Accept action available the right side is tightly resisted
    // and can never reach the 50px reveal threshold.
    const limit = canAccept ? SWIPE_MAX_DRAG_PX : SWIPE_REVEAL_PX * 0.6;
    if (offsetPx <= limit) return offsetPx;
    return limit + rubberband(offsetPx - limit, canAccept ? 60 : 20);
  }
  if (offsetPx < 0) {
    // A full left swipe is only meaningful when cancel or bookmark exists;
    // bookmark is always available, so the left side always has a range.
    const limit = canCancel ? SWIPE_MAX_DRAG_PX : SWIPE_FULL_PX + 24;
    const magnitude = Math.abs(offsetPx);
    if (magnitude <= limit) return offsetPx;
    return -(limit + rubberband(magnitude - limit, 60));
  }
  return 0;
}

/**
 * Fire device haptic feedback for gesture confirmation. Safe No-Op on
 * devices / browsers without the Vibration API (e.g. iOS Safari, jsdom).
 */
export function triggerHapticFeedback(pattern: number | number[] = 10): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (typeof nav.vibrate === "function") {
    nav.vibrate(pattern);
  }
}

/**
 * Swipe quick actions are a touch interaction. Desktop devices (fine
 * pointer: mouse / trackpad) keep hover + tap, so gestures are disabled
 * there. Detection prefers the `(pointer: coarse)` media query and falls
 * back to touch-point probing where matchMedia is unavailable.
 */
export function isCoarsePointerDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      // Fall through to the touch-point heuristic.
    }
  }
  return typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0;
}

/** WCAG 2.3.3 — respect reduced-motion preferences for the spring. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Animate a horizontal offset from `from` to `to` using spring physics
 * (semi-implicit Euler integration) driven by requestAnimationFrame.
 *
 * Returns a cancel function. With reduced-motion preferences (or no rAF,
 * e.g. jsdom) the value jumps straight to the target.
 */
export function animateSpringTo(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  onComplete?: () => void,
): () => void {
  if (
    prefersReducedMotion() ||
    typeof requestAnimationFrame !== "function"
  ) {
    onUpdate(to);
    onComplete?.();
    return NOOP;
  }

  const { stiffness, damping } = SWIPE_SPRING;
  let position = from;
  let velocity = 0;
  let frame = 0;
  let settled = false;
  let lastTime: number | null = null;

  const step = (time: number) => {
    if (settled) return;
    const dt = lastTime === null ? 1 / 60 : Math.min(Math.max((time - lastTime) / 1000, 0), 0.064);
    lastTime = time;

    const force = -stiffness * (position - to) - damping * velocity;
    velocity += force * dt;
    position += velocity * dt;
    onUpdate(position);

    // Settle when the remaining travel and velocity are imperceptible.
    if (Math.abs(position - to) < 0.5 && Math.abs(velocity) < 5) {
      settled = true;
      onUpdate(to);
      onComplete?.();
      return;
    }
    frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);
  return () => {
    settled = true;
    cancelAnimationFrame(frame);
  };
}
