import { expect, test } from "@playwright/test";

// #722 / #720: at 125% display scale (deviceScaleFactor 1.25) the splitters and the primary header controls keep a practical hit target,
// a real pointer drag on the Bottom splitter resizes it, and nothing mutates the document.
test.use({ deviceScaleFactor: 1.25 });

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`splitters and header controls stay usable at 125% scale (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(1.25, 2);
    const history = await page.getByTestId("history-status").innerText();
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");

    // Hit areas measured in CSS px are still >= 4px (>= 5 device px) for both splitters.
    const bottom = page.getByTestId("bottom-resizer");
    const inspector = page.getByTestId("inspector-resizer");
    expect((await bottom.boundingBox())!.height).toBeGreaterThanOrEqual(4);
    expect((await inspector.boundingBox())!.width).toBeGreaterThanOrEqual(4);

    // A real pointer drag on the Bottom splitter resizes it.
    const before = Number(await bottom.getAttribute("aria-valuenow"));
    const box = (await bottom.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Number(await bottom.getAttribute("aria-valuenow"))).toBeGreaterThan(before);

    // Primary controls keep a practical target: Ribbon buttons and the Tree Add / More buttons are at least 22x22 CSS px.
    const small = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-testid='ribbon'] button, .tree-add-button, .tree-more-button")).filter((el) => el.getBoundingClientRect().width > 0).map((el) => ({ label: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })).filter((item) => item.w < 22 || item.h < 22));
    expect(small, JSON.stringify(small)).toEqual([]);
    await expect(page.getByTestId("history-status")).toHaveText(history);
    expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
  });
}
