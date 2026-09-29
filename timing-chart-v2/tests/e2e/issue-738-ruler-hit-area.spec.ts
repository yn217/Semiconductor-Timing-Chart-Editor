import { expect, test, type Page } from "@playwright/test";

// #738: every point inside a ruler cell selects that cell through the shared time geometry (never label glyph identity),
// and a horizontal ruler drag builds a range in either direction -- in Cycle AND Transaction mode.
async function open(page: Page, mode: "Cycle" | "Transaction", size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${mode}`);
  // Cycle draws a tick per cycle; Transaction (cyclesPerTC compression, #750) draws ticks on TC boundaries only, so cell X is derived.
  await expect(page.getByTestId("cycle-ruler").locator(mode === "Cycle" ? ".cycle-tick[data-source-cycle='9']" : ".cycle-tick[data-source-cycle='10']")).toHaveCount(1);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
}
const range = async (page: Page) => `${await page.getByLabel("Timeline range start").inputValue()}-${await page.getByLabel("Timeline range end").inputValue()}`;
const rawTick = async (page: Page, cycle: number) => (await page.getByTestId("cycle-ruler").locator(`.cycle-tick[data-source-cycle='${cycle}']`).boundingBox())!;
/** Left edge + pitch of ruler cells: exact ticks in Cycle; derived from the cycle 0 / cycle 10 TC ticks in compressed Transaction. */
async function cellGeometry(page: Page, mode: "Cycle" | "Transaction", cycle: number) {
  if (mode === "Cycle") {
    const tick = await rawTick(page, cycle);
    const nextTick = await rawTick(page, cycle + 1);
    return { x: tick.x, pitch: nextTick.x - tick.x };
  }
  const zero = await rawTick(page, 0); const ten = await rawTick(page, 10);
  const pitch = (ten.x - zero.x) / 10;
  return { x: zero.x + pitch * cycle, pitch };
}

for (const mode of ["Cycle", "Transaction"] as const) {
  test(`ruler cell hit targets and bidirectional range gestures in ${mode} at both supported viewports`, async ({ page }) => {
    test.setTimeout(60_000);
    const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }];
    for (const [sizeIndex, size] of sizes.entries()) {
      if (sizeIndex === 0) await open(page, mode, size);
      else {
        // Reflow the same production document instead of paying for another full app boot.
        await page.setViewportSize(size);
        await expect(page.getByTestId("cycle-ruler")).toBeVisible();
      }
      const firstTick = await rawTick(page, 0);
      const lowerY = firstTick.y + firstTick.height - 2;
      const upperY = firstTick.y + 2;
      const history = page.getByTestId("history-status");

      // Whitespace at the left, middle, right and near the boundary of a cell, lower and upper part of the row.
      for (const [cycle, dx, y] of [[5, 2, lowerY], [6, 12, lowerY], [7, 25, lowerY], [8, 37, lowerY], [9, 20, upperY]] as const) {
        const cell = await cellGeometry(page, mode, cycle);
        const x = cell.x + dx * cell.pitch / 40;
        await page.mouse.click(x, y);
        await expect.poll(() => range(page), { message: `click ${dx}px into cell ${cycle} at ${size.width}x${size.height}` }).toBe(`${cycle}-${cycle + 1}`);
      }

      // Preserve the current-main low-cycle hit coverage and report the event target on failure.
      for (const [cycle, dx, y] of [[0, 2, lowerY], [1, 12, lowerY], [2, 25, lowerY], [3, 37, lowerY], [4, 20, upperY]] as const) {
        const cell = await cellGeometry(page, mode, cycle);
        const x = cell.x + dx * cell.pitch / 40;
        const hit = await page.evaluate(({ x: screenX, y: screenY }) => document.elementFromPoint(screenX, screenY)?.outerHTML.slice(0, 180), { x, y });
        await page.mouse.click(x, y);
        await expect.poll(() => range(page), { message: `click cell ${cycle} at ${size.width}x${size.height}; target=${hit}` }).toBe(`${cycle}-${cycle + 1}`);
      }

      // Drags span the boundaries nearest the pointer at both ends (same rule), so both directions give the same range.
      const a = await cellGeometry(page, mode, 3);
      const b = await cellGeometry(page, mode, 9);
      await page.mouse.move(a.x + 25 * a.pitch / 40, lowerY);
      await page.mouse.down();
      await page.mouse.move(b.x + 25 * b.pitch / 40, lowerY, { steps: 8 });
      await page.mouse.up();
      await expect.poll(() => range(page), { message: `drag 3 -> 9 at ${size.width}x${size.height}` }).toBe("4-10");
      await page.mouse.move(b.x + 25 * b.pitch / 40, lowerY);
      await page.mouse.down();
      await page.mouse.move(a.x + 25 * a.pitch / 40, lowerY, { steps: 8 });
      await page.mouse.up();
      await expect.poll(() => range(page), { message: `drag 9 -> 3 at ${size.width}x${size.height}` }).toBe("4-10");

      const shortA = await cellGeometry(page, mode, 1);
      const shortB = await cellGeometry(page, mode, 4);
      await page.mouse.move(shortA.x + 25 * shortA.pitch / 40, lowerY);
      await page.mouse.down();
      await page.mouse.move(shortB.x + 25 * shortB.pitch / 40, lowerY, { steps: 8 });
      await page.mouse.up();
      await expect.poll(() => range(page), { message: `drag 1 -> 4 at ${size.width}x${size.height}` }).toBe("2-5");
      await page.mouse.move(shortB.x + 25 * shortB.pitch / 40, lowerY);
      await page.mouse.down();
      await page.mouse.move(shortA.x + 25 * shortA.pitch / 40, lowerY, { steps: 8 });
      await page.mouse.up();
      await expect.poll(() => range(page), { message: `drag 4 -> 1 at ${size.width}x${size.height}` }).toBe("2-5");
      await expect(history).toHaveText("History 0 / Redo 0"); // view-only
    }
  });
}

test("Combined ruler accepts clicks across the full visible cell at both supported viewports", async ({ page }) => {
  test.setTimeout(60_000);
  const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }];
  for (const [sizeIndex, size] of sizes.entries()) {
    await page.setViewportSize(size);
    if (sizeIndex === 0) {
      await page.goto("/?transaction-demo");
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
      await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
      await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Combined");
      await expect(page.locator(".split-transaction-pane")).toBeVisible();
      await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    } else {
      await expect(page.getByTestId("cycle-ruler")).toBeVisible();
    }

    const cells = await page.getByTestId("cycle-ruler").evaluate((ruler) => {
      const bounds = ruler.getBoundingClientRect();
      const ticks = Array.from(ruler.querySelectorAll<HTMLElement>(".cycle-tick[data-source-cycle]"))
        .map((tick) => ({ cycle: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().left }))
        .filter((tick) => tick.x >= bounds.left && tick.x < bounds.right)
        .sort((a, b) => a.x - b.x);
      const rect = { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      return {
        rect,
        cells: ticks.flatMap((tick, index) => {
          const next = ticks[index + 1];
          return next && next.cycle === tick.cycle + 1 && next.x - tick.x > 2
            ? [{ cycle: tick.cycle, x0: tick.x, x1: next.x }]
            : [];
        }).slice(0, 3),
      };
    });
    expect(cells.cells.length, `visible complete ruler cells at ${size.width}x${size.height}: ${JSON.stringify(cells)}`).toBeGreaterThan(0);

    const history = page.getByTestId("history-status");
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    for (const cell of cells.cells) {
      for (const [fraction, y] of [
        [0.08, cells.rect.top + 2], [0.08, cells.rect.bottom - 2],
        [0.5, cells.rect.top + 2], [0.5, cells.rect.bottom - 2],
        [0.92, cells.rect.top + 2], [0.92, cells.rect.bottom - 2],
      ] as const) {
        await page.mouse.click(cell.x0 + (cell.x1 - cell.x0) * fraction, y);
        await expect.poll(() => range(page), { message: `Combined ruler cell ${cell.cycle} at ${fraction} across ${size.width}x${size.height}` })
          .toBe(`${cell.cycle}-${cell.cycle + 1}`);
      }
    }
    await expect(history).toHaveText("History 0 / Redo 0");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
  }
});
