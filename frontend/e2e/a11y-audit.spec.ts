/**
 * Accessibility regression checks — A11Y-29 (#767), A11Y-30 (#768), A11Y-31 (#769).
 *
 * These run in a real browser on purpose. Touch-target size and focus order are
 * both properties of *layout*, and jsdom has no layout engine: a unit test can
 * assert that a class name is present but not that the resulting element is
 * 44px tall, nor that Tab moves focus down the page rather than across it.
 *
 * Findings and documented exceptions: `docs/accessibility-audit.md`.
 */

import { test, expect, type Page } from "@playwright/test";

/**
 * WCAG 2.5.5 (AAA) asks for 44×44 CSS px. WCAG 2.5.8 (AA) relaxes this to 24px
 * with spacing. 44 is the bar these issues set, and it is what iOS and Android
 * both recommend, so it is what is checked here.
 */
const MIN_TOUCH_TARGET = 44;

/** Routes the issues name. */
const ROUTES = ["/", "/post-job", "/dashboard"] as const;

/** Fixed wallet so connected-state controls render. */
const WALLET = "GBZXM4PURFDMDPPCYFQSPH3LZODXWMFY2VAWIPKAIHHQEA2XBGV5WQJM";

async function stub(page: Page): Promise<void> {
  await page.addInitScript((addr) => {
    Object.defineProperty(window, "freighter", {
      value: {
        isConnected: () => Promise.resolve(true),
        getPublicKey: () => Promise.resolve(addr),
        getNetwork: () => Promise.resolve("TESTNET"),
        signTransaction: () => Promise.resolve("mock"),
      },
      writable: true,
      configurable: true,
    });
  }, WALLET);

  await page.route("**/api/**", (route) => route.fulfill({ json: { jobs: [], total: 0 } }));
  await page.route(/soroban|horizon|stellar\.org/, (route) =>
    route.fulfill({ json: { status: "SUCCESS", results: [] } }),
  );
}

// ── A11Y-29 (#767): touch targets ───────────────────────────────────────────

test.describe("touch target size", () => {
  for (const route of ROUTES) {
    test(`every visible control on ${route} meets ${MIN_TOUCH_TARGET}px`, async ({ page }) => {
      await stub(page);
      // Measured at a phone width: this is a pointer-accuracy problem, and the
      // desktop layout is not where it bites.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route, { waitUntil: "domcontentloaded" });

      const undersized = await page.evaluate((minimum) => {
        const selector = "button, a[href], [role='button'], input[type='checkbox'], input[type='radio'], select, summary";
        const offenders: { tag: string; label: string; w: number; h: number }[] = [];

        for (const el of Array.from(document.querySelectorAll(selector))) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;

          const rect = el.getBoundingClientRect();
          // Zero-size elements are not rendered — a collapsed menu, an
          // off-screen skip link before focus. Not a tap-target problem.
          if (rect.width === 0 || rect.height === 0) continue;

          // An inline link inside a paragraph is exempt: WCAG 2.5.8 excludes
          // targets in a sentence, where enlarging them would break the text.
          const inSentence =
            el.tagName === "A" && el.closest("p, li, span")?.textContent?.trim().length !== el.textContent?.trim().length;
          if (inSentence) continue;

          if (rect.width < minimum || rect.height < minimum) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              label:
                el.getAttribute("aria-label") ??
                el.textContent?.trim().slice(0, 40) ??
                el.className.toString().slice(0, 40),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
            });
          }
        }
        return offenders;
      }, MIN_TOUCH_TARGET);

      expect(
        undersized,
        `undersized targets on ${route}:\n` +
          undersized.map((o) => `  ${o.tag} "${o.label}" — ${o.w}x${o.h}`).join("\n"),
      ).toEqual([]);
    });
  }
});

// ── A11Y-30 (#768): accessible names ────────────────────────────────────────

