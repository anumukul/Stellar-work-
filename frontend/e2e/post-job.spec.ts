import { test, expect } from "@playwright/test";

test.describe("Post Job Form", () => {
  test("should show validation errors for required fields", async ({ page }) => {
    await page.goto("/post-job");
    await page.getByRole("button", { name: "Post Job" }).click();
    await expect(page.getByText("This field is required")).toBeVisible();
  });

  test("should have amount input", async ({ page }) => {
    await page.goto("/post-job");
    await expect(page.getByLabel("Amount (XLM)")).toBeVisible();
  });

  test("should have description textarea", async ({ page }) => {
    await page.goto("/post-job");
    await expect(page.getByLabel("Job Description")).toBeVisible();
  });
});
