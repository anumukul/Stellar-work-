"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  /** Delay in ms before showing on hover/focus. Default 400. */
  delay?: number;
  /** Preferred placement; flips when clipped by the viewport. Default "top". */
  placement?: TooltipPlacement;
  className?: string;
  contentClassName?: string;
  /**
   * When true (default), the trigger is keyboard-focusable.
   * Set false when nested inside an already-focusable control (e.g. a button).
   */
  focusable?: boolean;
};

const GAP = 8;

function computePlacement(
  trigger: DOMRect,
  tip: DOMRect,
  preferred: TooltipPlacement,
): TooltipPlacement {
  const space = {
    top: trigger.top,
    bottom: window.innerHeight - trigger.bottom,
    left: trigger.left,
    right: window.innerWidth - trigger.right,
  };

  const fits: Record<TooltipPlacement, boolean> = {
    top: space.top >= tip.height + GAP,
    bottom: space.bottom >= tip.height + GAP,
    left: space.left >= tip.width + GAP,
    right: space.right >= tip.width + GAP,
  };

  if (fits[preferred]) return preferred;

  const order: TooltipPlacement[] =
    preferred === "left" || preferred === "right"
      ? ["right", "left", "top", "bottom"]
      : ["top", "bottom", "right", "left"];

  return order.find((p) => fits[p]) ?? preferred;
}

function placementClasses(placement: TooltipPlacement): string {
  switch (placement) {
    case "bottom":
      return "top-full left-1/2 mt-2 -translate-x-1/2";
    case "left":
      return "right-full top-1/2 mr-2 -translate-y-1/2";
    case "right":
      return "left-full top-1/2 ml-2 -translate-y-1/2";
    case "top":
    default:
      return "bottom-full left-1/2 mb-2 -translate-x-1/2";
  }
}

/**
 * Reusable tooltip — shows on hover (with delay) and keyboard focus.
 * Placement flips when the preferred side would overflow the viewport.
 */
export default function Tooltip({
  content,
  children,
  delay = 400,
  placement = "top",
  className = "",
  contentClassName = "",
  focusable = true,
}: TooltipProps) {
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [resolvedPlacement, setResolvedPlacement] =
    useState<TooltipPlacement>(placement);

  const clearShowTimer = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const scheduleShow = useCallback(() => {
    clearShowTimer();
    showTimer.current = setTimeout(() => setOpen(true), delay);
  }, [clearShowTimer, delay]);

  const hide = useCallback(() => {
    clearShowTimer();
    setOpen(false);
  }, [clearShowTimer]);

  useEffect(() => () => clearShowTimer(), [clearShowTimer]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !tipRef.current) return;
    const trigger = rootRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    setResolvedPlacement(computePlacement(trigger, tip, placement));
  }, [open, placement, content]);

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex max-w-full ${className}`.trim()}
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={scheduleShow}
      onBlur={hide}
    >
      <span
        tabIndex={focusable ? 0 : undefined}
        className="inline-flex max-w-full outline-none"
        aria-describedby={open ? tooltipId : undefined}
      >
        {children}
      </span>
      <span
        ref={tipRef}
        id={tooltipId}
        role="tooltip"
        className={[
          "pointer-events-none absolute z-30 max-w-xs break-all rounded-md bg-slate-900 px-2.5 py-1.5 font-mono text-xs leading-5 text-white shadow-lg transition-opacity duration-150",
          placementClasses(resolvedPlacement),
          open ? "opacity-100" : "opacity-0",
          contentClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {content}
      </span>
    </span>
  );
}
