"use client";

type ErrorBannerProps = {
  message: string;
  onDismiss?: () => void;
};

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md bg-red-100 p-3 text-sm text-red-700"
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded px-2 py-1 font-semibold text-red-800 hover:bg-red-200"
          aria-label="Dismiss error"
        >
          X
        </button>
      )}
    </div>
  );
}
