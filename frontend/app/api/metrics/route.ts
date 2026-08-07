import {
  WEB_VITALS,
  recordActiveSession,
  recordClientError,
  recordContractTx,
  recordJobView,
  recordLayoutShift,
  recordPageView,
  recordRpcError,
  recordWebVital,
  renderMetrics,
  type WebVitalName,
} from "@/lib/metrics";

/** Counters live in memory, so a scrape must never be served from a cache. */
export const dynamic = "force-dynamic";

/** Requests carrying more samples than this are truncated. */
const MAX_SAMPLES_PER_REQUEST = 50;
/** Anything larger is rejected outright. */
const MAX_BODY_BYTES = 16 * 1024;

const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

type Sample = Record<string, unknown>;

function isEnabled(): boolean {
  return process.env.METRICS_ENABLED !== "false";
}

/**
 * When METRICS_AUTH_TOKEN is set, scrapes must present it as a bearer token.
 * Leave it unset for local/in-cluster scraping over a private network.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.METRICS_AUTH_TOKEN;
  if (!expected) return true;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

function num(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function ingest(sample: Sample) {
  switch (sample.type) {
    case "web_vital": {
      const metric = str(sample.metric).toLowerCase();
      const value = num(sample.value);
      if (value === null) return;
      if (!(WEB_VITALS as readonly string[]).includes(metric)) return;
      recordWebVital(metric as WebVitalName, value, str(sample.path));
      return;
    }
    case "cls": {
      const value = num(sample.value);
      if (value === null) return;
      recordLayoutShift(value, str(sample.path));
      return;
    }
    case "page_view":
      recordPageView(str(sample.path));
      return;
    case "contract_tx": {
      const outcome = str(sample.outcome) === "error" ? "error" : "success";
      recordContractTx(
        str(sample.method),
        outcome,
        str(sample.network),
        num(sample.durationMs) ?? undefined,
      );
      return;
    }
    case "rpc_error":
      recordRpcError(str(sample.kind), str(sample.network));
      return;
    case "client_error":
      recordClientError(str(sample.kind), str(sample.path));
      return;
    case "job_view":
      recordJobView(str(sample.jobId));
      return;
    case "session_ping":
      recordActiveSession();
      return;
    default:
      return;
  }
}

/** Prometheus scrape target. */
export async function GET(request: Request) {
  if (!isEnabled()) {
    return new Response("metrics disabled\n", { status: 404 });
  }
  if (!isAuthorized(request)) {
    return new Response("unauthorized\n", { status: 401 });
  }

  return new Response(renderMetrics(), {
    status: 200,
    headers: {
      "content-type": PROMETHEUS_CONTENT_TYPE,
      "cache-control": "no-store",
    },
  });
}

/** Browser beacon endpoint — accepts a batch of samples from MetricsReporter. */
export async function POST(request: Request) {
  if (!isEnabled()) {
    return new Response(null, { status: 404 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const samples = (body as { samples?: unknown })?.samples;
  if (!Array.isArray(samples)) {
    return new Response(null, { status: 400 });
  }

  for (const sample of samples.slice(0, MAX_SAMPLES_PER_REQUEST)) {
    if (sample && typeof sample === "object") ingest(sample as Sample);
  }

  return new Response(null, { status: 204 });
}
