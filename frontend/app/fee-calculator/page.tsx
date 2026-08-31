"use client";

import { useState } from "react";

const NETWORK_FEE_XLM = 0.0012;
const PLATFORM_FEE_PERCENT = 2.5;
const QUICK_AMOUNTS = [10, 50, 100, 500, 1000];

type FiatCurrency = "USD" | "EUR";
const XLM_TO_FIAT: Record<FiatCurrency, number> = { USD: 0.12, EUR: 0.11 };
const FIAT_SYMBOLS: Record<FiatCurrency, string> = { USD: "$", EUR: "\u20AC" };

export default function FeeCalculatorPage() {
  const [amount, setAmount] = useState("100");
  const [showFiat, setShowFiat] = useState(false);
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>("USD");

  const jobAmount = parseFloat(amount) || 0;
  const platformFee = jobAmount * (PLATFORM_FEE_PERCENT / 100);
  const totalCost = jobAmount + platformFee + NETWORK_FEE_XLM;
  const freelancerNet = jobAmount - platformFee;

  function formatXLM(value: number): string {
    return `${value.toFixed(4)} XLM`;
  }

  function formatWithFiat(value: number): string {
    const xlm = `${value.toFixed(4)} XLM`;
    if (!showFiat) return xlm;
    const fiat = value * XLM_TO_FIAT[fiatCurrency];
    const sym = FIAT_SYMBOLS[fiatCurrency];
    return `${xlm} (${sym}${fiat.toFixed(2)} ${fiatCurrency})`;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Fee Calculator</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          See the estimated platform fee, network fee, and net amounts before posting a job.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <label htmlFor="job-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Job Amount (XLM)
          </label>
          <input
            id="job-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg"
            placeholder="Enter job amount in XLM"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {QUICK_AMOUNTS.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(String(val))}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {val} XLM
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Fee Breakdown</h2>
            <button
              type="button"
              onClick={() => setShowFiat(!showFiat)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {showFiat ? `Show XLM only` : `Show in ${fiatCurrency}`}
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <div>
                <span className="text-gray-700 dark:text-gray-300">Platform Fee ({PLATFORM_FEE_PERCENT}%)</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fee charged by the platform for facilitating the job</p>
              </div>
              <span className="font-medium text-gray-900 dark:text-white">{formatWithFiat(platformFee)}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <div>
                <span className="text-gray-700 dark:text-gray-300">Network Fee</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Stellar network transaction cost</p>
              </div>
              <span className="font-medium text-gray-900 dark:text-white">{formatXLM(NETWORK_FEE_XLM)}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <div>
                <span className="text-gray-700 dark:text-gray-300">Freelancer Net Earnings</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Amount the freelancer receives after fees</p>
              </div>
              <span className="font-medium text-green-600 dark:text-green-400">{formatWithFiat(freelancerNet)}</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <div>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">Total Cost to Client</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total amount the client pays (job amount + all fees)</p>
              </div>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatWithFiat(totalCost)}</span>
            </div>
          </div>

          {showFiat && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setFiatCurrency(fiatCurrency === "USD" ? "EUR" : "USD")}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Switch to {fiatCurrency === "USD" ? "EUR" : "USD"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
