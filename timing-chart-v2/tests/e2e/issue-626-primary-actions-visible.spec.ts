import { expect, test } from "@playwright/test";

// #626 visual regressions found against the V8 golden: primary actions must not be pushed out of view.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Clock Signal: Bottom Apply generator is visible without scrolling and Inspector Convert Clock is reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?visual-reference");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    // The reference route opens with the CLOCK signal selected (Bottom Signal tab, Clock editor).
    const apply = page.getByTestId("apply-clock-generator");
    await expect(apply).toBeVisible();
    const bottomPane = (await page.locator(".bottom-content").boundingBox())!;
    const applyBox = (await apply.boundingBox())!;
    expect(applyBox.y).toBeGreaterThanOrEqual(bottomPane.y);
    expect(applyBox.y + applyBox.height).toBeLessThanOrEqual(bottomPane.y + bottomPane.height + 1);
    // Inspector: Convert Clock scrolls fully above the sticky footer.
    const convert = page.getByTestId("inspector").getByRole("button", { name: "Convert Clock", exact: true });
    // At the locked 1672x941 viewport the action is fully visible at rest; smaller viewports reach it by scrolling.
    if (viewport.height < 941) await convert.scrollIntoViewIfNeeded();
    const footer = (await page.locator(".inspector-sticky-footer").boundingBox())!;
    const convertBox = (await convert.boundingBox())!;
    expect(convertBox.y + convertBox.height).toBeLessThanOrEqual(footer.y + 1);
  });
}
