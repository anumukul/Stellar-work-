"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useWallet } from "@/lib/wallet-context";
import Link from "next/link";
import {
  FIAT_CURRENCIES,
  getPreferredFiatCurrency,
  savePreferredFiatCurrency,
  type FiatCurrency,
} from "@/lib/format";
import {
  useNotifications,
  getEventLabel,
} from "@/lib/notifications-context";
import {
  useTypography,
  FONT_SIZE_MAP,
  LINE_SPACING_MAP,
  type FontSize,
  type LineSpacing,
} from "@/lib/typography-context";
import type { NotificationEvent } from "@/lib/types";
import { getNetwork, retryQueuedWrites } from "@/lib/stellar";
import {
  clearFailedWriteQueue,
  getRetryConfig,
  loadFailedWriteQueue,
  resetCircuitBreaker,
  resetRetryConfig,
  saveRetryConfig,
  type RetryConfig,
} from "@/lib/contract-retry";
import { useCallback, useEffect, useId, useState } from "react";

const NOTIFICATION_EVENTS: NotificationEvent[] = [
  "job_accepted",
  "work_submitted",
  "work_approved",
  "job_cancelled",
  "dispute_raised",
  "dispute_resolved",
];

const PROFILE_VISIBILITY_KEY = "stellarwork:settings:profile_visible";
const SHOW_EMAIL_KEY = "stellarwork:settings:show_email";
const READ_RECEIPTS_KEY = "stellarwork:settings:read_receipts";

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  const v = localStorage.getItem(key);
  if (v === null) return defaultValue;
  return v === "true";
}

function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-4"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {label}
        </span>
        {description && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {description}
          </span>
        )}
      </span>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          checked
            ? "bg-blue-600"
            : "bg-slate-200 dark:bg-slate-700"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Live preview that renders at the chosen font-size / line-height overrides. */
function TypographyPreview({
  fontSize,
  lineSpacing,
}: {
  fontSize: FontSize;
  lineSpacing: LineSpacing;
}) {
  return (
    <div
      aria-label="Typography preview"
      style={{
        fontSize: FONT_SIZE_MAP[fontSize],
        lineHeight: LINE_SPACING_MAP[lineSpacing],
      }}
      className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <p className="font-semibold text-slate-900 dark:text-slate-100">
        Preview — {FONT_SIZE_MAP[fontSize]} / {LINE_SPACING_MAP[lineSpacing]}×
      </p>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        The quick brown fox jumps over the lazy dog. StellarWork connects
        freelancers and clients through trustless on-chain escrow on the Stellar
        network.
      </p>
    </div>
  );
}

