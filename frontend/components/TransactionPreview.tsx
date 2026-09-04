"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import { computeFeeRatio, type FeeEstimate } from "@/lib/fee-estimator";
import { feeToXlm } from "@/lib/horizon-transactions";

/**
 * Map a `FeeEstimate` from `lib/fee-estimator` into this component's display
 * shape (XLM + USD, base/computation breakdown, recent-fee comparison and the
 * high-fee warning).
 */
export function feeEstimateToSimulation(estimate: FeeEstimate): SimulationResult {
  const { breakdown } = estimate;
  return {
    fee: estimate.feeXlm,
    feeUsd: estimate.feeUsd ?? undefined,
    feeBreakdown: {
      baseFeeXlm: feeToXlm(breakdown.baseFeeStroops.toString()),
      computationFeeXlm: feeToXlm(breakdown.resourceFeeStroops.toString()),
      totalFeeXlm: feeToXlm(breakdown.totalFeeStroops.toString()),
    },
    recentComparison: estimate.recentComparison
      ? {
          count: estimate.recentComparison.count,
          averageFeeXlm: feeToXlm(estimate.recentComparison.averageFeeStroops.toString()),
          ratioToAverage: computeFeeRatio(
            breakdown.totalFeeStroops,
            estimate.recentComparison,
          ),
        }
      : null,
    highFeeWarning: estimate.highFeeWarning,
    stateChanges: [],
    simulatedAt: estimate.simulatedAt,
  };
}

export interface FeeBreakdownDisplay {
  /** Classic base fee in XLM (e.g. "0.0000100"). */
  baseFeeXlm: string;
  /** Soroban computation fee in XLM (e.g. "0.0011900"). */
  computationFeeXlm: string;
  /** Total in XLM. */
  totalFeeXlm: string;
}

export interface RecentFeeComparisonDisplay {
  /** Number of recent transactions used for the comparison. */
  count: number;
  /** Average fee of those transactions in XLM. */
  averageFeeXlm: string;
  /** Estimate relative to the average: 1 = same, 1.5 = 50% higher. */
  ratioToAverage: number | null;
}

export interface SimulationResult {
  fee: string;
  /** Estimated fee in fiat (e.g. "$0.31"), when exchange rates are available. */
  feeUsd?: string;
  /** Optional fee breakdown (base + computation). */
  feeBreakdown?: FeeBreakdownDisplay | null;
  /** Comparison against the wallet's recent on-chain fees. */
  recentComparison?: RecentFeeComparisonDisplay | null;
  /** Set when the estimate is unusually high. */
  highFeeWarning?: string | null;
  stateChanges: string[];
  balanceBefore?: string;
  balanceAfter?: string;
  error?: string;
  rawXdr?: string;
  simulatedAt: number;
}

export interface TransactionPreviewProps {
  operation: string;
  details: string;
  simulation: SimulationResult | null;
  simulating: boolean;
  simulationError?: string;
  /**
   * When true, the "Confirm is disabled until simulation succeeds" note is
   * hidden — the caller still allows submission even if the estimate failed.
   */
  allowSubmitWithoutSimulation?: boolean;
  onReSimulate?: () => void;
}

const STALE_THRESHOLD_MS = 30_000;

