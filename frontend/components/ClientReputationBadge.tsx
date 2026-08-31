"use client";

import { useEffect, useState } from "react";
import { getClientStats, type ClientStats } from "@/lib/client-reputation";

export default function ClientReputationBadge({ clientAddress }: { clientAddress: string }) {
  const [stats, setStats] = useState<ClientStats | null>(null);

  useEffect(() => {
    let mounted = true;
    getClientStats(clientAddress)
      .then((res) => {
        if (mounted) setStats(res);
      })
      .catch(console.error);
    return () => {
      mounted = false;
    };
  }, [clientAddress]);

  if (!stats) return <span className="inline-block h-5 w-16 animate-pulse rounded bg-slate-200"></span>;

  if (stats.score === null) {
    return (
      <div className="group relative inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        <span>New Client</span>
        <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block">
          Insufficient data (needs 3+ jobs)
          <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-800"></div>
        </div>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 4.5) return "bg-green-100 text-green-800";
    if (score >= 3.5) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className={`group relative inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium cursor-help ${getScoreColor(stats.score)}`}>
      <span>★ {stats.score.toFixed(1)}</span>
      <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-3 py-2 text-xs text-white group-hover:block">
        <p className="mb-1 font-semibold">Client Reputation</p>
        <ul className="text-left font-normal text-slate-200">
          <li>Jobs Posted: {stats.jobsPosted}</li>
          <li>Completed: {stats.jobsCompleted}</li>
          <li>Cancelled: {stats.jobsCancelled}</li>
        </ul>
        <p className="mt-1 border-t border-slate-600 pt-1 text-[10px] text-slate-400">Score based on completion rate</p>
        <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-800"></div>
      </div>
    </div>
  );
}
