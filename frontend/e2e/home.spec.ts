import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("should load successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/StellarWork/);
    await expect(page.getByRole("heading", { name: "Open Jobs" })).toBeVisible();
  });

  test("should navigate to post job page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Post Job" }).click();
    await expect(page).toHaveURL(/\/post-job/);
    await expect(page.getByRole("heading", { name: "Post Job" })).toBeVisible();
  });

  test("should navigate to dashboard page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
