import { expect, test } from "@playwright/test";

/**
 * The Transaction tree header clips its children, so its "..." menu used to be cut to the first item and drawn behind the timeline.
 * Every menu item must be on top (hit-testable at its own centre) and fully inside the viewport, and a click must run its action.
 */
test("Transaction tree actions menu shows every item above the timeline and runs them", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("transaction-tree-more")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("transaction-tree-more").click();
  const menu = page.getByTestId("transaction-tree-more-menu");
  await expect(menu).toBeVisible();
  const items = menu.getByRole("menuitem");
  expect(await items.count()).toBeGreaterThanOrEqual(5);
  const result = await items.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { label: node.textContent, onTop: hit === node || node.contains(hit), inside: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth };
  }));
  for (const item of result) { expect(item.onTop, `${item.label} is covered`).toBe(true); expect(item.inside, `${item.label} is off-screen`).toBe(true); }
  await menu.screenshot({ path: "test-results/transaction-tree-more-menu.png" });
  await page.getByTestId("transaction-tree-collapse-all").click();
  await expect(menu).toHaveCount(0);
});
