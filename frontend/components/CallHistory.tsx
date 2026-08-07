"use client";

import { useEffect, useState } from "react";
import TruncatedAddress from "@/components/TruncatedAddress";
import { loadCallHistory, type CallRecord } from "@/lib/calling";

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min > 0) return `${min}m ${s}s`;
  return `${s}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface CallHistoryProps {
  peerAddress: string;
}

export default function CallHistory({ peerAddress }: CallHistoryProps) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const all = loadCallHistory();
    const filtered = all.filter((c) => c.peerAddress === peerAddress);
    setCalls(filtered);
  }, [peerAddress]);

  if (calls.length === 0) return null;

  const displayed = showAll ? calls : calls.slice(0, 5);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Call History</h2>
      <ul className="space-y-1" role="list" aria-label="Call history">
        {displayed.map((call) => (
          <li key={call.id} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              {call.type === "video" ? (
                <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h8a2 2 0 002-2zm0 0l4.5 3V7L15 10" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" d="M3.5 16.5c4.5-4.5 12.5-4.5 17 0M5 14c3.5-3 9.5-3 13 0" />
                </svg>
              )}
              <span>
                {call.status === "missed" ? "Missed" : `Connected`}
                {call.duration ? ` (${formatDuration(call.duration)})` : ""}
              </span>
            </div>
            <span className="text-slate-400">{formatTime(call.startedAt)}</span>
          </li>
        ))}
      </ul>
      {calls.length > 5 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Show all ({calls.length} calls)
        </button>
      )}
    </div>
  );
}
