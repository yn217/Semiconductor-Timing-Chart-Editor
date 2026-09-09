import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

test("captures the V1 Split View composition with both contexts and zero view mutation", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByLabel("New Transaction name").fill("Split View Read");
  await page.getByLabel("New Transaction start").fill("2");
  await page.getByLabel("New Transaction end").fill("7");
  // Scoped to the transaction editor's own submit button -- an unscoped
  // page-wide "Create Transaction" is now ambiguous against the Ribbon's
  // "Create Transaction" button, which shares the same accessible name.
  await page.getByTestId("transaction-editor").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true");

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Split");
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await expect(surface).toBeVisible();
  const transactionPane = page.locator(".split-transaction-pane");
  const signalPane = page.locator(".split-signal-content");
  const transactionBox = await transactionPane.boundingBox();
  const signalBox = await signalPane.boundingBox();
  expect(transactionBox).not.toBeNull();
  expect(signalBox).not.toBeNull();
  expect(transactionBox!.x).toBeLessThan(signalBox!.x);
  expect(transactionBox!.y).toBeCloseTo(signalBox!.y, 0);
  expect(transactionBox!.width).toBeGreaterThanOrEqual(280);
  expect(signalBox!.width).toBeGreaterThanOrEqual(420);
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Transaction");
  await signalPane.click({ position: { x: 40, y: 100 } });
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Signal");
  await expect(page.locator("[data-major-group='Layout']")).toHaveCount(1);
  await transactionPane.click({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Transaction");
  await expect(page.locator("[data-major-group='Layout']")).toHaveCount(0);
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true })).toBeVisible();
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true })).toBeVisible();
  await mkdir(resolve(process.cwd(), "artifacts", "gui-split-view"), { recursive: true });
  await page.screenshot({ path: resolve(process.cwd(), "artifacts", "gui-split-view", "split-1672x941.png"), animations: "disabled" });

  await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(surface).toHaveAttribute("data-history-depth", before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(surface.locator("[data-role='timing-chart-surface']")).toHaveAttribute("data-render-counters", before.counters!);
});
