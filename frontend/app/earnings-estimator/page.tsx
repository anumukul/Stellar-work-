"use client";

import { useState, useCallback } from "react";

export type Currency = "XLM" | "USD" | "EUR";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  XLM: "\u20BF",
  USD: "$",
  EUR: "\u20AC",
};

const XLM_TO_USD = 0.12;
const XLM_TO_EUR = 0.11;
const PLATFORM_FEE_BPS = 250;
const HOURS_PER_MONTH = 160;

export function xlmToCurrency(xlm: number, currency: Currency): number {
  if (currency === "XLM") return xlm;
  const usd = xlm * XLM_TO_USD;
  return currency === "USD" ? usd : usd * (XLM_TO_EUR / XLM_TO_USD);
}

export function formatCurrency(amount: number, currency: Currency): string {
  const sym = CURRENCY_SYMBOLS[currency];
  const decimals = currency === "XLM" ? 2 : 2;
  return `${sym}${amount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export interface Scenario {
  id: string;
  label: string;
  jobAmount: number;
  jobsPerMonth: number;
  platformFeeBps: number;
  hoursPerJob: number;
}

export type StorageErrorType =
  | "QuotaExceededError"
  | "SecurityError"
  | "UnknownError";

export interface SaveScenariosResult {
  persisted: boolean;
  errorType: StorageErrorType | null;
  errorMessage: string | null;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export const SCENARIOS_KEY = "stellarwork:earnings-scenarios";

export function classifyStorageError(error: unknown): {
  errorType: StorageErrorType;
  errorMessage: string;
} {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota/i.test(name) ||
    /quota/i.test(message)
  ) {
    return {
      errorType: "QuotaExceededError",
      errorMessage:
        "Browser storage is full (QuotaExceededError). Your scenario changes remain available in memory for this session, but could not be saved locally.",
    };
  }

  if (
    name === "SecurityError" ||
    /security/i.test(name) ||
    /security|denied|access|blocked/i.test(message)
  ) {
    return {
      errorType: "SecurityError",
      errorMessage:
        "Browser storage access is blocked (SecurityError). Your scenario changes remain available in memory for this session, but could not be persisted.",
    };
  }

  return {
    errorType: "UnknownError",
    errorMessage:
      "Could not save scenarios to browser storage. Your scenario changes remain available in memory for this session.",
  };
}

export function loadScenarios(): Scenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
}

export function saveScenarios(scenarios: Scenario[]): SaveScenariosResult {
  if (typeof window === "undefined") {
    return { persisted: true, errorType: null, errorMessage: null };
  }
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    return { persisted: true, errorType: null, errorMessage: null };
  } catch (err) {
    const { errorType, errorMessage } = classifyStorageError(err);
    return {
      persisted: false,
      errorType,
      errorMessage,
    };
  }
}

function EarningsCard({ scenario, currency }: { scenario: Scenario; currency: Currency }) {
  const grossMonthly = scenario.jobAmount * scenario.jobsPerMonth;
  const feeFraction = scenario.platformFeeBps / 10000;
  const feesMonthly = grossMonthly * feeFraction;
  const netMonthly = grossMonthly - feesMonthly;
  const totalHours = scenario.hoursPerJob * scenario.jobsPerMonth;
  const hourlyRate = totalHours > 0 ? netMonthly / totalHours : 0;
  const annualProjection = netMonthly * 12;

  const grossC = xlmToCurrency(grossMonthly, currency);
  const feesC = xlmToCurrency(feesMonthly, currency);
  const netC = xlmToCurrency(netMonthly, currency);
  const hourlyC = xlmToCurrency(hourlyRate, currency);
  const annualC = xlmToCurrency(annualProjection, currency);

  const feePct = scenario.platformFeeBps / 100;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{scenario.label}</h3>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-400">Monthly Gross</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(grossC, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Platform Fees ({feePct}%)</p>
          <p className="text-lg font-bold text-rose-600">{formatCurrency(feesC, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Net Earnings</p>
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(netC, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Hourly Rate</p>
          <p className="text-lg font-bold text-blue-600">{formatCurrency(hourlyC, currency)}/hr</p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs text-slate-400">Annual Projection</p>
        <p className="text-xl font-bold text-slate-900">{formatCurrency(annualC, currency)}</p>
      </div>

      <div className="mt-4">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${(netMonthly / grossMonthly) * 100}%` }}
          />
          <div
            className="bg-rose-400 transition-all"
            style={{ width: `${(feesMonthly / grossMonthly) * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Net</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Fees</span>
        </div>
      </div>
    </div>
  );
}

export default function EarningsEstimatorPage() {
  const [jobAmount, setJobAmount] = useState(200);
  const [jobsPerMonth, setJobsPerMonth] = useState(5);
  const [platformFeeBps, setPlatformFeeBps] = useState(PLATFORM_FEE_BPS);
  const [hoursPerJob, setHoursPerJob] = useState(10);
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [scenarios, setScenarios] = useState<Scenario[]>(loadScenarios);
  const [scenarioLabel, setScenarioLabel] = useState("");
  const [persistenceFailure, setPersistenceFailure] =
    useState<SaveScenariosResult | null>(null);
  const [exportedJson, setExportedJson] = useState<string | null>(null);

  const currentScenario: Scenario = {
    id: "current",
    label: "Current",
    jobAmount,
    jobsPerMonth,
    platformFeeBps,
    hoursPerJob,
  };

  const applySaveResult = useCallback((result: SaveScenariosResult) => {
    if (result.persisted) {
      setPersistenceFailure(null);
      setExportedJson(null);
    } else {
      setPersistenceFailure(result);
    }
  }, []);

  const saveCurrentScenario = useCallback(() => {
    const label = scenarioLabel.trim() || `Scenario ${scenarios.length + 1}`;
    const newScenario: Scenario = {
      id: generateId(),
      label,
      jobAmount,
      jobsPerMonth,
      platformFeeBps,
      hoursPerJob,
    };
    const updated = [...scenarios, newScenario];
    setScenarios(updated);
    setScenarioLabel("");
    const result = saveScenarios(updated);
    applySaveResult(result);
  }, [
    scenarioLabel,
    scenarios,
    jobAmount,
    jobsPerMonth,
    platformFeeBps,
    hoursPerJob,
    applySaveResult,
  ]);

  const deleteScenario = useCallback(
    (id: string) => {
      const updated = scenarios.filter((s) => s.id !== id);
      setScenarios(updated);
      const result = saveScenarios(updated);
      applySaveResult(result);
    },
    [scenarios, applySaveResult],
  );

  const retryPersistScenarios = useCallback(() => {
    const result = saveScenarios(scenarios);
    applySaveResult(result);
  }, [scenarios, applySaveResult]);

  const exportScenariosJson = useCallback(() => {
    const json = JSON.stringify(scenarios, null, 2);
    setExportedJson(json);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(json).catch(() => {});
      }
    } catch {
      // Ignore clipboard failures; exportedJson is also displayed for manual copy
    }
  }, [scenarios]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Earnings Estimator</h1>
        <p className="text-sm text-slate-500">
          Estimate your potential earnings based on job frequency, rates, and platform fees.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Calculator</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Average Job Amount (XLM)</label>
            <input
              type="number"
              min={1}
              value={jobAmount}
              onChange={(e) => setJobAmount(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Jobs per Month</label>
            <input
              type="number"
              min={1}
              max={50}
              value={jobsPerMonth}
              onChange={(e) => setJobsPerMonth(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-xs text-slate-400">1-50</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Platform Fee (basis points)</label>
            <input
              type="number"
              min={0}
              max={10000}
              value={platformFeeBps}
              onChange={(e) => setPlatformFeeBps(Math.min(10000, Math.max(0, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Hours per Job</label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={hoursPerJob}
              onChange={(e) => setHoursPerJob(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700">Currency</label>
          <div className="mt-1 flex gap-2">
            {(["XLM", "USD", "EUR"] as Currency[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  currency === c
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {CURRENCY_SYMBOLS[c]} {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <EarningsCard scenario={currentScenario} currency={currency} />

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Compare Scenarios</h2>
            <p className="mt-1 text-sm text-slate-500">
              Save different scenarios to compare earnings side by side.
            </p>
          </div>
          {persistenceFailure && (
            <span
              data-testid="unsaved-scenarios-badge"
              className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
            >
              Unsaved (in-memory only)
            </span>
          )}
        </div>

        {persistenceFailure && (
          <div
            role="alert"
            data-testid="scenario-persistence-alert"
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p className="font-medium">
              {persistenceFailure.errorMessage}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="retry-persist-scenarios"
                onClick={retryPersistScenarios}
                className="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900"
              >
                Retry Save
              </button>
              <button
                type="button"
                data-testid="export-scenarios-json"
                onClick={exportScenariosJson}
                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Export JSON
              </button>
            </div>
            {exportedJson && (
              <pre
                data-testid="exported-scenarios-json"
                className="mt-3 max-h-40 overflow-auto rounded border border-amber-200 bg-white p-2 font-mono text-xs text-slate-800"
              >
                {exportedJson}
              </pre>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={scenarioLabel}
            onChange={(e) => setScenarioLabel(e.target.value)}
            placeholder="Scenario label..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={saveCurrentScenario}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Save Scenario
          </button>
        </div>

        {scenarios.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No saved scenarios yet. Adjust the calculator above and save a scenario to compare.
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {scenarios.map((s) => (
              <div key={s.id} className="relative">
                <button
                  type="button"
                  onClick={() => deleteScenario(s.id)}
                  className="absolute right-2 top-2 text-xs text-slate-400 hover:text-red-600"
                  aria-label={`Delete ${s.label}`}
                >
                  Remove
                </button>
                <EarningsCard scenario={s} currency={currency} />
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Based on real platform data. Estimates are for illustration only and do not guarantee actual earnings.
        Exchange rates: 1 XLM = ${XLM_TO_USD} USD / {XLM_TO_EUR} EUR (simulated).
      </p>
    </div>
  );
}
