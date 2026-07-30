"use client";

import { useEffect, useMemo, useState } from "react";

interface DeadlineCountdownProps {
  deadline: string;
}

function getDeadlineDisplay(deadline: string, now: number) {
  if (!deadline || deadline === "0") {
    return null;
  }

  const deadlineMs = Number(deadline) * 1000;
  if (!Number.isFinite(deadlineMs)) {
    return null;
  }

  const remainingMs = deadlineMs - now;
  const isExpired = remainingMs <= 0;

  if (isExpired) {
    return {
      label: "Expired",
      tone: "text-red-700 bg-red-50 ring-red-200",
      dot: "bg-red-500",
      exact: new Date(deadlineMs).toLocaleString(),
    };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);

  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
  ].filter(Boolean) as string[];

  const label = parts.length > 0 ? `${parts.join(" ")} remaining` : "Less than 1m remaining";
  const tone = days > 3 ? "text-emerald-700 bg-emerald-50 ring-emerald-200" : days > 0 ? "text-amber-700 bg-amber-50 ring-amber-200" : "text-red-700 bg-red-50 ring-red-200";
  const dot = days > 3 ? "bg-emerald-500" : days > 0 ? "bg-amber-500" : "bg-red-500";

  return {
    label,
    tone,
    dot,
    exact: new Date(deadlineMs).toLocaleString(),
  };
}

export default function DeadlineCountdown({ deadline }: DeadlineCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const display = useMemo(() => getDeadlineDisplay(deadline, now), [deadline, now]);

  if (!display) return null;

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${display.tone}`} role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${display.dot}`} aria-hidden="true" />
      <span>{display.label}</span>
      <span className="opacity-70">{display.exact}</span>
    </div>
  );
}
