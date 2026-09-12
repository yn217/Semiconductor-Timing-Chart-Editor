import { expect, test } from "@playwright/test";

// Transaction Mode opens with the approved six-transaction sample so the
// phase projection can be verified directly in the production surface.
async function openTransactionSample(page: import("@playwright/test").Page) {
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_read")).toBeVisible();
}

for (const width of [1280, 1672]) test(`Transaction phases follow semantic durations at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 720 : 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await openTransactionSample(page);
  const phases = page.locator("[data-transaction-id='demo_txn_read'] .transaction-phases small");
  await expect(phases).toHaveCount(3);
  const boxes = await phases.evaluateAll(es => es.map(e => ({ width: e.getBoundingClientRect().width, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right })));
  expect(Math.abs(boxes[0]!.width / 10 - boxes[1]!.width / 30)).toBeLessThan(1);
  expect(Math.abs(boxes[0]!.right - boxes[1]!.left)).toBeLessThan(1);
  expect(Math.abs(boxes[1]!.right - boxes[2]!.left)).toBeLessThan(1);
  await page.screenshot({ path: `artifacts/transaction-phases-${width}.png` });
});
