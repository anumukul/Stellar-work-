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

export const SCENARIOS_KEY = "stellarwork:earnings-scenarios";
export const SCENARIOS_SCHEMA_VERSION = 1;
export const MAX_SAVED_SCENARIOS = 20;

export const MIN_JOB_AMOUNT = 0;
export const MAX_JOB_AMOUNT = 100_000_000;
export const MIN_JOBS_PER_MONTH = 1;
export const MAX_JOBS_PER_MONTH = 50;
export const MIN_PLATFORM_FEE_BPS = 0;
export const MAX_PLATFORM_FEE_BPS = 10_000;
export const MIN_HOURS_PER_JOB = 0.5;
export const MAX_HOURS_PER_JOB = 1_000;
export const MAX_SCENARIO_LABEL_LENGTH = 80;

export function xlmToCurrency(xlm: number, currency: Currency): number {
  if (currency === "XLM") return xlm;
  const usd = xlm * XLM_TO_USD;
  return currency === "USD" ? usd : usd * (XLM_TO_EUR / XLM_TO_USD);
}

export function formatCurrency(amount: number, currency: Currency): string {
  const sym = CURRENCY_SYMBOLS[currency];
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const decimals = currency === "XLM" ? 2 : 2;
  return `${sym}${safeAmount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export interface Scenario {
  id: string;
  label: string;
  jobAmount: number;
  jobsPerMonth: number;
  platformFeeBps: number;
  hoursPerJob: number;
}

export interface PersistedScenariosEnvelope {
  version: number;
  scenarios: Scenario[];
}

export interface LoadScenariosResult {
  scenarios: Scenario[];
  migrated: boolean;
  droppedCount: number;
  recoveryNotice: string | null;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function validateScenarioRecord(entry: unknown, index = 0): Scenario | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const record = entry as Record<string, unknown>;

  if (typeof record.label !== "string") {
    return null;
  }
  const trimmedLabel = record.label.trim().slice(0, MAX_SCENARIO_LABEL_LENGTH);
  if (!trimmedLabel) {
    return null;
  }

  let resolvedId: string;
  if (typeof record.id === "string" && record.id.trim().length > 0) {
    resolvedId = record.id.trim();
  } else if (record.id === undefined) {
    resolvedId = `legacy-${index}-${generateId()}`;
  } else {
    return null;
  }

  if (
    !isFiniteInRange(record.jobAmount, MIN_JOB_AMOUNT, MAX_JOB_AMOUNT) ||
    !isFiniteInRange(record.jobsPerMonth, MIN_JOBS_PER_MONTH, MAX_JOBS_PER_MONTH) ||
    !isFiniteInRange(record.platformFeeBps, MIN_PLATFORM_FEE_BPS, MAX_PLATFORM_FEE_BPS) ||
    !isFiniteInRange(record.hoursPerJob, MIN_HOURS_PER_JOB, MAX_HOURS_PER_JOB)
  ) {
    return null;
  }

  return {
    id: resolvedId,
    label: trimmedLabel,
    jobAmount: record.jobAmount,
    jobsPerMonth: record.jobsPerMonth,
    platformFeeBps: record.platformFeeBps,
    hoursPerJob: record.hoursPerJob,
  };
}

function sanitizeScenarioArray(rawItems: unknown[]): {
  scenarios: Scenario[];
  droppedCount: number;
} {
  const valid: Scenario[] = [];
  const seenIds = new Set<string>();
  let droppedCount = 0;

  rawItems.forEach((item, idx) => {
    const validated = validateScenarioRecord(item, idx);
    if (!validated) {
      droppedCount += 1;
      return;
    }
    if (valid.length >= MAX_SAVED_SCENARIOS) {
      droppedCount += 1;
      return;
    }
    let uniqueId = validated.id;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${validated.id}-${generateId()}`;
    }
    seenIds.add(uniqueId);
    valid.push({ ...validated, id: uniqueId });
  });

  return { scenarios: valid, droppedCount };
}

export function saveScenarios(scenarios: Scenario[]): void {
  const { scenarios: valid } = sanitizeScenarioArray(scenarios);
  const envelope: PersistedScenariosEnvelope = {
    version: SCENARIOS_SCHEMA_VERSION,
    scenarios: valid,
  };
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(envelope));
  } catch {
    // Ignore storage write errors during background migration/persistence
  }
}

