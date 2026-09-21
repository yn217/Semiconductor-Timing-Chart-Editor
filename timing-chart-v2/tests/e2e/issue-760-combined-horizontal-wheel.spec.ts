import { expect, test } from "@playwright/test";

// #760: a horizontal wheel over the Combined time viewport moves the single Combined horizontal viewport, from a fresh session
// (no Cycle scroll state), and is view-only.
for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Combined horizontal wheel scrolls the shared viewport at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    const viewport = page.getByTestId("cycle-viewport");
    await expect(page.getByTestId("combined-split-divider")).toBeVisible();
    await expect.poll(() => viewport.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(200);
    const canon = () => page.evaluate(() => [document.querySelector("[data-testid='revision-status']")?.textContent, document.querySelector("[data-testid='history-status']")?.textContent, document.querySelector("[data-testid='dirty-status']")?.textContent]);
    const before = await canon();
    expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(0);
    const box = (await viewport.boundingBox())!;
    for (const [label, y] of [["Transaction pane", box.y + 60], ["Signal pane", box.y + box.height - 40]] as const) {
      await viewport.evaluate((el) => { el.scrollLeft = 0; });
      await page.mouse.move(box.x + 700, y);
      await page.mouse.wheel(400, 0);
      await expect.poll(() => viewport.evaluate((el) => el.scrollLeft), { message: `wheel over ${label}` }).toBeGreaterThan(0);
    }
    expect(await canon()).toEqual(before);
  });
}
