import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { expect, test, type Page } from "@playwright/test";

async function openLong(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 10000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "combined-long.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible({ timeout: 2000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) await page.getByTestId("unsaved-discard").click();
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  const mountedTransactions = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  await expect(mountedTransactions.first()).toBeVisible();
  await expect.poll(() => mountedTransactions.count()).toBeLessThanOrEqual(100);
}

for (const viewportSize of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) test(`#573 performance fixture enables horizontal and independent vertical scroll at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(viewportSize);
  await openLong(page);
  const viewport = page.getByTestId("cycle-viewport");
  const owner = viewport.locator("[data-role='timeline-viewport']");
  const tx = page.locator(".split-transaction-pane");
  const cycle = page.locator(".split-signal-content");
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const size = await owner.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(size.scrollWidth).toBeGreaterThan(size.clientWidth);
  const horizontalTarget = Math.min(40, size.scrollWidth - size.clientWidth);
  await owner.evaluate(async (el, target) => { el.scrollLeft = target; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }, horizontalTarget);
  await expect.poll(() => owner.evaluate((el) => el.scrollLeft)).toBe(horizontalTarget);
  await owner.evaluate(async (el) => { el.scrollLeft = 0; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect.poll(() => owner.evaluate((el) => el.scrollLeft)).toBe(0);
  const farTarget = Math.max(0, size.scrollWidth - size.clientWidth - 8);
  await owner.evaluate(async (el, target) => { el.scrollLeft = target; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }, farTarget);
  await expect.poll(() => owner.evaluate((el) => el.scrollLeft)).toBe(farTarget);
  await expect.poll(() => page.getByTestId("cycle-surface").locator("[data-role='wave-owner'] svg, [data-role='wave-owner'] canvas[data-wave-canvas]").count()).toBeGreaterThan(0);
  await owner.evaluate(async (el) => { el.scrollLeft = 0; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect.poll(() => owner.evaluate((el) => el.scrollLeft)).toBe(0);
  const txMax = await tx.evaluate((el) => el.scrollHeight - el.clientHeight);
  const txTarget = Math.min(60, txMax);
  expect(txTarget).toBeGreaterThan(0);
  await tx.evaluate(async (el, target) => { el.scrollTop = target; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }, txTarget);
  await expect.poll(() => tx.evaluate((el) => el.scrollTop)).toBe(txTarget);
  expect(await cycle.evaluate((el) => el.scrollTop)).toBe(0);
  const cycleMax = await cycle.evaluate((el) => el.scrollHeight - el.clientHeight);
  const cycleTarget = Math.min(60, cycleMax);
  expect(cycleTarget).toBeGreaterThan(0);
  await cycle.evaluate(async (el, target) => { el.scrollTop = target; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }, cycleTarget);
  await expect.poll(() => cycle.evaluate((el) => el.scrollTop)).toBe(cycleTarget);
  expect(await tx.evaluate((el) => el.scrollTop)).toBe(txTarget);
  const divider = page.getByTestId("combined-split-divider");
  const dividerBox = await divider.boundingBox();
  expect(dividerBox).not.toBeNull();
  const dividerX = dividerBox!.x + dividerBox!.width / 2;
  const dividerY = dividerBox!.y + dividerBox!.height / 2;
  await page.mouse.move(dividerX, dividerY); await page.mouse.down(); await page.mouse.move(dividerX, 0); await page.mouse.up();
  expect((await tx.boundingBox())!.height).toBeGreaterThanOrEqual(txFloor(page));
  await expectSignalPaneAboveBottomEditor(page);
  const lowerDividerBox = await divider.boundingBox();
  await page.mouse.move(dividerX, lowerDividerBox!.y + lowerDividerBox!.height / 2); await page.mouse.down(); await page.mouse.move(dividerX, page.viewportSize()!.height); await page.mouse.up();
  expect((await tx.boundingBox())!.height).toBeGreaterThanOrEqual(txFloor(page));
  await expectSignalPaneAboveBottomEditor(page);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
});

// The Signal pane scrolls above the Bottom editor (no rows hidden behind it), so its guaranteed height is what remains of the Main area.
async function expectSignalPaneAboveBottomEditor(page: Page) {
  const content = (await page.locator(".split-signal-content").boundingBox())!;
  const bottom = (await page.locator(".bottom-editor").boundingBox())!;
  expect(content.height).toBeGreaterThanOrEqual(96);
  expect(content.y + content.height).toBeLessThanOrEqual(bottom.y + 2);
}

// The Transaction pane keeps 160px, and yields down to 72px on a short window so the Signal pane stays usable above the Bottom editor.
function txFloor(page: Page) { return page.viewportSize()!.height >= 900 ? 160 : 72; }