export function loadScenariosWithMeta(): LoadScenariosResult {
  if (typeof window === "undefined") {
    return { scenarios: [], migrated: false, droppedCount: 0, recoveryNotice: null };
  }

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SCENARIOS_KEY);
  } catch {
    return { scenarios: [], migrated: false, droppedCount: 0, recoveryNotice: null };
  }

  if (!raw) {
    return { scenarios: [], migrated: false, droppedCount: 0, recoveryNotice: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    saveScenarios([]);
    return {
      scenarios: [],
      migrated: false,
      droppedCount: 1,
      recoveryNotice: "Corrupted saved scenarios were reset.",
    };
  }

  // Legacy unversioned array format -> migrate to versioned envelope
  if (Array.isArray(parsed)) {
    const { scenarios, droppedCount } = sanitizeScenarioArray(parsed);
    saveScenarios(scenarios);
    return {
      scenarios,
      migrated: true,
      droppedCount,
      recoveryNotice:
        droppedCount > 0
          ? `Recovered ${scenarios.length} valid scenario(s) and skipped ${droppedCount} invalid record(s).`
          : null,
    };
  }

  // Versioned envelope format
  if (parsed && typeof parsed === "object") {
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.version === "number" &&
      Array.isArray(candidate.scenarios)
    ) {
      if (candidate.version !== SCENARIOS_SCHEMA_VERSION) {
        saveScenarios([]);
        return {
          scenarios: [],
          migrated: false,
          droppedCount: candidate.scenarios.length || 1,
          recoveryNotice: `Saved scenarios used unsupported version v${String(candidate.version)} and were reset.`,
        };
      }

      const { scenarios, droppedCount } = sanitizeScenarioArray(candidate.scenarios);
      if (droppedCount > 0) {
        saveScenarios(scenarios);
      }
      return {
        scenarios,
        migrated: false,
        droppedCount,
        recoveryNotice:
          droppedCount > 0
            ? `Skipped ${droppedCount} invalid saved scenario record(s).`
            : null,
      };
    }
  }

  // Arbitrary object or primitive in place of array/envelope
  saveScenarios([]);
  return {
    scenarios: [],
    migrated: false,
    droppedCount: 1,
    recoveryNotice: "Invalid saved scenario data was reset.",
  };
}

export function loadScenarios(): Scenario[] {
  return loadScenariosWithMeta().scenarios;
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
  const netWidthPct = grossMonthly > 0 ? (netMonthly / grossMonthly) * 100 : 0;
  const feeWidthPct = grossMonthly > 0 ? (feesMonthly / grossMonthly) * 100 : 0;

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
            style={{ width: `${netWidthPct}%` }}
          />
          <div
            className="bg-rose-400 transition-all"
            style={{ width: `${feeWidthPct}%` }}
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
  const [initialLoad] = useState<LoadScenariosResult>(loadScenariosWithMeta);
  const [jobAmount, setJobAmount] = useState(200);
  const [jobsPerMonth, setJobsPerMonth] = useState(5);
  const [platformFeeBps, setPlatformFeeBps] = useState(PLATFORM_FEE_BPS);
  const [hoursPerJob, setHoursPerJob] = useState(10);
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [scenarios, setScenarios] = useState<Scenario[]>(initialLoad.scenarios);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(
    initialLoad.recoveryNotice,
  );
  const [scenarioLabel, setScenarioLabel] = useState("");

  const currentScenario: Scenario = {
    id: "current",
    label: "Current",
    jobAmount,
    jobsPerMonth,
    platformFeeBps,
    hoursPerJob,
  };

  const saveCurrentScenario = useCallback(() => {
    if (scenarios.length >= MAX_SAVED_SCENARIOS) {
      setRecoveryNotice(
        `Maximum of ${MAX_SAVED_SCENARIOS} saved scenarios reached. Remove an existing scenario before saving another.`,
      );
      return;
    }
    const label = scenarioLabel.trim() || `Scenario ${scenarios.length + 1}`;
    const candidate = validateScenarioRecord({
      id: generateId(),
      label,
      jobAmount,
      jobsPerMonth,
      platformFeeBps,
      hoursPerJob,
    });
    if (!candidate) {
      setRecoveryNotice("Cannot save scenario: one or more calculator inputs are out of range.");
      return;
    }
    const updated = [...scenarios, candidate];
    setScenarios(updated);
    saveScenarios(updated);
    setScenarioLabel("");
  }, [scenarioLabel, scenarios, jobAmount, jobsPerMonth, platformFeeBps, hoursPerJob]);

  const deleteScenario = useCallback((id: string) => {
    const updated = scenarios.filter((s) => s.id !== id);
    setScenarios(updated);
    saveScenarios(updated);
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
        <h2 className="text-lg font-semibold text-slate-900">Compare Scenarios</h2>
        <p className="mt-1 text-sm text-slate-500">
          Save different scenarios to compare earnings side by side.
        </p>

        {recoveryNotice && (
          <div
            role="status"
            data-testid="scenarios-recovery-notice"
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {recoveryNotice}
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
