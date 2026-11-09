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
  const safeXlm = Number.isFinite(xlm) && xlm >= 0 ? xlm : 0;
  if (currency === "XLM") return safeXlm;
  const usd = safeXlm * XLM_TO_USD;
  return currency === "USD" ? usd : usd * (XLM_TO_EUR / XLM_TO_USD);
}

export function formatCurrency(amount: number, currency: Currency): string {
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  const sym = CURRENCY_SYMBOLS[currency];
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

export interface EarningsBreakdown {
  grossMonthly: number;
  feesMonthly: number;
  netMonthly: number;
  hourlyRate: number;
  annualProjection: number;
  feePct: number;
  netWidthPct: number;
  feeWidthPct: number;
  isZeroGross: boolean;
  hasInvalidInput: boolean;
}

export function calculateEarnings(scenario: Scenario): EarningsBreakdown {
  const rawProduct = scenario.jobAmount * scenario.jobsPerMonth;
  const hasInvalidInput =
    !Number.isFinite(scenario.jobAmount) ||
    scenario.jobAmount < 0 ||
    !Number.isFinite(scenario.jobsPerMonth) ||
    scenario.jobsPerMonth < 0 ||
    !Number.isFinite(scenario.platformFeeBps) ||
    scenario.platformFeeBps < 0 ||
    scenario.platformFeeBps > 10000 ||
    !Number.isFinite(scenario.hoursPerJob) ||
    scenario.hoursPerJob < 0 ||
    !Number.isFinite(rawProduct);

  const safeJobAmount =
    Number.isFinite(scenario.jobAmount) && scenario.jobAmount >= 0
      ? scenario.jobAmount
      : 0;
  const safeJobsPerMonth =
    Number.isFinite(scenario.jobsPerMonth) && scenario.jobsPerMonth >= 0
      ? scenario.jobsPerMonth
      : 0;
  const safeFeeBps = Number.isFinite(scenario.platformFeeBps)
    ? Math.min(10000, Math.max(0, scenario.platformFeeBps))
    : 0;
  const safeHoursPerJob =
    Number.isFinite(scenario.hoursPerJob) && scenario.hoursPerJob >= 0
      ? scenario.hoursPerJob
      : 0;

  const rawGross = safeJobAmount * safeJobsPerMonth;
  const grossMonthly =
    Number.isFinite(rawGross) && rawGross > 0 ? rawGross : 0;
  const isZeroGross = grossMonthly <= 0;
  const feeFraction = safeFeeBps / 10000;
  const feesMonthly = isZeroGross ? 0 : grossMonthly * feeFraction;
  const netMonthly = isZeroGross ? 0 : Math.max(0, grossMonthly - feesMonthly);
  const totalHours = safeHoursPerJob * safeJobsPerMonth;
  const hourlyRate =
    !isZeroGross && Number.isFinite(totalHours) && totalHours > 0
      ? netMonthly / totalHours
      : 0;
  const rawAnnual = netMonthly * 12;
  const annualProjection = Number.isFinite(rawAnnual) ? rawAnnual : 0;
  const feePct = safeFeeBps / 100;

  const netWidthPct = isZeroGross
    ? 0
    : Math.min(100, Math.max(0, (netMonthly / grossMonthly) * 100));
  const feeWidthPct = isZeroGross
    ? 0
    : Math.min(100, Math.max(0, (feesMonthly / grossMonthly) * 100));

  return {
    grossMonthly,
    feesMonthly,
    netMonthly,
    hourlyRate,
    annualProjection,
    feePct,
    netWidthPct,
    feeWidthPct,
    isZeroGross,
    hasInvalidInput,
  };
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const SCENARIOS_KEY = "stellarwork:earnings-scenarios";

function loadScenarios(): Scenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
}

function saveScenarios(scenarios: Scenario[]): void {
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
}

export function EarningsCard({
  scenario,
  currency,
}: {
  scenario: Scenario;
  currency: Currency;
}) {
  const {
    grossMonthly,
    feesMonthly,
    netMonthly,
    hourlyRate,
    annualProjection,
    feePct,
    netWidthPct,
    feeWidthPct,
    isZeroGross,
    hasInvalidInput,
  } = calculateEarnings(scenario);

  const grossC = xlmToCurrency(grossMonthly, currency);
  const feesC = xlmToCurrency(feesMonthly, currency);
  const netC = xlmToCurrency(netMonthly, currency);
  const hourlyC = xlmToCurrency(hourlyRate, currency);
  const annualC = xlmToCurrency(annualProjection, currency);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {scenario.label}
      </h3>

      {hasInvalidInput && (
        <p
          role="alert"
          data-testid="invalid-financial-input-notice"
          className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
        >
          Negative or non-finite inputs were clamped to safe bounds.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-400">Monthly Gross</p>
          <p className="text-lg font-bold text-slate-900">
            {formatCurrency(grossC, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Platform Fees ({feePct}%)</p>
          <p className="text-lg font-bold text-rose-600">
            {formatCurrency(feesC, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Net Earnings</p>
          <p className="text-lg font-bold text-emerald-600">
            {formatCurrency(netC, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Hourly Rate</p>
          <p className="text-lg font-bold text-blue-600">
            {formatCurrency(hourlyC, currency)}/hr
          </p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs text-slate-400">Annual Projection</p>
        <p className="text-xl font-bold text-slate-900">
          {formatCurrency(annualC, currency)}
        </p>
      </div>

      <div className="mt-4">
        <div
          className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={
            isZeroGross
              ? "No earnings breakdown for zero gross amount"
              : `Earnings breakdown: ${netWidthPct.toFixed(1)}% net, ${feeWidthPct.toFixed(1)}% fees`
          }
          data-testid="earnings-breakdown-bar"
          data-zero-gross={isZeroGross ? "true" : "false"}
        >
          <div
            data-testid="breakdown-net-bar"
            className="bg-emerald-500 transition-all"
            style={{ width: `${netWidthPct}%` }}
          />
          <div
            data-testid="breakdown-fee-bar"
            className="bg-rose-400 transition-all"
            style={{ width: `${feeWidthPct}%` }}
          />
        </div>
        {isZeroGross && (
          <p
            data-testid="zero-gross-state"
            className="mt-1.5 text-xs text-slate-500"
          >
            No gross earnings to break down — enter a positive job amount to view net vs. fee shares.
          </p>
        )}
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Net ({netWidthPct.toFixed(1)}%)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-400" /> Fees ({feeWidthPct.toFixed(1)}%)
          </span>
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
  const [inputWarning, setInputWarning] = useState<string | null>(null);

  const handleJobAmountChange = (raw: string) => {
    if (raw.trim() === "") {
      setInputWarning(null);
      setJobAmount(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setInputWarning("Negative or non-finite financial values are not allowed.");
      setJobAmount(0);
      return;
    }
    setInputWarning(null);
    setJobAmount(parsed);
  };

  const handleJobsPerMonthChange = (raw: string) => {
    if (raw.trim() === "") {
      setInputWarning(null);
      setJobsPerMonth(1);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setInputWarning("Negative or non-finite financial values are not allowed.");
      setJobsPerMonth(1);
      return;
    }
    setInputWarning(null);
    setJobsPerMonth(Math.min(50, Math.max(1, parsed || 1)));
  };

  const handlePlatformFeeChange = (raw: string) => {
    if (raw.trim() === "") {
      setInputWarning(null);
      setPlatformFeeBps(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setInputWarning("Negative or non-finite financial values are not allowed.");
      setPlatformFeeBps(0);
      return;
    }
    setInputWarning(null);
    setPlatformFeeBps(Math.min(10000, Math.max(0, parsed)));
  };

  const handleHoursPerJobChange = (raw: string) => {
    if (raw.trim() === "") {
      setInputWarning(null);
      setHoursPerJob(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setInputWarning("Negative or non-finite financial values are not allowed.");
      setHoursPerJob(0);
      return;
    }
    setInputWarning(null);
    setHoursPerJob(parsed);
  };

  const currentScenario: Scenario = {
    id: "current",
    label: "Current",
    jobAmount,
    jobsPerMonth,
    platformFeeBps,
    hoursPerJob,
  };

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

        {inputWarning && (
          <p
            role="alert"
            data-testid="calculator-input-warning"
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {inputWarning}
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Average Job Amount (XLM)</label>
            <input
              type="number"
              min={0}
              value={jobAmount}
              onChange={(e) => handleJobAmountChange(e.target.value)}
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
              onChange={(e) => handleJobsPerMonthChange(e.target.value)}
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
              onChange={(e) => handlePlatformFeeChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Hours per Job</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={hoursPerJob}
              onChange={(e) => handleHoursPerJobChange(e.target.value)}
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
