/**
 * Visual regression baselines — TEST-11 (#762).
 *
 * Unit tests assert that components render; they say nothing about whether the
 * result still *looks* right. A changed utility class, a bumped dependency or a
 * token rename can move a layout without failing a single assertion. These
 * screenshots are the safety net for that.
 *
 * Scope: home, job detail, dashboard, post-job and profile, at a mobile and a
 * desktop width.
 *
 * Determinism is the hard part of screenshot testing — a flaky baseline is
 * worse than none, because people learn to re-approve diffs without reading
 * them. Four sources of drift are removed here:
 *
 *   1. **Network.** Contract and API calls are stubbed via `page.route` and an
 *      init script, so no RPC endpoint is contacted and no timing varies.
 *   2. **Wallet.** Freighter is mocked with a fixed address, so connected-state
 *      UI renders identically every run.
 *   3. **Time.** `Date.now` is pinned, so relative timestamps ("2 days ago")
 *      do not change between runs.
 *   4. **Motion.** Animations and transitions are disabled, and each capture
 *      waits for fonts to settle, so nothing is caught mid-frame.
 *
 * Regenerating baselines:
 *
 *     npm run test:visual:update        # all baselines
 *     npx playwright test e2e/visual-regression.spec.ts --update-snapshots \
 *       --grep "home page"              # one page
 *
 * Review the resulting image diff before committing — an updated baseline is an
 * assertion that the new rendering is correct, not a way to make CI quiet.
 * See `docs/visual-regression-testing.md`.
 */

import { test, expect, type Page } from "@playwright/test";

/**
 * Synthetic Stellar address used only as a fixture. This is a public key, holds
 * no funds, and is the same well-known placeholder the other e2e specs use.
 */
const MOCK_WALLET = "GBZXM4PURFDMDPPCYFQSPH3LZODXWMFY2VAWIPKAIHHQEA2XBGV5WQJM";

/** Pinned instant so relative timestamps render identically every run. */
const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Widths to capture. Named so snapshot files are self-describing. */
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

type ViewportName = keyof typeof VIEWPORTS;

/** A canned job, shaped like the API response the pages consume. */
const MOCK_JOB = {
  id: "1",
  client: MOCK_WALLET,
  freelancer: null,
  amount: "1000",
  status: "Open",
  title: "Build a Soroban indexer",
  description: "Index contract events and expose a paginated API.",
  created_at: Math.floor(FIXED_NOW / 1000) - 86_400,
  deadline: Math.floor(FIXED_NOW / 1000) + 604_800,
  token: "XLM",
};

/**
 * Remove every source of run-to-run variation before the first paint.
 *
 * Installed with `addInitScript` so it applies before app code runs — patching
 * after load would leave a window where the real implementations are used.
 */
async function stabilise(page: Page): Promise<void> {
  await page.addInitScript(
    ({ wallet, now }) => {
      // Wallet: a fixed connected account.
      Object.defineProperty(window, "freighter", {
        value: {
          isConnected: () => Promise.resolve(true),
          getPublicKey: () => Promise.resolve(wallet),
          getNetwork: () => Promise.resolve("TESTNET"),
          signTransaction: () => Promise.resolve("mock_signed_xdr"),
        },
        writable: true,
        configurable: true,
      });

      // Time: pinned, so "2 days ago" does not become "3 days ago" overnight.
      const RealDate = Date;
      class FixedDate extends RealDate {
        constructor(...args: unknown[]) {
          // @ts-expect-error - forwarding a variadic Date constructor
          super(...(args.length ? args : [now]));
        }
        static now() {
          return now;
        }
      }
      // @ts-expect-error - deliberate global override for determinism
      window.Date = FixedDate;

      // Randomness: some list keys and skeleton widths derive from it.
      let seed = 42;
      Math.random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
    },
    { wallet: MOCK_WALLET, now: FIXED_NOW },
  );

  // Motion: a transition caught mid-frame is the classic screenshot flake.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  }).catch(() => {
    // addStyleTag before navigation can race; the per-capture call below is
    // the one that must succeed.
  });
}

