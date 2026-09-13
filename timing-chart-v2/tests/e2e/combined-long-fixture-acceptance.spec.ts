import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { expect, test, type Page } from "@playwright/test";

async function openLong(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 1000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "combined-long.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible({ timeout: 2000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) await page.getByTestId("unsaved-discard").click();
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(100);
}

test("#573 performance fixture enables horizontal and independent vertical scroll", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await openLong(page);
  const viewport = page.getByTestId("cycle-viewport");
  const tx = page.locator(".split-transaction-pane");
  const cycle = page.locator(".split-signal-content");
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const size = await viewport.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(size.scrollWidth).toBeGreaterThan(size.clientWidth);
  const horizontalTarget = Math.min(40, size.scrollWidth - size.clientWidth);
  await viewport.evaluate((el, target) => { el.scrollLeft = target; el.dispatchEvent(new Event("scroll", { bubbles: true })); }, horizontalTarget);
  await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBe(horizontalTarget);
  const txMax = await tx.evaluate((el) => el.scrollHeight - el.clientHeight);
  const txTarget = Math.min(60, txMax);
  expect(txTarget).toBeGreaterThan(0);
  await tx.evaluate((el, target) => { el.scrollTop = target; el.dispatchEvent(new Event("scroll", { bubbles: true })); }, txTarget);
  await expect.poll(() => tx.evaluate((el) => el.scrollTop)).toBe(txTarget);
  expect(await cycle.evaluate((el) => el.scrollTop)).toBe(0);
  const cycleMax = await cycle.evaluate((el) => el.scrollHeight - el.clientHeight);
  const cycleTarget = Math.min(60, cycleMax);
  expect(cycleTarget).toBeGreaterThan(0);
  await cycle.evaluate((el, target) => { el.scrollTop = target; el.dispatchEvent(new Event("scroll", { bubbles: true })); }, cycleTarget);
  await expect.poll(() => cycle.evaluate((el) => el.scrollTop)).toBe(cycleTarget);
  expect(await tx.evaluate((el) => el.scrollTop)).toBe(txTarget);
  const divider = page.getByTestId("combined-split-divider");
  const dividerBox = await divider.boundingBox();
  expect(dividerBox).not.toBeNull();
  const dividerX = dividerBox!.x + dividerBox!.width / 2;
  const dividerY = dividerBox!.y + dividerBox!.height / 2;
  await page.mouse.move(dividerX, dividerY); await page.mouse.down(); await page.mouse.move(dividerX, 0); await page.mouse.up();
  expect((await tx.boundingBox())!.height).toBeGreaterThanOrEqual(160);
  expect((await cycle.boundingBox())!.height).toBeGreaterThanOrEqual(220);
  const lowerDividerBox = await divider.boundingBox();
  await page.mouse.move(dividerX, lowerDividerBox!.y + lowerDividerBox!.height / 2); await page.mouse.down(); await page.mouse.move(dividerX, page.viewportSize()!.height); await page.mouse.up();
  expect((await tx.boundingBox())!.height).toBeGreaterThanOrEqual(160);
  expect((await cycle.boundingBox())!.height).toBeGreaterThanOrEqual(220);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
});
