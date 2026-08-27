import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 720 }]) {
  test(`keeps Home commands reachable without a Ribbon scrollbar at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const ribbon = page.getByTestId("ribbon");
    await expect(ribbon).toHaveCSS("overflow-x", "hidden");
    expect(await ribbon.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }))).toEqual(expect.objectContaining({ scroll: expect.any(Number) }));
    const dimensions = await ribbon.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
    if (viewport.width <= 1100) {
      const overflow = ribbon.getByRole("button", { name: "More", exact: true });
      await expect(overflow).toBeVisible();
      await overflow.click();
      const menu = ribbon.getByRole("menu", { name: "More Home Commands" });
      await expect(menu).toBeVisible();
      for (const label of ["Undo", "Copy", "Paste", "Delete", "Select All", "Hide", "Move Down", "Properties", "Problems", "SVG / PNG / PDF"]) {
        await expect(menu.getByRole("button", { name: label, exact: true })).toBeVisible();
      }
      const revision = await page.getByTestId("revision-status").textContent();
      await menu.getByRole("button", { name: "Select All", exact: true }).click();
      await expect(page.getByTestId("selection-status")).toHaveText("8 signals");
      await expect(page.getByTestId("revision-status")).toHaveText(revision!);
    } else {
      await expect(ribbon.locator(".ribbon-group")).toHaveCount(12);
    }
  });
}
