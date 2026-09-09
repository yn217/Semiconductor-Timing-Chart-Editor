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
      const menu = page.getByRole("menu", { name: "More Home Commands" });
      await expect(menu).toBeVisible();
      for (const label of ["New", "Open", "Save", "Save As", "Recent", "Undo", "Copy", "Paste", "Delete", "Select All Signals", "Hide", "Move Down", "Zoom −", "Zoom +", "Zoom 50%", "Zoom 100%", "Zoom 150%", "Zoom 200%", "Zoom 400%", "Zoom 800%", "Fit Selection", "Fit All", "Grid", "Snap", "Ruler", "MiniMap"]) {
        await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
      }
      for (const label of ["Document Properties", "Problems", "SVG / PNG / PDF"]) {
        await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
      }
      const revision = await page.getByTestId("revision-status").textContent();
      await menu.getByRole("menuitem", { name: "Select All Signals", exact: true }).click();
      await expect(page.getByTestId("selection-status")).toHaveText("8 signals");
      await expect(page.getByTestId("revision-status")).toHaveText(revision!);
    } else {
      await expect(ribbon.locator(".ribbon-major-group")).toHaveCount(8);
      expect(await ribbon.locator(".ribbon-major-group").evaluateAll((groups) => groups.map((group) => group.getAttribute("data-major-group")))).toEqual(["File", "Edit", "Time", "Zoom", "Transaction", "Layout", "Display", "Options"]);
    }
  });
}

test("Home overflow zoom presets remain view-only at compact width", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const ribbon = page.getByTestId("ribbon");
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const beforeDirty = await page.getByTestId("dirty-status").textContent();
  const beforeCounters = await page.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters");
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  const menu = page.getByRole("menu", { name: "More Home Commands" });
  await menu.getByRole("menuitem", { name: "Zoom 150%", exact: true }).click();
  await expect(page.getByTestId("zoom-status-bar")).toHaveText("Zoom: 150%");
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await expect(page.getByTestId("dirty-status")).toHaveText(beforeDirty!);
  await expect(page.locator("[data-role='timing-chart-surface']")).toHaveAttribute("data-render-counters", beforeCounters!);
});
