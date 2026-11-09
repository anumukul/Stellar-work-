"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  fetchXlmFiatRates,
  getCachedXlmFiatRates,
  type XlmFiatRateCache,
} from "@/lib/format";
import { getPlatformFeeRate } from "@/lib/contract";

type Currency = "XLM" | "USD" | "EUR";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  XLM: "\u20BF",
  USD: "$",
  EUR: "\u20AC",
};

export const FALLBACK_XLM_TO_USD = 0.12;
export const FALLBACK_XLM_TO_EUR = 0.11;
export const FALLBACK_PLATFORM_FEE_BPS = 250;
const HOURS_PER_MONTH = 160;

interface ExchangeRates {
  USD: number;
  EUR: number;
}

type RateSourceState = "loading" | "live" | "cached" | "fallback";
type FeeSourceState = "loading" | "contract" | "fallback";

function hasValidUsdEurRates(
  cache: XlmFiatRateCache | null | undefined,
): cache is XlmFiatRateCache & { rates: { USD: number; EUR: number } } {
  return Boolean(
    cache &&
      typeof cache.fetchedAt === "number" &&
      Number.isFinite(cache.fetchedAt) &&
      typeof cache.rates?.USD === "number" &&
      Number.isFinite(cache.rates.USD) &&
      cache.rates.USD > 0 &&
      typeof cache.rates?.EUR === "number" &&
      Number.isFinite(cache.rates.EUR) &&
      cache.rates.EUR > 0,
  );
}

function formatTimestamp(ts: number | null): string {
  if (!ts || !Number.isFinite(ts)) return "";
  try {
    return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return "";
  }
}

function xlmToCurrency(
  xlm: number,
  currency: Currency,
  rates: ExchangeRates,
): number {
  if (currency === "XLM") return xlm;
  return currency === "USD" ? xlm * rates.USD : xlm * rates.EUR;
}