test.describe("accessible names", () => {
  for (const route of ROUTES) {
    test(`every image on ${route} has alt text`, async ({ page }) => {
      await stub(page);
      await page.goto(route, { waitUntil: "domcontentloaded" });

      const missing = await page.evaluate(() =>
        Array.from(document.querySelectorAll("img"))
          // A missing `alt` makes a screen reader read the filename. An empty
          // `alt=""` is correct and deliberate for decoration, so only an
          // absent attribute is a defect.
          .filter((img) => !img.hasAttribute("alt"))
          .map((img) => img.getAttribute("src") ?? "(no src)"),
      );

      expect(missing, `images with no alt attribute: ${missing.join(", ")}`).toEqual([]);
    });

    test(`every control on ${route} has an accessible name`, async ({ page }) => {
      await stub(page);
      await page.goto(route, { waitUntil: "domcontentloaded" });

      const unnamed = await page.evaluate(() => {
        const offenders: string[] = [];
        for (const el of Array.from(document.querySelectorAll("button, a[href], [role='button']"))) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;

          const name =
            el.getAttribute("aria-label")?.trim() ||
            (el.getAttribute("aria-labelledby") &&
              document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent?.trim()) ||
            el.getAttribute("title")?.trim() ||
            el.textContent?.trim();

          // An icon-only button with no name is announced as just "button".
          if (!name) {
            offenders.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 30)}`);
          }
        }
        return offenders;
      });

      expect(unnamed, `controls with no accessible name: ${unnamed.join(", ")}`).toEqual([]);
    });

    test(`decorative SVGs on ${route} are hidden from assistive tech`, async ({ page }) => {
      await stub(page);
      await page.goto(route, { waitUntil: "domcontentloaded" });

      const exposed = await page.evaluate(() =>
        Array.from(document.querySelectorAll("svg"))
          .filter((svg) => {
            // An SVG needs either a name (it conveys something) or
            // aria-hidden (it does not). Neither leaves a screen reader to
            // guess, and most announce "graphic" with no further detail.
            const hidden = svg.getAttribute("aria-hidden") === "true";
            const named =
              svg.getAttribute("aria-label") ||
              svg.getAttribute("role") === "img" ||
              svg.querySelector("title");
            // Inside a labelled control the parent supplies the name.
            const labelledParent = svg.closest("[aria-label], button, a[href]");
            return !hidden && !named && !labelledParent;
          })
          .map((svg) => svg.getAttribute("class")?.toString().slice(0, 40) ?? "(unclassed svg)"),
      );

      expect(exposed, `SVGs neither named nor hidden: ${exposed.join(", ")}`).toEqual([]);
    });
  }
});

// ── A11Y-31 (#769): focus order ─────────────────────────────────────────────

test.describe("focus order", () => {
  test("no element uses a positive tabIndex", async ({ page }) => {
    await stub(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const positive = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[tabindex]"))
        .filter((el) => Number(el.getAttribute("tabindex")) > 0)
        .map((el) => `${el.tagName.toLowerCase()}[tabindex=${el.getAttribute("tabindex")}]`),
    );

    // A positive tabIndex pulls an element out of document order and ahead of
    // everything else on the page. It is the single most common cause of focus
    // jumping somewhere the user did not expect.
    expect(positive, `positive tabIndex found: ${positive.join(", ")}`).toEqual([]);
  });

  test("the skip link is the first stop", async ({ page }) => {
    await stub(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.keyboard.press("Tab");

    // Its whole purpose is to let a keyboard user bypass the nav; anything
    // ahead of it defeats that.
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(focused).toMatch(/skip to main content/i);
  });

  for (const route of ROUTES) {
    test(`focus follows document order on ${route}`, async ({ page }) => {
      await stub(page);
      await page.goto(route, { waitUntil: "domcontentloaded" });

      // Walk a bounded number of stops and record the DOM position of each.
      const positions: number[] = [];
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press("Tab");
        const index = await page.evaluate(() => {
          const active = document.activeElement;
          if (!active || active === document.body) return -1;
          return Array.from(document.querySelectorAll("*")).indexOf(active);
        });
        if (index === -1) break;
        positions.push(index);
      }

      expect(positions.length, "nothing was focusable").toBeGreaterThan(0);

      // Each stop should be later in the document than the last. A decrease
      // means focus jumped backwards — the confusing behaviour this issue is
      // about. Allow a single wrap, which is the browser cycling past the end.
      const backwards = positions.filter((p, i) => i > 0 && p < positions[i - 1]);
      expect(
        backwards.length,
        `focus moved backwards ${backwards.length} time(s) on ${route}; order: ${positions.join(", ")}`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test("every focused element is visibly focused", async ({ page }) => {
    await stub(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const invisible: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const result = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const hasRing =
          style.outlineStyle !== "none" ||
          style.boxShadow !== "none" ||
          // Some designs indicate focus with a background or border change;
          // this is a heuristic, not a substitute for a human looking.
          style.borderColor !== getComputedStyle(document.body).borderColor;
        return hasRing ? null : `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 30)}`;
      });
      if (result) invisible.push(result);
    }

    // A keyboard user who cannot see where they are is navigating blind.
    expect(invisible, `no visible focus indicator on: ${invisible.join(", ")}`).toEqual([]);
  });
});
