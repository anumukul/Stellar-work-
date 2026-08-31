"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

type ToastVariant = "success" | "error" | "pending";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showPending: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const idPrefix = useId();

  const dismiss = useCallback((id: string, clearTimer = true) => {
    if (clearTimer) {
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      setToasts((current) => {
        // Check for duplicate toast with same message and variant
        const isDuplicate = current.some(
          (toast) => toast.message === message && toast.variant === variant,
        );
        if (isDuplicate) {
          return current;
        }
        const id = `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          dismiss(id, false);
        }, AUTO_DISMISS_MS);
        timersRef.current.set(id, timer);
        return [...current, { id, message, variant }];
      });
    },
    [dismiss, idPrefix],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      showSuccess: (message: string) => push(message, "success"),
      showError: (message: string) => push(message, "error"),
      showPending: (message: string) => push(message, "pending"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 toast-enter ${
              toast.variant === "success"
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : toast.variant === "pending"
                  ? "bg-blue-50 text-blue-800 ring-blue-200"
                  : "bg-red-50 text-red-800 ring-red-200"
            }`}
          >
            <div className="shrink-0 pt-0.5 text-current" aria-hidden="true">
              {toast.variant === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : toast.variant === "pending" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
            </div>
            <p className="min-w-0 flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              aria-label="Dismiss notification"
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── useToast ────────────────────────────────────────────────────────────────

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