function formatCurrency(amount: number, currency: Currency): string {
  const sym = CURRENCY_SYMBOLS[currency];
  const decimals = currency === "XLM" ? 2 : 2;
  return `${sym}${amount.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

interface Scenario {
  id: string;
  label: string;
  jobAmount: number;
  jobsPerMonth: number;
  platformFeeBps: number;
  hoursPerJob: number;
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

function EarningsCard({
  scenario,
  currency,
  rates,
  isFallbackRate,
}: {
  scenario: Scenario;
  currency: Currency;
  rates: ExchangeRates;
  isFallbackRate: boolean;
}) {
  const grossMonthly = scenario.jobAmount * scenario.jobsPerMonth;
  const feeFraction = scenario.platformFeeBps / 10000;
  const feesMonthly = grossMonthly * feeFraction;
  const netMonthly = grossMonthly - feesMonthly;
  const totalHours = scenario.hoursPerJob * scenario.jobsPerMonth;
  const hourlyRate = totalHours > 0 ? netMonthly / totalHours : 0;
  const annualProjection = netMonthly * 12;

  const grossC = xlmToCurrency(grossMonthly, currency, rates);
  const feesC = xlmToCurrency(feesMonthly, currency, rates);
  const netC = xlmToCurrency(netMonthly, currency, rates);
  const hourlyC = xlmToCurrency(hourlyRate, currency, rates);
  const annualC = xlmToCurrency(annualProjection, currency, rates);

  const feePct = scenario.platformFeeBps / 100;
  const showFiatFallbackWarning = currency !== "XLM" && isFallbackRate;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {scenario.label}
        </h3>
        {showFiatFallbackWarning && (
          <span
            data-testid="card-fallback-rate-estimate"
            className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
          >
            Est. (fallback {currency} rate)
          </span>
        )}
      </div>

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
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Net
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-400" /> Fees
          </span>
        </div>
      </div>
    </div>
  );
}

export default function EarningsEstimatorPage() {
  const initialCachedRates = getCachedXlmFiatRates();
  const hasInitialCache = hasValidUsdEurRates(initialCachedRates);

  const [jobAmount, setJobAmount] = useState(200);
  const [jobsPerMonth, setJobsPerMonth] = useState(5);
  const [platformFeeBps, setPlatformFeeBps] = useState(FALLBACK_PLATFORM_FEE_BPS);
  const [hoursPerJob, setHoursPerJob] = useState(10);
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [scenarios, setScenarios] = useState<Scenario[]>(loadScenarios);
  const [scenarioLabel, setScenarioLabel] = useState("");

  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>(() =>
    hasInitialCache
      ? {
          USD: initialCachedRates.rates.USD,
          EUR: initialCachedRates.rates.EUR,
        }
      : {
          USD: FALLBACK_XLM_TO_USD,
          EUR: FALLBACK_XLM_TO_EUR,
        },
  );
  const [rateSource, setRateSource] = useState<RateSourceState>(
    hasInitialCache ? "cached" : "loading",
  );
  const [ratesFetchedAt, setRatesFetchedAt] = useState<number | null>(
    hasInitialCache ? initialCachedRates.fetchedAt : null,
  );

  const [contractFeeBps, setContractFeeBps] = useState<number | null>(null);
  const [feeSource, setFeeSource] = useState<FeeSourceState>("loading");
  const [feeFetchedAt, setFeeFetchedAt] = useState<number | null>(null);
  const [isFeeOverridden, setIsFeeOverridden] = useState(false);
  const isFeeOverriddenRef = useRef(false);

  const loadMarketData = useCallback(async () => {
    setRateSource((prev) => (prev === "cached" ? "cached" : "loading"));
    setFeeSource("loading");

    const [rateResult, feeResult] = await Promise.allSettled([
      fetchXlmFiatRates(),
      getPlatformFeeRate(),
    ]);

    if (rateResult.status === "fulfilled" && hasValidUsdEurRates(rateResult.value)) {
      setExchangeRates({
        USD: rateResult.value.rates.USD,
        EUR: rateResult.value.rates.EUR,
      });
      setRatesFetchedAt(rateResult.value.fetchedAt);
      setRateSource("live");
    } else {
      const cached = getCachedXlmFiatRates();
      if (hasValidUsdEurRates(cached)) {
        setExchangeRates({
          USD: cached.rates.USD,
          EUR: cached.rates.EUR,
        });
        setRatesFetchedAt(cached.fetchedAt);
        setRateSource("cached");
      } else {
        setExchangeRates({
          USD: FALLBACK_XLM_TO_USD,
          EUR: FALLBACK_XLM_TO_EUR,
        });
        setRatesFetchedAt(null);
        setRateSource("fallback");
      }
    }

    if (
      feeResult.status === "fulfilled" &&
      typeof feeResult.value === "number" &&
      Number.isFinite(feeResult.value) &&
      feeResult.value >= 0 &&
      feeResult.value <= 10000
    ) {
      const liveFee = Math.round(feeResult.value);
      setContractFeeBps(liveFee);
      setFeeFetchedAt(Date.now());
      setFeeSource("contract");
      if (!isFeeOverriddenRef.current) {
        setPlatformFeeBps(liveFee);
      }
    } else {
      setContractFeeBps(null);
      setFeeFetchedAt(null);
      setFeeSource("fallback");
      if (!isFeeOverriddenRef.current) {
        setPlatformFeeBps(FALLBACK_PLATFORM_FEE_BPS);
      }
    }
  }, []);

  useEffect(() => {
    void loadMarketData();
  }, [loadMarketData]);

  const handleFeeInputChange = useCallback((rawValue: string) => {
    const nextFee = Math.min(10000, Math.max(0, Number(rawValue) || 0));
    isFeeOverriddenRef.current = true;
    setIsFeeOverridden(true);
    setPlatformFeeBps(nextFee);
  }, []);

  const handleResetFeeOverride = useCallback(() => {
    isFeeOverriddenRef.current = false;
    setIsFeeOverridden(false);
    setPlatformFeeBps(contractFeeBps ?? FALLBACK_PLATFORM_FEE_BPS);
  }, [contractFeeBps]);

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

  const deleteScenario = useCallback(
    (id: string) => {
      const updated = scenarios.filter((s) => s.id !== id);
      setScenarios(updated);
      saveScenarios(updated);
    },
    [scenarios],
  );

  const isLoadingMarketData = rateSource === "loading" || feeSource === "loading";
  const isFallbackRate = rateSource === "fallback";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Earnings Estimator</h1>
        <p className="text-sm text-slate-500">
          Estimate your potential earnings based on job frequency, rates, and platform fees.
        </p>
      </div>

      <div
        data-testid="market-data-status"
        className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-800">Marketplace Fee &amp; Rate Sources</span>
          {isLoadingMarketData && (
            <span
              data-testid="market-data-loading"
              className="rounded-full bg-blue-100 px-2.5 py-0.5 font-medium text-blue-800"
            >
              Loading live fee and exchange rates...
            </span>
          )}
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div data-testid="exchange-rate-source" className="space-y-1">
            <span className="font-medium text-slate-700">Exchange Rates: </span>
            {rateSource === "loading" ? (
              <span>Fetching live XLM/USD and XLM/EUR rates...</span>
            ) : rateSource === "fallback" ? (
              <span
                data-testid="exchange-rate-fallback-badge"
                className="font-medium text-amber-700"
              >
                Fallback estimate (rate feed unavailable): 1 XLM ≈ ${exchangeRates.USD} USD /{" "}
                &euro;{exchangeRates.EUR} EUR
              </span>
            ) : (
              <span className="text-emerald-700">
                Live ({rateSource}): 1 XLM = ${exchangeRates.USD} USD / &euro;{exchangeRates.EUR}{" "}
                EUR
                {ratesFetchedAt && (
                  <span
                    data-testid="exchange-rate-timestamp"
                    className="ml-1 text-slate-500"
                  >
                    (as of {formatTimestamp(ratesFetchedAt)})
                  </span>
                )}
              </span>
            )}
          </div>

          <div data-testid="platform-fee-source" className="space-y-1">
            <span className="font-medium text-slate-700">Platform Fee: </span>
            {feeSource === "loading" ? (
              <span>Fetching contract fee rate...</span>
            ) : feeSource === "contract" && contractFeeBps !== null ? (
              <span className="text-emerald-700">
                Live contract fee: {contractFeeBps} bps ({(contractFeeBps / 100).toFixed(2)}%)
                {feeFetchedAt && (
                  <span
                    data-testid="platform-fee-timestamp"
                    className="ml-1 text-slate-500"
                  >
                    (as of {formatTimestamp(feeFetchedAt)})
                  </span>
                )}
              </span>
            ) : (
              <span
                data-testid="platform-fee-fallback-badge"
                className="font-medium text-amber-700"
              >
                Fallback estimate (contract fee unavailable): {FALLBACK_PLATFORM_FEE_BPS} bps (
                {(FALLBACK_PLATFORM_FEE_BPS / 100).toFixed(2)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Calculator</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Average Job Amount (XLM)
            </label>
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
              onChange={(e) =>
                setJobsPerMonth(Math.min(50, Math.max(1, Number(e.target.value) || 1)))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-xs text-slate-400">1-50</p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-slate-700">
                Platform Fee (basis points)
              </label>
              {isFeeOverridden && (
                <span
                  data-testid="fee-override-badge"
                  className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                >
                  User override
                </span>
              )}
            </div>
            <input
              type="number"
              min={0}
              max={10000}
              value={platformFeeBps}
              onChange={(e) => handleFeeInputChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {isFeeOverridden && (
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {contractFeeBps !== null
                    ? `Live contract rate: ${contractFeeBps} bps`
                    : `Fallback estimate: ${FALLBACK_PLATFORM_FEE_BPS} bps`}
                </span>
                <button
                  type="button"
                  data-testid="reset-fee-override"
                  onClick={handleResetFeeOverride}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Use {contractFeeBps !== null ? "contract" : "default"} fee
                </button>
              </div>
            )}
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

      <EarningsCard
        scenario={currentScenario}
        currency={currency}
        rates={exchangeRates}
        isFallbackRate={isFallbackRate}
      />

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
                <EarningsCard
                  scenario={s}
                  currency={currency}
                  rates={exchangeRates}
                  isFallbackRate={isFallbackRate}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Based on real platform data. Estimates are for illustration only and do not guarantee actual
        earnings.{" "}
        {rateSource === "fallback"
          ? `Exchange rates: 1 XLM ≈ $${exchangeRates.USD} USD / €${exchangeRates.EUR} EUR (fallback estimate — live feed unavailable).`
          : `Exchange rates: 1 XLM = $${exchangeRates.USD} USD / €${exchangeRates.EUR} EUR (${rateSource}).`}
      </p>
    </div>
  );
}
