import { expect, test } from "@playwright/test";

test("keeps geometry Grid aligned with the Ruler through view-only zoom", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    counters: await surface.getAttribute("data-render-counters"),
  };
  const rulerTick = page.getByTestId("cycle-ruler").locator("[data-cycle='10']");
  const gridLine = page.getByTestId("geometry-grid").locator("[data-role='geometry-grid-line'][data-cycle='10']");
  const aligned = async () => {
    const rulerBox = await rulerTick.boundingBox();
    const gridBox = await gridLine.boundingBox();
    expect(rulerBox).not.toBeNull();
    expect(gridBox).not.toBeNull();
    expect(Math.abs((rulerBox?.x ?? 0) - (gridBox?.x ?? 0))).toBeLessThan(2);
  };

  await aligned();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  await aligned();
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(host).toHaveAttribute("data-history-depth", before.history!);
  await expect(surface).toHaveAttribute("data-render-counters", before.counters!);
});
