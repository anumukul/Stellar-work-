"use client";

import { useEffect, useState } from "react";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STYLES,
  AVAILABILITY_UPDATED_EVENT,
  getEffectiveAvailability,
  loadAvailability,
  type EffectiveAvailabilityStatus,
} from "@/lib/availability";

type AvailabilityIndicatorProps = {
  address: string;
  activeJobCount?: number;
  showLabel?: boolean;
  showOpenToOffers?: boolean;
  className?: string;
};

export default function AvailabilityIndicator({
  address,
  activeJobCount = 0,
  showLabel = true,
  showOpenToOffers = true,
  className = "",
}: AvailabilityIndicatorProps) {
  const [settings, setSettings] = useState(() => loadAvailability(address));

  useEffect(() => {
    setSettings(loadAvailability(address));

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ address?: string }>).detail;
      if (!detail?.address || detail.address === address) {
        setSettings(loadAvailability(address));
      }
    };

    window.addEventListener(AVAILABILITY_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(AVAILABILITY_UPDATED_EVENT, onUpdate);
  }, [address]);

  const status = getEffectiveAvailability(settings.preference, activeJobCount);
  const label = AVAILABILITY_LABELS[status];
  const style = AVAILABILITY_STYLES[status];
  const jobHint =
    status === "busy" && activeJobCount > 0
      ? ` — ${activeJobCount} active job${activeJobCount === 1 ? "" : "s"}`
      : "";

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
        title={`${label}${jobHint}`}
        aria-label={`Freelancer availability: ${label}${jobHint}`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            status === "available"
              ? "bg-emerald-500"
              : status === "busy"
                ? "bg-amber-500"
                : "bg-slate-400"
          }`}
          aria-hidden="true"
        />
        {showLabel && (
          <span>
            {label}
            {status === "busy" && activeJobCount > 0 ? ` (${activeJobCount})` : ""}
          </span>
        )}
      </span>
      {showOpenToOffers && settings.openToOffers && status !== "unavailable" && (
        <span
          className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-200"
          title="Open to offers"
        >
          Open to offers
        </span>
      )}
    </span>
  );
}

export function AvailabilityStatusText({
  status,
  activeJobCount = 0,
}: {
  status: EffectiveAvailabilityStatus;
  activeJobCount?: number;
}) {
  const label = AVAILABILITY_LABELS[status];
  const suffix =
    status === "busy" && activeJobCount > 0
      ? ` (${activeJobCount} active)`
      : "";
  return <>{label}{suffix}</>;
}
