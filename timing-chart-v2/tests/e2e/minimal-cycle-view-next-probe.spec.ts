import { test, expect } from "@playwright/test";

test("parallel replacement has an isolated opt-in mount", async ({ page }) => {
  await page.goto("/?implementation=next");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-owner", "ui");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-application-owner", "application");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-timeline-owner", "timeline");
  await expect(page.getByTestId("next-ribbon")).toBeVisible();
  await expect(page.getByTestId("next-timeline-controls")).toBeVisible();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-zoom", "1");
  await page.getByTestId("next-zoom-in").click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-zoom", "1.1");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-revision", "0");
  await page.getByTestId("next-cycle-next").click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-selected-cycle", "1");
  await expect(page.getByTestId("next-signal-tree-canvas")).toBeVisible();
  await expect(page.getByRole("treeitem").first()).toBeVisible();
  await expect(page.getByTestId("next-cycle-viewport")).toBeVisible();
  await expect(page.getByTestId("next-bottom-editor")).toBeVisible();
  await page.getByRole("tab", { name: "Transaction" }).click();
  await expect(page.getByTestId("next-bottom-content")).toContainText("Transaction");
  await page.getByTestId("next-follow-selection").check();
  await page.getByTestId("next-bottom-pin").click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-revision", "0");
  await expect(page.getByTestId("next-inspector")).toBeVisible();
  await expect(page.getByTestId("next-status")).toContainText("Phase 1");
});

test("legacy production mount remains the default", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.getByTestId("next-ribbon")).toHaveCount(0);
});
