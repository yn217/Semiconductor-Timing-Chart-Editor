import { expect, test, type Page } from "@playwright/test";

// #738: every point inside a ruler cell selects that cell through the shared time geometry (never label glyph identity),
// and a horizontal ruler drag builds a range in either direction -- in Cycle AND Transaction mode.
async function open(page: Page, mode: "Cycle" | "Transaction", size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${mode}`);
  await expect(page.getByTestId("cycle-ruler").locator(".cycle-tick[data-source-cycle='9']")).toHaveCount(1);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
}
const range = async (page: Page) => `${await page.getByLabel("Timeline range start").inputValue()}-${await page.getByLabel("Timeline range end").inputValue()}`;
const tickBox = async (page: Page, cycle: number) => (await page.getByTestId("cycle-ruler").locator(`.cycle-tick[data-source-cycle='${cycle}']`).boundingBox())!;

for (const mode of ["Cycle", "Transaction"] as const) for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`ruler cell is the hit target, in ${mode} at ${size.width}x${size.height}`, async ({ page }) => {
    await open(page, mode, size);
    const rulerBox = (await page.getByTestId("cycle-ruler").boundingBox())!;
    const lowerY = rulerBox.y + rulerBox.height - 6;
    const upperY = rulerBox.y + 4;
    const history = page.getByTestId("history-status");

    // Whitespace at the left, middle, right and near the boundary of a cell, lower and upper part of the row.
    for (const [cycle, dx, y] of [[5, 2, lowerY], [6, 12, lowerY], [7, 25, lowerY], [8, 37, lowerY], [9, 20, upperY]] as const) {
      const box = await tickBox(page, cycle);
      await page.mouse.click(box.x + dx, y);
      await expect.poll(() => range(page), { message: `click ${dx}px into cell ${cycle}` }).toBe(`${cycle}-${cycle + 1}`);
    }

    // Drags span the boundaries nearest the pointer at both ends (same rule), so both directions give the same range.
    const a = await tickBox(page, 3);
    const b = await tickBox(page, 9);
    await page.mouse.move(a.x + 25, lowerY);
    await page.mouse.down();
    await page.mouse.move(b.x + 25, lowerY, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => range(page), { message: "drag 3 -> 9" }).toBe("4-10");
    await page.mouse.move(b.x + 25, lowerY);
    await page.mouse.down();
    await page.mouse.move(a.x + 25, lowerY, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => range(page), { message: "drag 9 -> 3" }).toBe("4-10");
    await expect(history).toHaveText("History 0 / Redo 0"); // view-only
  });
}
