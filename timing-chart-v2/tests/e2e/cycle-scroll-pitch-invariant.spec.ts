import { expect, test } from "@playwright/test";
import { hoverTimelineArea, timelineOwner } from "./timeline-scroll.js";

for (const viewportSize of [
  { width: 1672, height: 941 },
  { width: 1280, height: 720 },
]) {
  test(`Cycle ruler and grid pitch remain invariant through horizontal scroll at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
    await page.setViewportSize(viewportSize);
    await page.goto("/?transaction-demo");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");

    const viewport = page.getByTestId("cycle-viewport");
    const surface = page.getByTestId("cycle-surface");
    const ruler = page.getByTestId("cycle-ruler");
    const grid = page.getByTestId("geometry-grid");
    const beforeState = {
      revision: await host.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").innerText(),
      dirty: await page.getByTestId("dirty-status").innerText(),
    };
    const x = async (locator: ReturnType<typeof page.locator>) => {
      const box = await locator.boundingBox();
      expect(box, "expected source-cycle geometry to be rendered").not.toBeNull();
      return box!.x;
    };
    const rulerPitch = async () => (await x(ruler.locator("[data-cycle='4']")) - await x(ruler.locator("[data-cycle='2']"))) / 2;
    const gridPitch = async () => (await x(grid.locator("[data-role='geometry-grid-line'][data-cycle='4']")) - await x(grid.locator("[data-role='geometry-grid-line'][data-cycle='2']"))) / 2;

    const initialScrollLeft = await timelineOwner(page).evaluate((element) => element.scrollLeft);
    const initialRulerPitch = await rulerPitch();
    const initialGridPitch = await gridPitch();
    await hoverTimelineArea(page);
    await page.mouse.wheel(240, 0);
    await expect.poll(() => timelineOwner(page).evaluate((element) => element.scrollLeft)).toBeGreaterThan(initialScrollLeft);

    expect(Math.abs(await rulerPitch() - initialRulerPitch)).toBeLessThan(0.75);
    expect(Math.abs(await gridPitch() - initialGridPitch)).toBeLessThan(0.75);
    expect(Math.abs(initialRulerPitch - initialGridPitch)).toBeLessThan(1.5);
    await expect(host).toHaveAttribute("data-canonical-revision", beforeState.revision!);
    await expect(page.getByTestId("history-status")).toHaveText(beforeState.history);
    await expect(page.getByTestId("dirty-status")).toHaveText(beforeState.dirty);
  });
}
