import { expect, test } from "@playwright/test";

for (const viewportSize of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction Tree remains fixed while its timeline scrolls at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
    await page.setViewportSize(viewportSize);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

    const tree = page.getByTestId("transaction-left-tree");
    const viewport = page.getByTestId("cycle-viewport");
    const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id='demo_txn_fetch']");
    await expect(tree).toContainText("Memory");
    await expect(bar).toBeVisible();
    expect(await tree.evaluate((element) => element.closest(".cycle-viewport"))).toBeNull();
    await expect.poll(() => viewport.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);

    const treeXBefore = (await tree.boundingBox())!.x;
    const barXBefore = (await bar.boundingBox())!.x;
    await viewport.hover();
    await page.mouse.wheel(600, 0);
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    expect((await tree.boundingBox())!.x).toBeCloseTo(treeXBefore, 0);
    expect((await bar.boundingBox())!.x).toBeLessThan(barXBefore);
    await expect(tree).toContainText("Fetch_0");
  });
}
