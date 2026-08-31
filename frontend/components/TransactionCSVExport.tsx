"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { type HorizonTransaction, exportTransactionsToCSV, triggerCSVDownload, fetchWalletTransactions } from "@/lib/horizon-transactions";
import type { Transaction } from "@/lib/transactions";
import { toXlm } from "@/lib/format";

type ExportSource = "platform" | "wallet";

interface PlatformCSVExportRow {
  date: string;
  type: string;
  amount: string;
  status: string;
  jobId: number;
  counterparty: string;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function buildPlatformExportData(
  txns: Transaction[],
  dateFrom: string,
  dateTo: string,
): PlatformCSVExportRow[] {
  return txns
    .filter((tx) => {
      if (!dateFrom && !dateTo) return true;
      const txDate = formatDate(tx.timestamp).slice(0, 10);
      if (dateFrom && txDate < dateFrom) return false;
      if (dateTo && txDate > dateTo) return false;
      return true;
    })
    .map((tx) => ({
      date: formatDate(tx.timestamp),
      type: tx.type,
      amount: tx.direction === "incoming" ? tx.amountXlm : `-${tx.amountXlm}`,
      status: tx.status,
      jobId: tx.jobId,
      counterparty: tx.counterparty || "",
    }));
}

function platformToCSV(data: PlatformCSVExportRow[]): string {
  const header = "Date,Type,Status,Amount (XLM),Job ID,Counterparty";
  const escapeCSV = (value: string | number) => {
    const str = String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = data.map((j) =>
    [
      escapeCSV(j.date),
      escapeCSV(j.type),
      escapeCSV(j.status),
      escapeCSV(j.amount),
      escapeCSV(j.jobId),
      escapeCSV(j.counterparty),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

export default function TransactionCSVExport({
  platformTransactions,
  wallet,
}: {
  platformTransactions: Transaction[];
  wallet: string;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<ExportSource>("platform");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      
      if (source === "platform") {
        const data = buildPlatformExportData(platformTransactions, dateFrom, dateTo);
        const csvString = platformToCSV(data);
        triggerCSVDownload(csvString, `stellarwork-platform-activity-${timestamp}.csv`);
      } else {
        // Fetch all pages of wallet transactions for the export
        let allTxs: HorizonTransaction[] = [];
        let cursor: string | null = null;
        let hasMore = true;
        
        while (hasMore && allTxs.length < 1000) { // arbitrary limit to prevent infinite loops/memory issues
          const result = await fetchWalletTransactions(wallet, undefined, cursor || undefined, 200);
          
          // filter by date
          const filteredRecords = result.records.filter(tx => {
            if (!dateFrom && !dateTo) return true;
            const txDate = tx.createdAt.slice(0, 10);
            if (dateFrom && txDate < dateFrom) return false;
            if (dateTo && txDate > dateTo) return false;
            return true;
          });
          
          allTxs = [...allTxs, ...filteredRecords];
          
          if (result.nextCursor && result.records.length > 0) {
            cursor = result.nextCursor;
          } else {
            hasMore = false;
          }
        }
        
        const csvString = exportTransactionsToCSV(allTxs);
        triggerCSVDownload(csvString, `stellarwork-wallet-activity-${timestamp}.csv`);
      }
    } catch (e) {
      console.error("Export failed", e);
      alert("Failed to export data. Please try again.");
    } finally {
      setLoading(false);
      close();
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block" onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Export CSV
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
          role="dialog"
          aria-label="Export options"
        >
          <p className="mb-3 text-sm font-semibold">Export Transaction History</p>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Data Source
            </label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="exportSource"
                  value="platform"
                  checked={source === "platform"}
                  onChange={() => setSource("platform")}
                  className="h-4 w-4 text-blue-600"
                />
                Platform Activity
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="exportSource"
                  value="wallet"
                  checked={source === "wallet"}
                  onChange={() => setSource("wallet")}
                  className="h-4 w-4 text-blue-600"
                />
                On-Chain Wallet Activity
              </label>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Generating..." : "Download CSV"}
          </button>
        </div>
      )}
    </div>
  );
}
