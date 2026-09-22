import { expect, test } from "@playwright/test";

// The Combined Transaction/Cycle divider must stay pinned to the visible left edge and draggable after horizontal scroll.
test("Combined divider stays visible and draggable after a horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Split");
  const viewport = page.getByTestId("cycle-viewport");
  await viewport.evaluate((element) => { element.scrollLeft = 900; element.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(400);
  const divider = page.getByTestId("combined-split-divider");
  const viewportBox = (await viewport.boundingBox())!;
  const dividerBox = (await divider.boundingBox())!;
  expect(Math.abs(dividerBox.x - viewportBox.x), "divider pinned to the visible left edge").toBeLessThanOrEqual(2);
  const before = (await page.locator(".split-transaction-pane").boundingBox())!.height;
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2 + 48);
  await page.mouse.up();
  await expect.poll(async () => (await page.locator(".split-transaction-pane").boundingBox())!.height).not.toBe(before);
  // View-only.
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
