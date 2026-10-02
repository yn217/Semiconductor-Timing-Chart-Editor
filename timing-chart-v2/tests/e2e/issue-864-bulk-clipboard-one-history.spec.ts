import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #864: multi-entity Select All -> Duplicate -> Delete on a 1,000-Signal document is ONE atomic History entry per operation (not one per
 * entity) and settles well inside a generous bound. The bound is deliberately loose (machine-independent regression guard); the measured
 * numbers live in the Issue.
 */
test("Select All + Duplicate + Delete on 1000 Signals are one History entry each and settle quickly", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 1000, cycleCount: 100, profile: "standard" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "b864.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const shell = page.locator(".editor-shell");
  const history = page.getByTestId("history-status");

  await ribbon.getByRole("button", { name: "Select All Signals", exact: true }).click();
  await expect(page.getByText("Selected: 1000 signals")).toBeVisible();

  const duplicateStart = Date.now();
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).first().click();
  await expect(shell).toHaveAttribute("data-signal-count", "2000");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  expect(Date.now() - duplicateStart, "Duplicate of 1000 Signals applied to idle").toBeLessThan(10_000);
  await expect(history).toHaveText("History 1 / Redo 0");

  const deleteStart = Date.now();
  await ribbon.getByRole("button", { name: "Delete", exact: true }).first().click();
  await expect(shell).toHaveAttribute("data-signal-count", "1000");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  expect(Date.now() - deleteStart, "Delete of 1000 Signals applied to idle").toBeLessThan(10_000);
  await expect(history).toHaveText("History 2 / Redo 0");

  // One Undo restores the deleted batch atomically.
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(shell).toHaveAttribute("data-signal-count", "2000");
  await expect(history).toHaveText("History 1 / Redo 1");
});
