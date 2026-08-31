export function toXlm(stroops: string | number | bigint): string {
  const raw = typeof stroops === "bigint" ? stroops : BigInt(stroops);
  const isNegative = raw < 0n;
  const absolute = isNegative ? -raw : raw;

  // 1 XLM = 10,000,000 stroops; convert to 2dp with integer rounding.
  const roundedCents = (absolute * 100n + 5_000_000n) / 10_000_000n;
  const whole = roundedCents / 100n;
  const fraction = roundedCents % 100n;
  const formatter = new Intl.NumberFormat(undefined, {
    useGrouping: true,
    maximumFractionDigits: 0,
  });
  const wholeFormatted = formatter.format(whole);
  const decimalSeparator =
    new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? ".";

  return `${isNegative ? "-" : ""}${wholeFormatted}${decimalSeparator}${fraction
    .toString()
    .padStart(2, "0")}`;
}

export const FIAT_CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY"] as const;

export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];
export type XlmFiatRates = Partial<Record<FiatCurrency, number>>;

export interface XlmFiatRateCache {
  rates: XlmFiatRates;
  fetchedAt: number;
}

const FIAT_RATE_CACHE_KEY = "stellarwork:xlm-fiat-rates";
const FIAT_CURRENCY_KEY = "stellarwork:preferred-fiat-currency";
const FIAT_RATE_TTL_MS = 5 * 60 * 1000;

export function isFiatCurrency(value: string): value is FiatCurrency {
  return FIAT_CURRENCIES.includes(value as FiatCurrency);
}

export function getPreferredFiatCurrency(): FiatCurrency {
  if (typeof window === "undefined") return "USD";
  const stored = window.localStorage.getItem(FIAT_CURRENCY_KEY);
  return stored && isFiatCurrency(stored) ? stored : "USD";
}

export function savePreferredFiatCurrency(currency: FiatCurrency): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FIAT_CURRENCY_KEY, currency);
}

export function getCachedXlmFiatRates(now = Date.now()): XlmFiatRateCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FIAT_RATE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as XlmFiatRateCache;
    if (!parsed || typeof parsed.fetchedAt !== "number" || !parsed.rates) return null;
    if (now - parsed.fetchedAt > FIAT_RATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchXlmFiatRates(
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<XlmFiatRateCache> {
  const cached = getCachedXlmFiatRates(now);
  if (cached) return cached;

  const response = await fetcher(
    "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd,eur,gbp,inr,jpy",
  );
  if (!response.ok) {
    throw new Error("Unable to fetch XLM fiat exchange rates.");
  }

  const data = (await response.json()) as {
    stellar?: Partial<Record<Lowercase<FiatCurrency>, number>>;
  };
  const rates = FIAT_CURRENCIES.reduce<XlmFiatRates>((next, currency) => {
    const rate = data.stellar?.[currency.toLowerCase() as Lowercase<FiatCurrency>];
    if (typeof rate === "number" && Number.isFinite(rate)) {
      next[currency] = rate;
    }
    return next;
  }, {});

  if (Object.keys(rates).length === 0) {
    throw new Error("XLM fiat exchange rates were unavailable.");
  }

  const cache = { rates, fetchedAt: now };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(FIAT_RATE_CACHE_KEY, JSON.stringify(cache));
  }
  return cache;
}

export function formatFiatAmount(amount: number, currency: FiatCurrency): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount);
}

export function formatXlmWithFiat(
  stroops: string | number | bigint,
  currency: FiatCurrency,
  rates?: XlmFiatRates | null,
): string {
  const xlm = toXlm(stroops);
  const rate = rates?.[currency];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    return `${xlm} XLM`;
  }

  const xlmAmount = Number(typeof stroops === "bigint" ? stroops : BigInt(stroops)) / 10_000_000;
  if (!Number.isFinite(xlmAmount)) {
    return `${xlm} XLM`;
  }

  return `${xlm} XLM (~${formatFiatAmount(xlmAmount * rate, currency)} ${currency})`;
}

export function formatXlmFiatRateTooltip(
  currency: FiatCurrency,
  rates?: XlmFiatRates | null,
  fetchedAt?: number,
): string {
  const rate = rates?.[currency];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    return "Fiat conversion unavailable; showing XLM only.";
  }
  const timestamp = fetchedAt ? ` Updated ${new Date(fetchedAt).toLocaleString()}.` : "";
  return `1 XLM = ${formatFiatAmount(rate, currency)} ${currency}.${timestamp}`;
}
function formatRelativeInterval(deltaMs: number): string {
  const absSeconds = Math.max(1, Math.round(Math.abs(deltaMs) / 1000));
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];

  const [unit, secondsPerUnit] = units.find(([, size]) => absSeconds >= size) ?? [
    "second",
    1,
  ];
  const value = Math.max(1, Math.round(absSeconds / secondsPerUnit));
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });
  return formatter.format(deltaMs < 0 ? -value : value, unit);
}

export interface DeadlineDisplay {
  exact: string;
  relative: string;
  isPast: boolean;
}

export interface DeadlineCountdown {
  exact: string;
  days: number;
  hours: number;
  minutes: number;
  isPast: boolean;
  isExpired: boolean;
  label: string;
  urgency: "low" | "medium" | "high" | "expired";
}

export function formatDeadline(deadline: string): DeadlineDisplay | null {
  if (deadline === "0") return null;

  const deadlineDate = new Date(Number(deadline) * 1000);
  if (Number.isNaN(deadlineDate.getTime())) return null;

  const deltaMs = deadlineDate.getTime() - Date.now();
  return {
    exact: deadlineDate.toLocaleString(),
    relative: formatRelativeInterval(deltaMs),
    isPast: deltaMs < 0,
  };
}

export function getDeadlineCountdown(deadline: string, now = Date.now()): DeadlineCountdown | null {
  if (deadline === "0") return null;

  const deadlineDate = new Date(Number(deadline) * 1000);
  if (Number.isNaN(deadlineDate.getTime())) return null;

  const diffMs = deadlineDate.getTime() - now;
  const totalMinutes = Math.max(0, Math.floor(Math.abs(diffMs) / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (diffMs <= 0) {
    return {
      exact: deadlineDate.toLocaleString(),
      days: 0,
      hours: 0,
      minutes: 0,
      isPast: true,
      isExpired: true,
      label: "Expired",
      urgency: "expired",
    };
  }

  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 || (days === 0 && hours === 0) ? `${minutes}m` : null,
  ].filter(Boolean) as string[];

  const label = `${parts.slice(0, 3).join(" ")} remaining`;
  const urgency = diffMs <= 12 * 60 * 60 * 1000
    ? "high"
    : diffMs <= 72 * 60 * 60 * 1000
      ? "medium"
      : "low";

  return {
    exact: deadlineDate.toLocaleString(),
    days,
    hours,
    minutes,
    isPast: false,
    isExpired: false,
    label,
    urgency,
  };
}
