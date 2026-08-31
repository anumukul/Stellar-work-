"use client";



const ENDPOINT = "/api/metrics";
/** Samples are batched to avoid a request per web vital. */
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE = 50;

export type MetricSample =
  | { type: "web_vital"; metric: "lcp" | "inp" | "fcp" | "ttfb"; value: number; path: string }
  | { type: "cls"; value: number; path: string }
  | { type: "page_view"; path: string }
  | {
      type: "contract_tx";
      method: string;
      outcome: "success" | "error";
      network: string;
      durationMs?: number;
    }
  | { type: "rpc_error"; kind: string; network: string }
  | { type: "client_error"; kind: string; path: string }
  | { type: "job_view"; jobId: string }
  | { type: "session_ping" };

let queue: MetricSample[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function enabled(): boolean {
  return typeof window !== "undefined" && process.env.NEXT_PUBLIC_METRICS_ENABLED !== "false";
}

export function flushMetrics() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;

  const payload = JSON.stringify({ samples: queue });
  queue = [];

  try {
    // sendBeacon survives page unload; fetch covers browsers without it.
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: "application/json" }))) {
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* telemetry is best-effort */
  }
}

export function reportSample(sample: MetricSample) {
  if (!enabled()) return;

  queue.push(sample);
  if (queue.length >= MAX_QUEUE) {
    flushMetrics();
    return;
  }
  if (!timer) {
    timer = setTimeout(flushMetrics, FLUSH_INTERVAL_MS);
  }
}

export function reportContractTx(
  method: string,
  outcome: "success" | "error",
  network: string,
  durationMs?: number,
) {
  reportSample({ type: "contract_tx", method, outcome, network, durationMs });
}

export function reportRpcError(kind: string, network: string) {
  reportSample({ type: "rpc_error", kind, network });
}

export function reportJobView(jobId: string) {
  reportSample({ type: "job_view", jobId });
}

export function reportSessionPing() {
  reportSample({ type: "session_ping" });
}

/** Buckets a thrown value into a coarse, low-cardinality error kind. */
export function classifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("timed out") || lower.includes("timeout")) return "timeout";
  if (lower.includes("simulation")) return "simulation";
  if (lower.includes("network") || lower.includes("fetch")) return "network";
  if (lower.includes("connect freighter") || lower.includes("user declined")) return "wallet";
  return "other";
}
