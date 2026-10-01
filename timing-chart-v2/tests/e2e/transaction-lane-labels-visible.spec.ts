import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("Transaction mode shows its Group and Lane labels next to the timeline", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const labels = page.locator(".transaction-lane-labels");
  await expect(labels).toBeVisible();
  const label = page.locator(".transaction-lane-label").first();
  await expect(label).toBeVisible();
  await expect(page.locator(".transaction-lane-label-row")).toHaveCount(0);
  const box = (await label.boundingBox())!;
  const tree = (await page.getByTestId("transaction-left-tree").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(tree.x + tree.width - 1);
  const clip = await page.locator(".non-split-signal-content").first().evaluate((el) => getComputedStyle(el).clipPath);
  expect(clip).toBe("none");
});

test("Lane-only center labels do not overlap for sequential Transactions; the left Tree remains authoritative", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 2, cycleCount: 100, profile: "transaction-heavy" });
  const transactions = Array.from({ length: 10 }, (_, index) => ({ id: `lane_label_${index}`, name: `Sequential ${index}`, start: index * 2, end: index * 2 + 1, laneId: "shared", linkedSignals: [base.signals[index % base.signals.length]!.id] }));
  const document = { ...base, transactions };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "lane-labels.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "10");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  const labels = page.getByTestId("transaction-lanes").locator(".transaction-lane-label");
  await expect(labels).toHaveCount(1);
  await expect(labels).toContainText("shared");
  await expect(page.getByTestId("transaction-lanes").locator(".transaction-lane-label-row")).toHaveCount(0);
  const treeRows = page.locator(".transaction-left-tree-row");
  await expect(treeRows).toHaveCount(10);
  const target = page.getByTestId("transaction-left-tree-row-lane_label_7");
  await target.click();
  await expect(page.locator("[data-transaction-id='lane_label_7']")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText(/Clean/);
});