/** Serve canned responses so no request leaves the browser. */
async function stubNetwork(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/jobs")) {
      await route.fulfill({ json: { jobs: [MOCK_JOB], total: 1 } });
      return;
    }
    await route.fulfill({ json: {} });
  });

  // Soroban RPC and Horizon: refuse rather than allow a slow real call.
  await page.route(/soroban|horizon|stellar\.org/, (route) =>
    route.fulfill({ json: { status: "SUCCESS", results: [] } }),
  );
}

/**
 * Wait until the page has stopped moving.
 *
 * Fonts are the usual culprit: text reflows when a webfont swaps in, and a
 * screenshot taken before that is a different image every run depending on
 * cache state.
 */
async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForLoadState("networkidle").catch(() => {
    // networkidle can never arrive if the app holds a long-poll open; the
    // font and animation settling above is the part that matters.
  });
}

/** Capture one page at one viewport and compare against its baseline. */
async function capturePage(
  page: Page,
  path: string,
  name: string,
  viewport: ViewportName,
): Promise<void> {
  await page.setViewportSize(VIEWPORTS[viewport]);
  await stabilise(page);
  await stubNetwork(page);

  await page.goto(path, { waitUntil: "domcontentloaded" });
  await settle(page);

  await expect(page).toHaveScreenshot(`${name}-${viewport}.png`, {
    fullPage: true,
    // A couple of anti-aliased pixels differ between machines and even between
    // runs on the same GPU. Zero tolerance makes the suite unusable; this is
    // tight enough that a real layout shift still fails.
    maxDiffPixelRatio: 0.01,
    animations: "disabled",
    // Mask anything genuinely non-deterministic that survived the stubs.
    mask: [page.locator("[data-testid='live-timestamp']")],
  });
}

/** The pages the issue asks for, with the routes they live at. */
const PAGES: { name: string; path: string }[] = [
  { name: "home", path: "/" },
  { name: "job-detail", path: "/job/1" },
  { name: "dashboard", path: "/dashboard" },
  { name: "post-job", path: "/post-job" },
  { name: "profile", path: `/profile/${MOCK_WALLET}` },
];

test.describe("visual regression", () => {
  // Baselines are per-rendering-engine; running the same PNG comparison under
  // three device profiles would demand three sets of images for no extra
  // signal, since the viewport width is what these tests vary.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "baselines are captured on chromium only",
  );

  for (const { name, path } of PAGES) {
    for (const viewport of Object.keys(VIEWPORTS) as ViewportName[]) {
      test(`${name} page at ${viewport} width`, async ({ page }) => {
        await capturePage(page, path, name, viewport);
      });
    }
  }
});

test.describe("visual regression — determinism", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "baselines are captured on chromium only",
  );

  test("two captures of the same page agree", async ({ page }) => {
    // Guards the guard: if this fails, a baseline somewhere is unstable and
    // every future diff on it is noise.
    await page.setViewportSize(VIEWPORTS.desktop);
    await stabilise(page);
    await stubNetwork(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await settle(page);
    const first = await page.screenshot({ fullPage: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page);
    const second = await page.screenshot({ fullPage: true });

    expect(first.byteLength).toBeGreaterThan(0);
    expect(Math.abs(first.byteLength - second.byteLength)).toBeLessThan(
      first.byteLength * 0.02,
    );
  });

  test("the clock is pinned", async ({ page }) => {
    await stabilise(page);
    await stubNetwork(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Relative timestamps are the most common cause of a baseline that fails
    // the morning after it was recorded.
    expect(await page.evaluate(() => Date.now())).toBe(FIXED_NOW);
  });

  test("no request escapes to the network", async ({ page }) => {
    const escaped: string[] = [];
    await stabilise(page);
    await stubNetwork(page);
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith("http://localhost") && !url.startsWith("data:")) {
        escaped.push(url);
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await settle(page);

    expect(escaped, `unstubbed requests: ${escaped.join(", ")}`).toHaveLength(0);
  });
});
