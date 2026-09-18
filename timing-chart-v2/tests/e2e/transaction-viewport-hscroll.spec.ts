import { expect, test } from "@playwright/test";

// Transaction Mode's tree header (`.column-headings[data-testid="transaction-tree-header"]`)
// is 58px tall, not the plain 37px every other mode's `.column-headings` uses
// (it carries an extra Transactions/Signals tab row). `.cycle-viewport` kept
// the flat `calc(100% - 37px)` height regardless of mode, so in Transaction
// Mode its bottom ~21px -- exactly enough to swallow the reserved horizontal
// scrollbar -- fell past `.cycle-panel`'s own `overflow: hidden` edge and was
// clipped away, leaving no visible/usable horizontal scrollbar even though
// `.transaction-lanes` is far wider than the viewport once zoomed in.

test("Transaction Mode's cycle-viewport is not clipped by its panel, so the horizontal scrollbar stays usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  // Zoom in enough that the transaction lanes genuinely overflow the
  // viewport's width -- the scrollbar-clipping bug only manifests once
  // horizontal scrolling is actually needed.
  for (let index = 0; index < 6; index += 1) {
    await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  }

  const panel = page.locator(".cycle-panel.mode-transaction");
  const viewport = page.getByTestId("cycle-viewport");
  const tree = page.getByTestId("transaction-left-tree");
  const firstBar = page.locator(".transaction-lane > button[data-transaction-id]").first();

  const overflow = await viewport.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow, "transaction-lanes must genuinely overflow the viewport width for this test to be meaningful").toBeGreaterThan(50);

  const panelBottom = await panel.evaluate((element) => element.getBoundingClientRect().bottom);
  const viewportBottom = await viewport.evaluate((element) => element.getBoundingClientRect().bottom);
  // The viewport's own box (which includes its reserved horizontal-scrollbar
  // strip) must fit entirely inside its panel's clipping box -- previously
  // it overflowed by ~21px and the scrollbar strip was clipped away.
  expect(viewportBottom).toBeLessThanOrEqual(panelBottom + 0.5);

  // The scrollbar being un-clipped means the viewport is actually
  // horizontally scrollable by the user, not just via scrollLeft. The Tree
  // must remain at the same screen X while the timing content moves beneath
  // it; otherwise the left pane disappears with the scrolled timeline.
  await viewport.evaluate((element) => { element.scrollLeft = 0; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  const before = await page.evaluate(() => ({
    treeLeft: document.querySelector<HTMLElement>("[data-testid='transaction-left-tree']")!.getBoundingClientRect().left,
    barLeft: document.querySelector<HTMLElement>(".transaction-lane > button[data-transaction-id]")!.getBoundingClientRect().left,
  }));
  await viewport.evaluate((element) => { element.scrollLeft = 200; });
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(200);
  await expect.poll(() => tree.evaluate((element) => element.getBoundingClientRect().left)).toBeCloseTo(before.treeLeft, 0);
  const afterBarLeft = await firstBar.evaluate((element) => element.getBoundingClientRect().left);
  expect(afterBarLeft, "the timeline bar should still move with horizontal scrolling").toBeLessThan(before.barLeft);
});
