import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("10k Transaction fixture keeps mounted lane DOM viewport-bounded", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 500, profile: "transaction-heavy" });
  const document = { ...base, transactions: Array.from({ length: 10_000 }, (_, index) => ({ id: `txn_browser_${index}`, name: `Transaction ${index}`, start: (index * 3) % 490, end: ((index * 3) % 490) + 4, laneId: `lane_${index % 16}`, linkedSignals: [base.signals[index % base.signals.length]!.id] })) };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "transaction-10k.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "10000", { timeout: 60_000 });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible({ timeout: 60_000 });
  const metrics = await page.getByTestId("transaction-lanes").evaluate((element) => ({
    totalHeight: Number.parseFloat((element as HTMLElement).style.height),
    mountedBars: element.querySelectorAll("[data-transaction-id]").length,
    mountedTreeRows: element.querySelectorAll("[data-testid^='transaction-tree-row-']").length,
  }));
  expect(metrics.totalHeight).toBeGreaterThan(10_000);
  expect(metrics.mountedBars).toBeLessThan(1_000);
  expect(metrics.mountedTreeRows).toBeLessThan(1_000);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
