import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`#598 frozen Cycle columns stay fixed and clip time content at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("cycle-viewport")).toBeVisible();
    const frozen = page.locator("[data-role='frozen-row'][data-kind='timing']").first();
    await expect(frozen).toBeVisible();
    await frozen.click();
    await expect(page.getByTestId("inspector-shell")).toBeVisible();
    await expect(page.getByTestId("bottom-resizer")).toBeVisible();
    const viewportEl = page.getByTestId("cycle-viewport");
    const before = await frozen.boundingBox();
    expect(before).not.toBeNull();
    const overflow = await viewportEl.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
    const target = Math.min(120, overflow.scrollWidth - overflow.clientWidth);
    for (const position of [0, Math.floor(target / 2), target]) {
      await viewportEl.evaluate((element, value) => { element.scrollLeft = value; element.dispatchEvent(new Event("scroll", { bubbles: true })); }, position);
      await expect.poll(() => viewportEl.evaluate((element) => element.scrollLeft)).toBe(position);
      const after = await frozen.boundingBox();
      expect(after).not.toBeNull();
      expect(after!.x).toBeCloseTo(before!.x, 0);
      expect(after!.width).toBeCloseTo(before!.width, 0);
      const clipping = await page.locator("[data-role='frozen-label-rows']").evaluate((element) => {
        const style = getComputedStyle(element);
        return { overflow: style.overflow, zIndex: Number(style.zIndex) };
      });
      expect(clipping.overflow).toBe("hidden");
      expect(clipping.zIndex).toBeGreaterThan(0);
    }
    const resizer = page.getByTestId("frozen-pane-resizer");
    await resizer.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => resizer.getAttribute("aria-valuenow")).not.toBe(String(before!.width));
    const resized = await frozen.boundingBox();
    expect(resized).not.toBeNull();
    expect(resized!.x).toBeCloseTo(before!.x, 0);
    expect(await surface.getAttribute("data-canonical-revision")).toBe("0");
  });
}
