# Monitoring & Alerting

Centralized monitoring for StellarWork: Prometheus collects metrics, Grafana renders
dashboards, Alertmanager routes alerts. Covers frontend performance (Core Web Vitals),
Soroban contract transaction success rates, and RPC/error health.

## Quick start

```bash
docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d
# or:
make monitoring-up
```

| Service      | URL                     | Notes                                     |
| ------------ | ----------------------- | ----------------------------------------- |
| Grafana      | http://localhost:3001   | `admin` / `admin` by default              |
| Prometheus   | http://localhost:9090   | Targets under Status → Targets            |
| Alertmanager | http://localhost:9093   | Active/silenced alerts                    |
| Raw metrics  | http://localhost:3000/api/metrics | Prometheus text exposition       |

The **StellarWork — Platform Overview** dashboard is provisioned automatically into the
`StellarWork` folder; no manual import needed.

## How metrics get collected

```
browser ──POST /api/metrics──▶ Next.js server (in-memory registry)
                                     ▲
                        Prometheus ──┘ GET /api/metrics (every 30s)
                                     │
                        Grafana ─────┘ queries Prometheus
                                     │
                   Alertmanager ◀────┘ fires rules from alerts.yml
```

- [`frontend/components/MetricsReporter.tsx`](../frontend/components/MetricsReporter.tsx)
  collects Core Web Vitals with the native `PerformanceObserver` API — no extra npm
  dependency — and batches them to `/api/metrics`.
- [`frontend/lib/stellar.ts`](../frontend/lib/stellar.ts) wraps `callContract` so every
  Soroban invocation records its outcome and latency.
- [`frontend/lib/metrics.ts`](../frontend/lib/metrics.ts) is the server-side registry and
  text-exposition renderer.
- [`frontend/app/api/metrics/route.ts`](../frontend/app/api/metrics/route.ts) serves `GET`
  (scrape) and accepts `POST` (browser beacon).

> **Counters are per-process and in memory.** They reset on deploy and each replica holds
> its own values. Scrape every replica and aggregate in PromQL (`sum by (...)`), and prefer
> `rate()` over raw counter values in panels.

## Metrics reference

| Metric | Type | Labels | Meaning |
| ------ | ---- | ------ | ------- |
| `stellarwork_web_vital_milliseconds` | histogram | `metric` (`lcp`/`inp`/`fcp`/`ttfb`), `path` | Core Web Vitals from real users |
| `stellarwork_layout_shift_score` | histogram | `path` | Cumulative Layout Shift (unitless) |
| `stellarwork_page_views_total` | counter | `path` | Client-side navigations |
| `stellarwork_contract_tx_total` | counter | `method`, `outcome`, `network` | Soroban invocations by outcome |
| `stellarwork_contract_tx_duration_milliseconds` | histogram | `method`, `network` | End-to-end invocation latency |
| `stellarwork_rpc_errors_total` | counter | `kind`, `network` | Stellar RPC failures by coarse kind |
| `stellarwork_client_errors_total` | counter | `kind`, `path` | Unhandled frontend errors |
| `stellarwork_http_requests_total` | counter | `route`, `status` | HTTP requests by route and status code |
| `stellarwork_http_request_duration_milliseconds` | histogram | `route` | HTTP request processing latency |
| `stellarwork_http_errors_total` | counter | `route` | HTTP responses with 4xx/5xx status |
| `stellarwork_active_sessions_total` | counter | `type` | Beacon pings (proxy for concurrent visitors) |
| `stellarwork_job_views_total` | counter | `job_id` | Job detail page views |

Label values are sanitized and each metric is capped at 500 distinct series, so
browser-supplied labels cannot grow memory without bound.

### Useful queries

```promql
# Contract transaction success rate over the last hour
sum(rate(stellarwork_contract_tx_total{outcome="success"}[1h]))
  / clamp_min(sum(rate(stellarwork_contract_tx_total[1h])), 0.001)

# p75 LCP (Core Web Vitals threshold: 2500ms)
histogram_quantile(0.75,
  sum by (le) (rate(stellarwork_web_vital_milliseconds_bucket{metric="lcp"}[30m])))

# Slowest contract methods at p95
topk(5, histogram_quantile(0.95,
  sum by (le, method) (rate(stellarwork_contract_tx_duration_milliseconds_bucket[30m]))))
```

## Alerts

Defined in [`monitoring/prometheus/alerts.yml`](../monitoring/prometheus/alerts.yml).

| Alert | Severity | Condition |
| ----- | -------- | --------- |
| `FrontendTargetDown` | critical | Scrape target down for 5m |
| `SyntheticProbeFailing` | critical | Blackbox probe failing for 5m |
| `ContractTxFailureRateHigh` | critical | >10% invocation failures over 10m |
| `ContractTxLatencyHigh` | warning | p95 latency >20s for 15m |
| `RpcErrorSpike` | warning | >0.5 RPC errors/sec for 10m |
| `LcpRegression` | warning | p75 LCP >2.5s for 30m |
| `InpRegression` | warning | p75 INP >200ms for 30m |
| `ClientErrorSpike` | warning | >1 client error/sec for 10m |
| `HttpErrorRateHigh` | warning | >1% HTTP 4xx/5xx responses for 10m |
| `HttpLatencyHigh` | warning | p95 HTTP latency >3s for 15m |

Routing lives in [`monitoring/alertmanager/alertmanager.yml`](../monitoring/alertmanager/alertmanager.yml).
Alertmanager does **not** expand environment variables — replace the placeholder Slack
webhook URL in that file (or mount a secret and switch to `api_url_file`) before relying on
notifications. `critical` alerts route to `#stellarwork-incidents` with a 10s group wait;
everything else goes to `#stellarwork-alerts`.

Reload rules without a restart:

```bash
curl -X POST http://localhost:9090/-/reload
```

## Configuration

| Variable | Where | Default | Purpose |
| -------- | ----- | ------- | ------- |
| `METRICS_ENABLED` | server | `true` | Set to `false` to make `/api/metrics` return 404 |
| `METRICS_AUTH_TOKEN` | server | unset | When set, scrapes must send `Authorization: Bearer <token>` |
| `NEXT_PUBLIC_METRICS_ENABLED` | browser | `true` | Set to `false` to stop client-side reporting |
| `ENVIRONMENT` | Prometheus | `dev` | Added to alerts as an external label |
| `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` | Grafana | `admin` | Change before exposing Grafana |

**Production:** keep `/api/metrics` on a private network or set `METRICS_AUTH_TOKEN` — the
endpoint is unauthenticated by default so in-cluster scraping works out of the box. Add the
token to the scrape job with `authorization: { credentials: <token> }`.

## Adding a metric

1. Define it in [`frontend/lib/metrics.ts`](../frontend/lib/metrics.ts) with `counter()` or
   `histogram()` and export a `record*` helper.
2. Add the sample variant to `MetricSample` in
   [`frontend/lib/metrics-client.ts`](../frontend/lib/metrics-client.ts) and handle it in
   `ingest()` in the route handler.
3. Add a panel to
   [`monitoring/grafana/dashboards/stellarwork-overview.json`](../monitoring/grafana/dashboards/stellarwork-overview.json)
   and an alert rule if it should page someone.

Keep label cardinality low — labels like wallet address or job ID will blow up the series
count. See [PERFORMANCE.md](./PERFORMANCE.md) for frontend performance budgets and
[OPS_RUNBOOK.md](./OPS_RUNBOOK.md) for incident response.
