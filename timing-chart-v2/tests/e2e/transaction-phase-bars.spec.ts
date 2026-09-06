import { expect, test } from "@playwright/test";

for (const width of [1280, 1672]) test(`Transaction phases follow semantic durations at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 720 : 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByTestId("load-transaction-example").click();
  const phases = page.locator(".transaction-phases small");
  await expect(phases).toHaveCount(3);
  const boxes = await phases.evaluateAll(es => es.map(e => ({ width: e.getBoundingClientRect().width, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right })));
  expect(Math.abs(boxes[0]!.width / 3 - boxes[1]!.width / 4)).toBeLessThan(1);
  expect(Math.abs(boxes[0]!.right - boxes[1]!.left)).toBeLessThan(1);
  expect(Math.abs(boxes[1]!.right - boxes[2]!.left)).toBeLessThan(1);
  await page.screenshot({ path: `artifacts/transaction-phases-${width}.png` });
});
