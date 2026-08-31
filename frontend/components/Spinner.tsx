import type { CSSProperties } from "react";

export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerProps = {
  /** Preset size or a pixel value. Defaults to `"md"`. */
  size?: SpinnerSize | number;
  /** CSS color for the spinner stroke. Defaults to `currentColor`. */
  color?: string;
  /** Accessible label announced to assistive tech. Defaults to `"Loading"`. */
  label?: string;
  className?: string;
};

const SIZE_PX: Record<SpinnerSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

/**
 * Reusable animated SVG loading spinner for async operations.
 *
 * Supports configurable size/color and exposes an accessible `aria-label`.
 */
export default function Spinner({
  size = "md",
  color = "currentColor",
  label = "Loading",
  className,
}: SpinnerProps) {
  const px = typeof size === "number" ? size : SIZE_PX[size];
  const style: CSSProperties = { color };

  return (
    <svg
      role="status"
      aria-label={label}
      aria-live="polite"
      aria-busy="true"
      viewBox="0 0 24 24"
      width={px}
      height={px}
      className={`animate-spin ${className ?? ""}`.trim()}
      style={style}
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
