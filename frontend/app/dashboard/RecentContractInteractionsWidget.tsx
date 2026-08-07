"use client";

import SectionCard from "@/components/SectionCard";
import {
  getRecentContractInteractionsEventName,
  loadRecentContractInteractions,
  type RecentContractInteraction,
} from "@/lib/recent-contract-interactions";
import { getExplorerTxUrl } from "@/lib/stellar";
import { useEffect, useState } from "react";

function shortHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function statusClasses(status: RecentContractInteraction["status"]): string {
  if (status === "SUCCESS") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "ERROR") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function RecentContractInteractionsWidget() {
  const [items, setItems] = useState<RecentContractInteraction[]>([]);

  useEffect(() => {
    setItems(loadRecentContractInteractions());

    const eventName = getRecentContractInteractionsEventName();
    const refresh = () => setItems(loadRecentContractInteractions());

    window.addEventListener(eventName, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(eventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <SectionCard className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent Contract Interactions</h2>
        <span className="text-xs text-slate-400">Last {Math.min(5, items.length)}</span>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-4 text-sm text-slate-500">
          No recent contract interactions yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="Recent contract interactions">
          {items.map((item) => (
            <li key={item.hash} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <a
                  href={getExplorerTxUrl(item.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                  title={item.hash}
                >
                  {shortHash(item.hash)}
                </a>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClasses(item.status)}`}
                >
                  {item.status}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                <span>{item.method}</span>
                <span>{new Date(item.timestamp).toLocaleString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