export default function SettingsClient() {
  const { theme, setTheme } = useTheme();
  const { wallet } = useWallet();
  const { preferences, setPreference } = useNotifications();
  const { fontSize, lineSpacing, setFontSize, setLineSpacing, reset: resetTypography } =
    useTypography();
  const network = getNetwork();
  const themeId = useId();
  const currencyId = useId();
  const fontSizeId = useId();
  const lineSpacingId = useId();

  const [currency, setCurrency] = useState<FiatCurrency>("USD");
  const [profileVisible, setProfileVisible] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [retryConfig, setRetryConfig] = useState<RetryConfig>(() => getRetryConfig());
  const [queuedWrites, setQueuedWrites] = useState(0);
  const retryMaxId = useId();
  const retryQueueId = useId();

  useEffect(() => {
    setCurrency(getPreferredFiatCurrency());
    setProfileVisible(readBool(PROFILE_VISIBILITY_KEY, true));
    setShowEmail(readBool(SHOW_EMAIL_KEY, false));
    setReadReceipts(readBool(READ_RECEIPTS_KEY, true));
    setRetryConfig(getRetryConfig());
    setQueuedWrites(loadFailedWriteQueue().length);
  }, []);

  const handleCurrencyChange = useCallback((c: FiatCurrency) => {
    setCurrency(c);
    savePreferredFiatCurrency(c);
  }, []);

  const handleProfileVisible = useCallback((v: boolean) => {
    setProfileVisible(v);
    localStorage.setItem(PROFILE_VISIBILITY_KEY, String(v));
  }, []);

  const handleShowEmail = useCallback((v: boolean) => {
    setShowEmail(v);
    localStorage.setItem(SHOW_EMAIL_KEY, String(v));
  }, []);

  const handleReadReceipts = useCallback((v: boolean) => {
    setReadReceipts(v);
    localStorage.setItem(READ_RECEIPTS_KEY, String(v));
  }, []);

  const resetDisplay = useCallback(() => {
    setTheme("system");
    handleCurrencyChange("USD");
  }, [setTheme, handleCurrencyChange]);

  const resetNotifications = useCallback(() => {
    for (const event of NOTIFICATION_EVENTS) {
      setPreference(event, true);
    }
  }, [setPreference]);

  const resetPrivacy = useCallback(() => {
    handleProfileVisible(true);
    handleShowEmail(false);
    handleReadReceipts(true);
  }, [handleProfileVisible, handleShowEmail, handleReadReceipts]);

  const handleRetryConfigChange = useCallback((patch: Partial<RetryConfig>) => {
    const next = saveRetryConfig(patch);
    setRetryConfig(next);
  }, []);

  const resetRetrySettings = useCallback(() => {
    const next = resetRetryConfig();
    setRetryConfig(next);
  }, []);

  const handleRetryQueuedWrites = useCallback(async () => {
    await retryQueuedWrites();
    setQueuedWrites(loadFailedWriteQueue().length);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-2">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Preferences are saved automatically and persist across sessions.
        </p>
      </div>

      {/* Display */}
      <Section title="Display">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={themeId}
            className="text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Theme
          </label>
          <select
            id={themeId}
            value={theme}
            onChange={(e) =>
              setTheme(e.target.value as "light" | "dark" | "system")
            }
            className="w-48 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="system">System default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={currencyId}
            className="text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Fiat currency
          </label>
          <select
            id={currencyId}
            value={currency}
            onChange={(e) => handleCurrencyChange(e.target.value as FiatCurrency)}
            className="w-48 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {FIAT_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Used for XLM fiat equivalents shown across the app.
          </p>
        </div>

        <button
          type="button"
          onClick={resetDisplay}
          className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          Reset to defaults
        </button>
      </Section>

      {/* Typography */}
      <Section title="Typography">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Adjust text size and spacing to improve readability. Settings are
          saved per browser and apply across the entire app.
        </p>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={fontSizeId}
            className="text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Font size
          </label>
          <select
            id={fontSizeId}
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value as FontSize)}
            className="w-48 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="small">Small (14px)</option>
            <option value="medium">Medium (16px) — default</option>
            <option value="large">Large (18px)</option>
            <option value="x-large">Extra Large (20px)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={lineSpacingId}
            className="text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Line spacing
          </label>
          <select
            id={lineSpacingId}
            value={lineSpacing}
            onChange={(e) => setLineSpacing(e.target.value as LineSpacing)}
            className="w-48 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="compact">Compact (1.4×)</option>
            <option value="normal">Normal (1.6×) — default</option>
            <option value="relaxed">Relaxed (1.8×)</option>
          </select>
        </div>

        <TypographyPreview fontSize={fontSize} lineSpacing={lineSpacing} />

        <button
          type="button"
          onClick={resetTypography}
          className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          Reset to defaults
        </button>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Choose which in-app events trigger a notification.
        </p>
        {NOTIFICATION_EVENTS.map((event) => (
          <Toggle
            key={event}
            id={`notif-${event}`}
            checked={preferences[event]}
            onChange={(v) => setPreference(event, v)}
            label={getEventLabel(event)}
          />
        ))}
        <button
          type="button"
          onClick={resetNotifications}
          className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          Enable all notifications
        </button>
      </Section>

      {/* Privacy */}
      <Section title="Privacy">
        <Toggle
          id="privacy-profile-visible"
          checked={profileVisible}
          onChange={handleProfileVisible}
          label="Public profile"
          description="Allow others to view your on-chain activity."
        />
        <Toggle
          id="privacy-show-email"
          checked={showEmail}
          onChange={handleShowEmail}
          label="Show email on profile"
          description="Display your email address on your public profile page."
        />
        <Toggle
          id="privacy-read-receipts"
          checked={readReceipts}
          onChange={handleReadReceipts}
          label="Read receipts"
          description="Let others see when you've read their messages."
        />
        <button
          type="button"
          onClick={resetPrivacy}
          className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          Reset to defaults
        </button>
      </Section>

      {/* Contract reliability (FE-186) */}
      <Section title="Contract reliability">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Retry transient RPC failures with exponential backoff. Writes can be
          queued locally when all retries are exhausted.
        </p>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={retryMaxId}
            className="text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Max retries
          </label>
          <select
            id={retryMaxId}
            value={retryConfig.maxRetries}
            onChange={(e) =>
              handleRetryConfigChange({ maxRetries: Number(e.target.value) })
            }
            className="w-48 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <Toggle
          id="retry-circuit-breaker"
          checked={retryConfig.circuitBreakerEnabled}
          onChange={(v) => handleRetryConfigChange({ circuitBreakerEnabled: v })}
          label="Circuit breaker"
          description="Pause contract calls after repeated RPC failures."
        />

        <Toggle
          id="retry-queue-writes"
          checked={retryConfig.queueFailedWrites}
          onChange={(v) => handleRetryConfigChange({ queueFailedWrites: v })}
          label="Queue failed writes"
          description="Save failed transactions locally for later retry."
        />

        {queuedWrites > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <span>
              {queuedWrites} failed write{queuedWrites === 1 ? "" : "s"} in queue
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                id={retryQueueId}
                onClick={() => void handleRetryQueuedWrites()}
                className="rounded px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-slate-700"
              >
                Retry queued
              </button>
              <button
                type="button"
                onClick={() => {
                  clearFailedWriteQueue();
                  setQueuedWrites(0);
                }}
                className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Clear queue
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              resetCircuitBreaker();
            }}
            className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
          >
            Reset circuit breaker
          </button>
          <button
            type="button"
            onClick={resetRetrySettings}
            className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
          >
            Reset retry defaults
          </button>
        </div>
      </Section>

      {/* Account */}
      <Section title="Account">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Connected wallet
          </p>
          {wallet ? (
            <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
              {wallet}
            </p>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No wallet connected.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Network
          </p>
          <p className="text-xs capitalize text-slate-600 dark:text-slate-400">
            {network}
          </p>
        </div>
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <Link
            href="/help"
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            Account Recovery &amp; Key Management Guide &rarr;
          </Link>
        </div>
      </Section>
    </div>
  );
}
