"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PullPhase = "idle" | "pulling" | "ready" | "refreshing" | "done";

/** Pull distance (px, after resistance) required to arm a refresh. */
export const PULL_THRESHOLD = 70;
/** Pull distance is clamped here so the indicator never drifts too far. */
export const MAX_PULL = 110;
/** Finger travel is damped by this factor to feel like a native pull. */
const RESISTANCE = 0.5;
/** Repeat refreshes within this window are ignored. */
const DEBOUNCE_MS = 1500;
/** How long the success checkmark stays visible. */
const DONE_MS = 800;

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  // Not in every mobile browser, and a no-op on desktop.
  navigator.vibrate?.(pattern);
}

type Options = {
  /** Skip touch tracking entirely (e.g. no wallet connected, nothing to load). */
  disabled?: boolean;
};

export type PullToRefreshState = {
  phase: PullPhase;
  /** Damped pull distance in px. */
  distance: number;
  /** 0 → 1 progress towards the threshold. */
  progress: number;
  /** Trigger a refresh without a gesture (keyboard, button, shortcut). */
  refresh: () => void;
};

/**
 * Tracks a downward drag at the top of the document scroll and runs `onRefresh`
 * once the pull passes `PULL_THRESHOLD`.
 */
export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  { disabled = false }: Options = {},
): PullToRefreshState {
  const [phase, setPhase] = useState<PullPhase>("idle");
  const [distance, setDistance] = useState(0);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const phaseRef = useRef<PullPhase>("idle");
  phaseRef.current = phase;

  const startYRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const lastRunRef = useRef(0);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhaseSafe = useCallback((next: PullPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const runRefresh = useCallback(async () => {
    if (phaseRef.current === "refreshing") return;

    const now = performance.now();
    if (now - lastRunRef.current < DEBOUNCE_MS) {
      setDistance(0);
      setPhaseSafe("idle");
      return;
    }
    lastRunRef.current = now;

    setPhaseSafe("refreshing");
    setDistance(PULL_THRESHOLD);
    vibrate(15);

    try {
      await onRefreshRef.current();
    } finally {
      setPhaseSafe("done");
      setDistance(0);
      vibrate([10, 40, 10]);
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      doneTimerRef.current = setTimeout(() => {
        if (phaseRef.current === "done") setPhaseSafe("idle");
      }, DONE_MS);
    }
  }, [setPhaseSafe]);

  const refresh = useCallback(() => {
    void runRefresh();
  }, [runRefresh]);

  useEffect(() => {
    if (disabled) return;
    if (typeof window === "undefined") return;
    if (!("ontouchstart" in window)) return;

    const atTop = () => window.scrollY <= 0;

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      if (!atTop() || phaseRef.current === "refreshing") return;
      startYRef.current = event.touches[0].clientY;
      armedRef.current = false;
    }

    function onTouchMove(event: TouchEvent) {
      const startY = startYRef.current;
      if (startY === null) return;

      const delta = event.touches[0].clientY - startY;

      // Upward drag, or the page scrolled away from the top: hand the gesture
      // back to native scrolling.
      if (delta <= 0 || !atTop()) {
        if (phaseRef.current === "pulling" || phaseRef.current === "ready") {
          setDistance(0);
          setPhaseSafe("idle");
        }
        startYRef.current = null;
        return;
      }

      const pulled = Math.min(delta * RESISTANCE, MAX_PULL);
      setDistance(pulled);

      const ready = pulled >= PULL_THRESHOLD;
      if (ready && !armedRef.current) {
        armedRef.current = true;
        vibrate(10);
      } else if (!ready) {
        armedRef.current = false;
      }
      setPhaseSafe(ready ? "ready" : "pulling");

      // Suppress the browser's own overscroll/bounce while we own the gesture.
      if (event.cancelable) event.preventDefault();
    }

    function onTouchEnd() {
      if (startYRef.current === null) return;
      startYRef.current = null;

      if (armedRef.current) {
        armedRef.current = false;
        void runRefresh();
        return;
      }

      if (phaseRef.current === "pulling" || phaseRef.current === "ready") {
        setDistance(0);
        setPhaseSafe("idle");
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [disabled, runRefresh, setPhaseSafe]);

  useEffect(
    () => () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    },
    [],
  );

  return {
    phase,
    distance,
    progress: Math.min(distance / PULL_THRESHOLD, 1),
    refresh,
  };
}
