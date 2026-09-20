import { test, expect } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

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
  await page.getByTestId("next-fit-selection").click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-zoom", "1.5");
  await page.getByTestId("next-fit-all").click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-zoom", "1");
  await expect(page.getByTestId("next-signal-tree-canvas")).toBeVisible();
  const firstTreeItem = page.getByRole("treeitem").first();
  await expect(firstTreeItem).toBeVisible();
  await firstTreeItem.click();
  await expect(firstTreeItem).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-selected-signal", /.+/);
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-revision", "0");
  await expect(page.getByTestId("next-cycle-viewport")).toBeVisible();
  await expect(page.getByTestId("next-geometry-grid")).toHaveCount(1);
  await expect(page.getByTestId("next-cycle-ruler")).toBeVisible();
  await expect(page.getByTestId("next-range-band")).toHaveCount(1);
  await expect(page.getByTestId("next-surface-host").locator("svg")).toHaveCount(1);
  await expect(page.getByTestId("next-bottom-editor")).toBeVisible();
  await page.getByRole("tab", { name: "Transaction" }).click();
  await expect(page.getByTestId("next-bottom-content")).toContainText("Transaction");
  await page.getByTestId("next-follow-selection").check();
  await page.getByTestId("next-bottom-pin").click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-next-revision", "0");
  await expect(page.getByTestId("next-inspector")).toBeVisible();
  await expect(page.getByTestId("next-status")).toContainText("Signals:");
  await expect(page.getByTestId("next-dirty-status")).toHaveText("Clean");
});

test("legacy production mount remains the default", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.getByTestId("next-ribbon")).toHaveCount(0);
});
