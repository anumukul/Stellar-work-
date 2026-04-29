import { test, expect } from "@playwright/test";

test.describe("Job Detail Page", () => {
  test("should load job detail page with valid id", async ({ page }) => {
    await page.goto("/job/1");
    await expect(page.getByRole("heading", { name: /Job #/ })).toBeVisible();
  });

  test("should show error for non-numeric job id", async ({ page }) => {
    await page.goto("/job/abc");
    await expect(page.getByText(/invalid job id/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /back/i })).toBeVisible();
  });

  test("should show error for negative job id", async ({ page }) => {
    await page.goto("/job/-1");
    await expect(page.getByText(/invalid job id/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /back/i })).toBeVisible();
  });

  test("should show not found for non-existent job", async ({ page }) => {
    await page.goto("/job/999999");
    await expect(page.getByText(/job not found/i)).toBeVisible();
  });

  test("should navigate back to home", async ({ page }) => {
    await page.goto("/job/1");
    await page.getByRole("link", { name: /back/i }).click();
    await expect(page).toHaveURL("/");
  });
});
