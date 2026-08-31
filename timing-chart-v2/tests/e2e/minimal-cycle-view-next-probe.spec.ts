import { test, expect } from "@playwright/test";

test("parallel replacement has an isolated opt-in mount", async ({ page }) => {
  await page.goto("/?implementation=next");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-owner", "ui");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-application-owner", "application");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-timeline-owner", "timeline");
  await expect(page.getByTestId("next-ribbon")).toBeVisible();
  await expect(page.getByTestId("next-signal-tree-canvas")).toBeVisible();
  await expect(page.getByTestId("next-bottom-editor")).toBeVisible();
  await expect(page.getByTestId("next-inspector")).toBeVisible();
  await expect(page.getByTestId("next-status")).toContainText("Phase 1");
});

test("legacy production mount remains the default", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.getByTestId("next-ribbon")).toHaveCount(0);
});
