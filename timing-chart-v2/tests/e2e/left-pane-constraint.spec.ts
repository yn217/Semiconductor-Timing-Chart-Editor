import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

for (const path of ["/", "/?visual-reference"]) {
  test(`left pane starts at the approved minimum without a resize jump (${path})`, async ({ page }) => {
    await page.goto(path);
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const separator = page.getByTestId("left-pane-resizer");
    await expect(separator).toHaveAttribute("aria-valuemin", "265");
    await expect(separator).toHaveAttribute("aria-valuemax", "420");
    await expect(separator).toHaveAttribute("aria-valuenow", "265");

    await separator.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(separator).toHaveAttribute("aria-valuenow", "265");

    const initial = await separator.boundingBox();
    if (!initial) throw new Error("Missing left pane separator geometry");
    await page.mouse.move(initial.x + initial.width / 2, initial.y + 120);
    await page.mouse.down();
    await page.mouse.move(initial.x - 40, initial.y + 120);
    await page.mouse.up();
    await expect(separator).toHaveAttribute("aria-valuenow", "265");
  });
}
