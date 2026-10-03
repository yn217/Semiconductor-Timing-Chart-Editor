import { expect, test } from "@playwright/test";

// #746: Group creation is visible in the Tree header and in Bottom, both through the same createTransactionGroup command; one History entry each; Undo removes it.
test("Tree and Bottom expose visible Group creation at both supported viewports", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  const status = () => page.evaluate(() => [document.querySelector("[data-testid='history-status']")?.textContent, document.querySelector("[data-testid='dirty-status']")?.textContent]);

  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("add-transaction-group-tree-visible"), "#1007: standalone + Group is removed").toHaveCount(0);
    const tree = page.getByTestId("add-transaction-tree");
    await expect(tree).toBeVisible();
    const box = (await tree.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    const heading = await page.locator(".left-column-heading").first().evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth, right: element.getBoundingClientRect().right }));
    expect(heading.scroll).toBeLessThanOrEqual(heading.client + 1);
    const groupCount = () => page.locator("[data-testid^='transaction-group-']").count();
    const before = await status();
    const groups = await groupCount();
    await tree.click();
    await page.getByTestId("add-transaction-group-menu-item").click();
    await expect.poll(status).not.toEqual(before);
    await expect.poll(groupCount).toBeGreaterThan(groups);
    await page.getByTestId("bottom-transaction-add-group").click();
    await expect.poll(groupCount).toBeGreaterThan(groups + 1);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+z");
    await expect.poll(groupCount).toBe(groups);
  }
});
