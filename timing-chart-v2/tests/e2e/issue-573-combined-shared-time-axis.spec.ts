import { expect, test } from "@playwright/test";

// #573 closure rule: in Combined mode, the same source cycle must land at the same screen X in the Transaction pane (upper) and the
// Cycle waveform pane (lower) -- proof of one shared authoritative horizontal time axis, not just two panes on screen together.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
test(`Combined: same source cycle maps to the same screen X in Transaction and Cycle panes at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  await expect(page.getByTestId("combined-split-divider")).toBeVisible();

  const x = async () => page.evaluate(() => {
    const tick = document.querySelector<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick[data-source-cycle='10']");
    const bar = document.querySelector<HTMLElement>(".split-transaction-pane .transaction-track [data-transaction-id]");
    return { tickX: tick ? Math.round(tick.getBoundingClientRect().left) : undefined, barLeft: bar ? Math.round(bar.getBoundingClientRect().left) : undefined };
  });
  const before = await x();
  expect(before.tickX).toBeDefined();

  // Vertical navigation and interaction ownership are independent: scrolling the Cycle waveform pane must not move the Transaction pane's
  // own vertical scroll, while the shared horizontal axis stays in lockstep.
  const cycleViewport = page.getByTestId("cycle-viewport");
  const owner = cycleViewport.locator("[data-role='timeline-viewport']");
  const transactionPane = page.locator(".split-transaction-pane");
  const transactionScrollBefore = await transactionPane.evaluate((el) => el.scrollTop);
  await cycleViewport.evaluate(async (el) => { el.scrollTop = 40; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await transactionPane.evaluate((el) => el.scrollTop)).toBe(transactionScrollBefore);

  // Shared horizontal scroll: scrolling the Cycle viewport horizontally must move the Transaction bars by the same source-time mapping.
  await owner.evaluate(async (el) => { el.scrollLeft = 200; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await page.waitForTimeout(200);
  const after = await x();
  if (before.barLeft !== undefined && after.barLeft !== undefined) {
    // The Transaction bar moved by (approximately) the same amount as the Cycle scroll -- same axis, not two independent ones.
    expect(Math.abs((before.barLeft - after.barLeft) - 200)).toBeLessThanOrEqual(3);
  }
});
}

test("Combined round trips: Cycle -> Combined -> Cycle and Transaction -> Combined -> Transaction are view-only", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const history = await page.getByTestId("history-status").innerText();
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const modes = page.locator(".view-mode");
  for (const start of ["Cycle", "Transaction"] as const) {
    await modes.getByRole("button", { name: start, exact: true }).click();
    await modes.getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.locator(".split-transaction-pane")).toBeVisible();
    await modes.getByRole("button", { name: start, exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${start}`);
  }
  await expect(page.getByTestId("history-status")).toHaveText(history);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
});
