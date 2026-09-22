import { expect, test } from "@playwright/test";

for (const viewportSize of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction Tree stays fixed while the timeline scrolls horizontally at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
    await page.setViewportSize(viewportSize);
    await page.goto("/?transaction-demo");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    const tree = page.getByTestId("transaction-left-tree");
    const viewport = page.getByTestId("cycle-viewport");
    // cyclesPerTC compresses the demo to ~16 TC (#750); zoom in (view-only) so there is a real horizontal extent to scroll.
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption("800");
    const bar = page.locator(".transaction-lane > button[data-transaction-id]").first();
    await expect(tree).toBeVisible();
    await expect(bar).toBeVisible();
    const history = await page.getByTestId("history-status").innerText();
    const treeBefore = (await tree.boundingBox())!;
    const barBefore = (await bar.boundingBox())!;
    const maxScroll = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(maxScroll).toBeGreaterThan(500);
    await viewport.evaluate((el) => { el.scrollLeft = 1000; });
    await expect.poll(async () => Math.round((await bar.boundingBox())!.x)).toBeLessThan(Math.round(barBefore.x) - 500);
    const treeAfter = (await tree.boundingBox())!;
    expect(Math.abs(treeAfter.x - treeBefore.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(treeAfter.width - treeBefore.width)).toBeLessThanOrEqual(1);
    expect(await tree.evaluate((el) => el.closest(".cycle-viewport") === null)).toBe(true);
    await expect(page.getByTestId("history-status")).toHaveText(history);
  });
}
