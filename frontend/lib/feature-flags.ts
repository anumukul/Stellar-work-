export interface FlagDefinition {
  defaultValue: boolean;
  description: string;
}

export interface FlagState {
  [flagName: string]: boolean;
}

export type FlagEvaluator = (user?: { address?: string }) => boolean;

const FLAG_DEFINITIONS: Record<string, FlagDefinition> = {
  newDashboard: {
    defaultValue: false,
    description: "New analytics dashboard layout",
  },
  newMessaging: {
    defaultValue: false,
    description: "Redesigned messaging interface",
  },
  biddingSystem: {
    defaultValue: false,
    description: "Freelancer bidding system for jobs",
  },
  milestones: {
    defaultValue: false,
    description: "Milestone-based payment releases",
  },
  multiToken: {
    defaultValue: false,
    description: "Support for multiple token types",
  },
};

const STORAGE_KEY = "stellarwork:feature-flags";
const URL_PARAM_PREFIX = "feature";

let overrides: FlagState = {};
let urlOverrides: FlagState = {};

export function getFlagDefinitions(): Record<string, FlagDefinition> {
  return { ...FLAG_DEFINITIONS };
}

export function getAllFlagNames(): string[] {
  return Object.keys(FLAG_DEFINITIONS);
}

export function getFlagDescription(name: string): string {
  return FLAG_DEFINITIONS[name]?.description ?? "";
}

export function getDefaultFlagValue(name: string): boolean {
  return FLAG_DEFINITIONS[name]?.defaultValue ?? false;
}

export function loadOverrides(): FlagState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const result: FlagState = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean" && key in FLAG_DEFINITIONS) {
        result[key] = value;
      }
    }
    overrides = result;
    return result;
  } catch {
    return {};
  }
}

export function saveOverrides(state: FlagState): void {
  if (typeof window === "undefined") return;
  const filtered: FlagState = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === "boolean" && key in FLAG_DEFINITIONS) {
      filtered[key] = value;
    }
  }
  overrides = filtered;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    /* storage full or unavailable */
  }
}

export function setFlagOverride(name: string, value: boolean): void {
  if (!(name in FLAG_DEFINITIONS)) return;
  overrides = { ...overrides, [name]: value };
  saveOverrides(overrides);
}

export function clearFlagOverride(name: string): void {
  const next = { ...overrides };
  delete next[name];
  overrides = next;
  saveOverrides(overrides);
}

export function clearAllOverrides(): void {
  overrides = {};
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function parseUrlOverrides(search?: string): FlagState {
  const params = typeof search === "string"
    ? new URLSearchParams(search)
    : typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  const result: FlagState = {};
  params.forEach((value, key) => {
    if (!key.startsWith(`${URL_PARAM_PREFIX}.`)) return;
    const flagName = key.slice(URL_PARAM_PREFIX.length + 1);
    if (!(flagName in FLAG_DEFINITIONS)) return;
    result[flagName] = value === "true" || value === "1";
  });
  urlOverrides = result;
  return result;
}

export function isEnabled(name: string): boolean {
  if (!(name in FLAG_DEFINITIONS)) return false;

  if (name in urlOverrides) return urlOverrides[name];

  const envKey = `NEXT_PUBLIC_FF_${name.toUpperCase()}`;
  const envValue = typeof process !== "undefined" ? process.env[envKey] : undefined;
  if (envValue !== undefined) return envValue === "true" || envValue === "1";

  if (name in overrides) return overrides[name];

  return FLAG_DEFINITIONS[name].defaultValue;
}

export function getActiveFlags(): FlagState {
  const result: FlagState = {};
  for (const name of Object.keys(FLAG_DEFINITIONS)) {
    result[name] = isEnabled(name);
  }
  return result;
}

export function getFlagOverrides(): FlagState {
  return { ...overrides };
}

export function getUrlOverrides(): FlagState {
  return { ...urlOverrides };
}

export function logActiveFlags(): void {
  const active = getActiveFlags();
  const lines = Object.entries(active)
    .map(([name, enabled]) => `  ${name}: ${enabled}`)
    .join("\n");
  if (typeof console !== "undefined") {
    console.warn(`[Feature Flags]\n${lines}`);
  }
}

export function initFeatureFlags(): void {
  loadOverrides();
  parseUrlOverrides();
}
