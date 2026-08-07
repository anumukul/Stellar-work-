"use client";

import Spinner from "@/components/Spinner";

type LoadingStateProps = {
  text: string;
  className?: string;
  /** Spinner size. Defaults to `"sm"`. */
  size?: "sm" | "md" | "lg" | number;
  /** Spinner color. Defaults to the surrounding text color. */
  color?: string;
};

export default function LoadingState({
  text,
  className,
  size = "sm",
  color,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={className ?? "flex items-center gap-2 text-sm text-slate-700"}
    >
      <Spinner size={size} color={color} label={text} className="shrink-0" />
      <span>{text}</span>
    </div>
  );
}
