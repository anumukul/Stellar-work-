import { beforeEach, describe, expect, it } from "vitest";
import {
  recordContractTx,
  recordLayoutShift,
  recordPageView,
  recordWebVital,
  renderMetrics,
  resetMetrics,
  sanitizeLabel,
} from "@/lib/metrics";

beforeEach(() => {
  resetMetrics();
});

describe("metrics registry", () => {
  it("renders counters in the Prometheus exposition format", () => {
    recordPageView("/dashboard");
    recordPageView("/dashboard");

    const output = renderMetrics();
    expect(output).toContain("# TYPE stellarwork_page_views_total counter");
    expect(output).toContain('stellarwork_page_views_total{path="/dashboard"} 2');
  });

  it("renders histogram buckets, sum and count", () => {
    recordWebVital("lcp", 150, "/");

    const output = renderMetrics();
    expect(output).toContain("# TYPE stellarwork_web_vital_milliseconds histogram");
    expect(output).toContain(
      'stellarwork_web_vital_milliseconds_bucket{le="100",metric="lcp",path="/"} 0',
    );
    expect(output).toContain(
      'stellarwork_web_vital_milliseconds_bucket{le="200",metric="lcp",path="/"} 1',
    );
    expect(output).toContain(
      'stellarwork_web_vital_milliseconds_bucket{le="+Inf",metric="lcp",path="/"} 1',
    );
    expect(output).toContain('stellarwork_web_vital_milliseconds_sum{metric="lcp",path="/"} 150');
    expect(output).toContain('stellarwork_web_vital_milliseconds_count{metric="lcp",path="/"} 1');
  });

  it("splits contract transactions by outcome and records latency", () => {
    recordContractTx("post_job", "success", "testnet", 1200);
    recordContractTx("post_job", "error", "testnet", 800);

    const output = renderMetrics();
    expect(output).toContain(
      'stellarwork_contract_tx_total{method="post_job",network="testnet",outcome="success"} 1',
    );
    expect(output).toContain(
      'stellarwork_contract_tx_total{method="post_job",network="testnet",outcome="error"} 1',
    );
    expect(output).toContain(
      'stellarwork_contract_tx_duration_milliseconds_count{method="post_job",network="testnet"} 2',
    );
  });

  it("tracks layout shift on its own unitless histogram", () => {
    recordLayoutShift(0.04, "/");

    const output = renderMetrics();
    expect(output).toContain('stellarwork_layout_shift_score_bucket{le="0.05",path="/"} 1');
    expect(output).toContain('stellarwork_layout_shift_score_bucket{le="0.01",path="/"} 0');
  });

  it("strips characters that would break the exposition format", () => {
    expect(sanitizeLabel('job"1\n')).toBe("job1");
    expect(sanitizeLabel("")).toBe("unknown");
    expect(sanitizeLabel(42)).toBe("unknown");
    expect(sanitizeLabel(undefined, "/")).toBe("/");
  });

  it("resets every series", () => {
    recordPageView("/");
    resetMetrics();
    expect(renderMetrics()).not.toContain("stellarwork_page_views_total{");
  });
});
