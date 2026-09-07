import { expect, test } from "@playwright/test";

// #453: "Load Example" was removed from the normal Bottom Panel empty state
// -- build the same Start 2/End 12, 3-phase (Request 2-5/Processing 5-9/
// Response 9-12) shape through the ordinary Create Transaction + Inspector
// Phase table UI instead of a one-click fixture load.
async function createTransactionWithPhases(page: import("@playwright/test").Page) {
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  const editor = page.getByTestId("transaction-editor");
  await editor.getByLabel("Transaction start", { exact: true }).fill("2");
  await editor.getByLabel("Transaction end", { exact: true }).fill("12");
  await editor.getByTestId("apply-transaction-properties").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");

  const inspector = page.getByTestId("inspector");
  const bounds: readonly [string, number, number][] = [["Request", 2, 5], ["Processing", 5, 9], ["Response", 9, 12]];
  for (let i = 0; i < bounds.length; i++) await inspector.getByTestId("add-transaction-phase").click();
  for (let i = 0; i < bounds.length; i++) {
    const [name, start, end] = bounds[i]!;
    await inspector.getByLabel(`Phase ${i + 1} name`).fill(name);
    await inspector.getByLabel(`Phase ${i + 1} start`).fill(String(start));
    await inspector.getByLabel(`Phase ${i + 1} end`).fill(String(end));
  }
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

for (const width of [1280, 1672]) test(`Transaction phases follow semantic durations at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 720 : 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await createTransactionWithPhases(page);
  const phases = page.locator(".transaction-phases small");
  await expect(phases).toHaveCount(3);
  const boxes = await phases.evaluateAll(es => es.map(e => ({ width: e.getBoundingClientRect().width, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right })));
  expect(Math.abs(boxes[0]!.width / 3 - boxes[1]!.width / 4)).toBeLessThan(1);
  expect(Math.abs(boxes[0]!.right - boxes[1]!.left)).toBeLessThan(1);
  expect(Math.abs(boxes[1]!.right - boxes[2]!.left)).toBeLessThan(1);
  await page.screenshot({ path: `artifacts/transaction-phases-${width}.png` });
});
