"use client";

import { usePresence, type PresenceStatus } from "@/lib/presence";

interface PresenceIndicatorProps {
  address: string | null;
  showLabel?: boolean;
}

const STATUS_COLORS: Record<PresenceStatus, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  offline: "bg-slate-400",
  unknown: "",
};

const STATUS_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  offline: "Offline",
  unknown: "",
};

export default function PresenceIndicator({ address, showLabel = false }: PresenceIndicatorProps) {
  const { status, lastSeen } = usePresence(address);

  if (status === "unknown" || !address) return null;

  const dotColor = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  const tooltip = lastSeen ? `Last seen ${lastSeen}` : label;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={tooltip}
      aria-label={tooltip}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor} ring-2 ring-white`}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="text-xs text-slate-500">{label}</span>
      )}
    </span>
  );
}