export default function TransactionPreview({
  operation,
  details,
  simulation,
  simulating,
  simulationError,
  allowSubmitWithoutSimulation = false,
  onReSimulate,
}: TransactionPreviewProps) {
  const [showRaw, setShowRaw] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [age, setAge] = useState(0);

  useEffect(() => {
    if (!simulation?.simulatedAt) {
      return;
    }
    const update = () => setAge(Date.now() - simulation.simulatedAt);
    update();
    intervalRef.current = setInterval(update, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [simulation?.simulatedAt]);

  const isStale = age > STALE_THRESHOLD_MS;
  const hasError = !!simulationError || !!simulation?.error;

  const formatAge = useCallback((ms: number) => {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Transaction Preview</h3>
        {simulating && <Spinner size={14} color="currentColor" label="Simulating" />}
      </div>

      <div className="mt-2 space-y-1">
        <p className="text-slate-700">
          <span className="font-medium">Operation:</span> {operation}
        </p>
        <p className="text-slate-600">{details}</p>
      </div>

      {simulationError && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-red-700 ring-1 ring-inset ring-red-200">
          <p className="font-medium">Simulation failed</p>
          <p className="mt-1 text-xs">{simulationError}</p>
        </div>
      )}

      {simulation && !simulationError && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-slate-200">
            <span className="text-slate-600">Estimated fee</span>
            <span className="font-medium text-slate-900">
              {simulation.fee} XLM
              {simulation.feeUsd && (
                <span className="ml-1 font-normal text-slate-500">
                  (~{simulation.feeUsd})
                </span>
              )}
            </span>
          </div>

          {simulation.feeBreakdown && (
            <div className="rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-slate-200">
              <p className="mb-1 text-slate-600">Fee breakdown</p>
              <dl className="space-y-1">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">Base fee</dt>
                  <dd className="font-medium text-slate-800">
                    {simulation.feeBreakdown.baseFeeXlm} XLM
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">Computation fee</dt>
                  <dd className="font-medium text-slate-800">
                    {simulation.feeBreakdown.computationFeeXlm} XLM
                  </dd>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-1">
                  <dt className="font-medium text-slate-700">Total</dt>
                  <dd className="font-semibold text-slate-900">
                    {simulation.feeBreakdown.totalFeeXlm} XLM
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {simulation.recentComparison && (
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-slate-200">
              <span className="text-slate-600">
                vs. {simulation.recentComparison.count} recent{" "}
                {simulation.recentComparison.count === 1 ? "transaction" : "transactions"}{" "}
                (avg {simulation.recentComparison.averageFeeXlm} XLM)
              </span>
              <span className="font-medium text-slate-900">
                {simulation.recentComparison.ratioToAverage == null
                  ? "—"
                  : simulation.recentComparison.ratioToAverage > 1
                    ? `+${Math.round((simulation.recentComparison.ratioToAverage - 1) * 100)}% vs avg`
                    : simulation.recentComparison.ratioToAverage < 1
                      ? `${Math.round((simulation.recentComparison.ratioToAverage - 1) * 100)}% vs avg`
                      : "matches avg"}
              </span>
            </div>
          )}

          {simulation.highFeeWarning && (
            <div
              className="rounded-md bg-amber-50 p-3 text-amber-800 ring-1 ring-inset ring-amber-200"
              role="alert"
            >
              <p className="font-medium">Unusually high fee estimate</p>
              <p className="mt-1 text-xs">{simulation.highFeeWarning}</p>
            </div>
          )}

          {simulation.stateChanges.length > 0 && (
            <div className="rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-slate-200">
              <p className="mb-1 text-slate-600">Expected changes</p>
              <ul className="space-y-0.5">
                {simulation.stateChanges.map((change) => (
                  <li key={change} className="flex items-start gap-2 text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {simulation.balanceBefore && simulation.balanceAfter && (
            <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-slate-200">
              <span className="text-slate-600">Balance change</span>
              <span className="font-medium text-slate-900">
                {simulation.balanceBefore} → {simulation.balanceAfter} XLM
              </span>
            </div>
          )}

          {simulation.error && (
            <div className="rounded-md bg-amber-50 p-3 text-amber-700 ring-1 ring-inset ring-amber-200">
              <p className="font-medium">Warning</p>
              <p className="mt-1 text-xs">{simulation.error}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className={`text-xs ${isStale ? "text-amber-600" : "text-slate-400"}`}>
              Simulated {formatAge(age)}
            </span>
            {isStale && onReSimulate && (
              <button
                type="button"
                onClick={onReSimulate}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Re-simulate
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {showRaw ? "Hide" : "Show"} raw XDR
          </button>
          {showRaw && simulation.rawXdr && (
            <pre className="max-h-32 overflow-auto rounded-md bg-slate-900 p-2 text-xs text-slate-100">
              {simulation.rawXdr}
            </pre>
          )}
        </div>
      )}

      {hasError && !allowSubmitWithoutSimulation && (
        <p className="mt-2 text-xs text-red-600">
          Confirm is disabled until simulation succeeds.
        </p>
      )}
    </div>
  );
}
