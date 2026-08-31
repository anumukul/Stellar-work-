import { test, expect, type Page } from "@playwright/test";

const BREAKPOINTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const ROUTES = [
  { path: "/", slug: "home" },
  { path: "/job/1", slug: "job-detail" },
  { path: "/post-job", slug: "post-job" },
  { path: "/dashboard", slug: "dashboard" },
  { path: "/disputes", slug: "disputes" },
  { path: "/profile", slug: "profile" },
];

async function assertNoHorizontalOverflow(page: Page, route: string) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;

    const offenders: string[] = [];
    if (Math.max(doc.scrollWidth, body?.scrollWidth ?? 0) > doc.clientWidth) {
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const rect = el.getBoundingClientRect();
        if (rect.right > doc.clientWidth + 1 || rect.left < -1) {
          const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : "";
          offenders.push(`${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} (left=${Math.round(rect.left)}, right=${Math.round(rect.right)})`);
        }
      }
    }

    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      offenders: offenders.slice(0, 5),
    };
  });

  expect(
    metrics.scrollWidth,
    `horizontal overflow on ${route}: ${metrics.offenders.join(", ") || "scrollWidth exceeded clientWidth"}`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

for (const route of ROUTES) {
  test.describe(`no horizontal overflow - ${route.slug}`, () => {
    for (const bp of BREAKPOINTS) {
      test(`${bp.name} (${bp.width}x${bp.height})`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await page.goto(route.path, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);

        await assertNoHorizontalOverflow(page, route.path);

        const shot = await page.screenshot({
          fullPage: true,
          path: `e2e-screenshots/${bp.width}x${bp.height}-${route.slug}.png`,
        });
        await testInfo.attach(`${bp.name}-${route.slug}`, {
          body: shot,
          contentType: "image/png",
        });
      });
    }
  });
}