/**
 * Screen-reader contract tests for the four critical user journeys.
 *
 * These tests use mocked wallet and contract responses so CI verifies the
 * accessible UI states without requiring funded accounts or a live network.
 * The manual NVDA/VoiceOver checklist lives in docs/critical-flow-accessibility.md.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CLIENT = "GBZXM4PURFDMDPPCYFQSPH3LZODXWMFY2VAWIPKAIHHQEA2XBGV5WQJM";
const FREELANCER = "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6";
const JOB_ID = "42";

type Status = "Open" | "InProgress" | "SubmittedForReview" | "Disputed";

async function installFlowMocks(
  page: Page,
  options: { wallet: string; status: Status; freelancer?: string | null },
): Promise<void> {
  const freelancer = options.freelancer ?? null;

  await page.addInitScript(
    ({ wallet, status, freelancer, jobId }) => {
      Object.defineProperty(window, "freighter", {
        value: {
          isConnected: () => Promise.resolve(true),
          getPublicKey: () => Promise.resolve(wallet),
          getAddress: () => Promise.resolve({ address: wallet }),
          getNetwork: () => Promise.resolve("TESTNET"),
          signTransaction: () => Promise.resolve({ signedTxXdr: "mock" }),
        },
        configurable: true,
      });

      const state = { status, calls: [] as string[] };
      const job = () => ({
        client: "GBZXM4PURFDMDPPCYFQSPH3LZODXWMFY2VAWIPKAIHHQEA2XBGV5WQJM",
        freelancer,
        amount: "1000000000",
        status: state.status,
        description_hash: "0".repeat(64),
        deadline: "0",
        token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2IYKNZBV",
        title: "Accessible test job",
        category: "development",
        created_at: "0",
        submitted_at: state.status === "SubmittedForReview" ? "1" : undefined,
        version: 1,
      });

      const call = (method: string) => {
        state.calls.push(method);
        if (method === "accept_job") state.status = "InProgress";
        if (method === "approve_work") state.status = "Completed";
        if (method === "raise_dispute") state.status = "Disputed";
        if (method === "get_job") return Promise.resolve({ status: "SUCCESS", data: job() });
        if (method === "get_job_count") return Promise.resolve({ status: "SUCCESS", data: 1 });
        if (method === "get_job_status_counts") {
          return Promise.resolve({ status: "SUCCESS", data: { total: 1 } });
        }
        return Promise.resolve({ status: "SUCCESS", hash: `${jobId}-${method}` });
      };

      const globals = window as unknown as Record<string, unknown>;
      globals.__mockContractCall = call;
      globals.__contractStubEnabled = true;
      globals.__contractStubs = new Proxy({}, { get: (_target, method) => () => call(String(method)) });
    },
    { wallet: options.wallet, status: options.status, freelancer, jobId: JOB_ID },
  );

  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route(/soroban|horizon|stellar\.org|rpc\./, (route) =>
    route.fulfill({ json: { status: "SUCCESS", results: [] } }),
  );
}

async function expectNoA11yViolations(page: Page, include: string): Promise<void> {
  const results = await new AxeBuilder({ page }).include(include).analyze();
  expect(results.violations, results.violations.map((violation) => violation.id).join(", ")).toEqual([]);
}

test.describe("critical screen-reader flows", () => {
  test("posting a job exposes labeled fields and validation feedback", async ({ page }) => {
    await installFlowMocks(page, { wallet: CLIENT, status: "Open" });
    await page.goto("/post-job");

    await expect(page.getByRole("heading", { name: "Post Job" })).toBeVisible();
    await expect(page.getByLabel(/amount/i)).toBeVisible();
    await expect(page.getByLabel(/description/i)).toBeVisible();
    await page.getByRole("button", { name: /^post job$/i }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("aria-live", "assertive");
    await expectNoA11yViolations(page, "form");
  });

  test("accepting work has a named action and announces completion", async ({ page }) => {
    await installFlowMocks(page, { wallet: FREELANCER, status: "Open" });
    await page.goto(`/job/${JOB_ID}`);

    const accept = page.getByRole("button", { name: /^accept job$/i }).first();
    await expect(accept).toBeVisible();
    await accept.click();
    await page.getByRole("button", { name: /^accept job$/i }).last().click();

    await expect(page.locator('[aria-live="polite"]')).toContainText("Job accepted successfully");
    await expectNoA11yViolations(page, "main");
  });

  test("approving work exposes the confirmation dialog and live result", async ({ page }) => {
    await installFlowMocks(page, { wallet: CLIENT, status: "SubmittedForReview", freelancer: FREELANCER });
    await page.goto(`/job/${JOB_ID}`);

    await page.getByRole("button", { name: /^approve work$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /approve/i })).toBeVisible();
    await expectNoA11yViolations(page, '[role="dialog"]');

    await dialog.getByRole("button", { name: /yes, approve/i }).click();
    await expect(page.locator('[aria-live="polite"]')).toContainText("Work approved and payment released");
  });

  test("raising a dispute provides a modal, labeled inputs, and an error announcement", async ({ page }) => {
    await installFlowMocks(page, { wallet: CLIENT, status: "InProgress", freelancer: FREELANCER });
    await page.goto("/disputes");

    const raise = page.getByRole("button", { name: /raise dispute/i });
    await expect(raise).toBeEnabled();
    await raise.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Reason")).toBeVisible();
    await expect(dialog.getByLabel(/supporting evidence/i)).toBeVisible();
    await dialog.getByRole("button", { name: "Submit Dispute" }).click();
    await expect(dialog).toContainText("Please describe the dispute reason");
    await expectNoA11yViolations(page, '[role="dialog"]');
  });
});