"use client";

type LoadingStateProps = {
  text: string;
  className?: string;
};

export default function LoadingState({ text, className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={className ?? "flex items-center gap-2 text-sm text-slate-600"}
    >
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
        aria-hidden="true"
      />
      <span>{text}</span>
    </div>
  );
}
