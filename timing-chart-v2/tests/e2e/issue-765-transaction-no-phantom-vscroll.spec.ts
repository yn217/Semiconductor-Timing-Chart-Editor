import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #765: the standalone Transaction timeline's vertical extent is exactly its own content (ruler + lanes); the hidden Cycle signal plane
// never adds to it, so a scrollbar appears only when the lanes genuinely exceed the viewport.
const owner = (page: Page) => page.getByTestId("cycle-viewport");
const metrics = (page: Page) => owner(page).evaluate((el) => {
  const lanes = el.querySelector<HTMLElement>(".transaction-lanes")!;
  const ruler = el.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
  return { ch: el.clientHeight, sh: el.scrollHeight, content: Math.round(lanes.offsetTop + lanes.offsetHeight), ruler: ruler.offsetHeight };
});
const openTransaction = async (page: Page, viewport: { width: number; height: number }) => {
  await page.setViewportSize(viewport);
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.locator(".transaction-lanes")).toBeVisible();
  await page.waitForTimeout(400);
};

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`scroll extent equals the Transaction content (and fits when there is room) at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openTransaction(page, viewport);
    // The grid lines span the Transaction lanes (not the hidden Cycle rows).
    const gridVsLanes = await page.evaluate(() => ({ grid: document.querySelector<HTMLElement>("[data-testid='geometry-grid']")?.offsetHeight ?? 0, lanes: document.querySelector<HTMLElement>(".transaction-lanes")!.offsetHeight }));
    expect(Math.abs(gridVsLanes.grid - gridVsLanes.lanes), JSON.stringify(gridVsLanes)).toBeLessThanOrEqual(1);
    const history = await page.getByTestId("history-status").innerText();
    const dirty = await page.getByTestId("dirty-status").innerText();
    // Invariant: no hidden Cycle rows inflate the scroll height.
    const m = await metrics(page);
    expect(m.sh, JSON.stringify(m)).toBeLessThanOrEqual(Math.max(m.ch, m.content) + 1);
    // Give the timeline room by shrinking Bottom: the lanes fit, so there must be no vertical overflow at all.
    const bottom = page.getByTestId("bottom-resizer");
    await bottom.focus();
    for (let step = 0; step < 12; step += 1) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const roomy = await metrics(page);
    expect(roomy.sh, JSON.stringify(roomy)).toBeLessThanOrEqual(Math.max(roomy.ch, roomy.content) + 1);
    // When the lanes fit (always at 1672x941 with Bottom shrunk) there must be no vertical overflow at all.
    if (viewport.height >= 900) { expect(roomy.content).toBeLessThanOrEqual(roomy.ch); expect(roomy.sh, JSON.stringify(roomy)).toBeLessThanOrEqual(roomy.ch + 1); }
    // Expanding Bottom again keeps the invariant.
    for (let step = 0; step < 16; step += 1) await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(300);
    const tight = await metrics(page);
    expect(tight.sh, JSON.stringify(tight)).toBeLessThanOrEqual(Math.max(tight.ch, tight.content) + 1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("history-status")).toHaveText(history);
    await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
    // Mode round trip restores the Cycle surface (its rows are still laid out).
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("cycle-surface").locator("[data-role='frozen-row']").first()).toBeVisible();
  });
}

test("a genuinely tall Transaction document keeps all lanes reachable through the one vertical owner", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const source = generatePerformanceDocument({ signalCount: 50, cycleCount: 100, profile: "transaction-heavy" });
  const tallDocument = {
    ...source,
    transactions: source.transactions.map((transaction, index) => ({ ...transaction, laneId: `overflow_lane_${index}` })),
  };
  // Load a real canonical document through the production Open path; do not fake overflow by styling the rendered DOM.
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "tall-transaction-layout.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(tallDocument)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.locator(".transaction-lanes")).toBeVisible();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "50");
  const history = await page.getByTestId("history-status").innerText();
  const dirty = await page.getByTestId("dirty-status").innerText();
  const m = await metrics(page);
  expect(m.sh).toBeGreaterThan(m.ch + 100);
  const viewportBox = (await owner(page).boundingBox())!;
  await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
  await page.mouse.wheel(0, 1_700);
  await expect.poll(() => owner(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const finalTransaction = page.locator("[data-transaction-id='txn_perf_49']");
  await expect(finalTransaction).toBeVisible();
  const finalBarBox = (await finalTransaction.boundingBox())!;
  expect(finalBarBox.y).toBeGreaterThanOrEqual(viewportBox.y - 1);
  expect(finalBarBox.y + finalBarBox.height).toBeLessThanOrEqual(viewportBox.y + viewportBox.height + 1);
  expect(await owner(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
});
