import { expect, test, type Page } from "@playwright/test";

// #738: every point inside a ruler cell selects that cell through the shared time geometry (never label glyph identity),
// and a horizontal ruler drag builds a range in either direction -- in Cycle, Transaction, and Combined modes.
async function open(page: Page, mode: "Cycle" | "Transaction" | "Combined", size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${mode}`);
  // Cycle/Combined draw a tick per cycle; Transaction (#750) draws TC boundaries only, so cell X is derived.
  await expect(page.getByTestId("cycle-ruler").locator(mode === "Transaction" ? ".cycle-tick[data-source-cycle='10']" : ".cycle-tick[data-source-cycle='9']")).toHaveCount(1);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
}
const range = async (page: Page) => `${await page.getByLabel("Timeline range start").inputValue()}-${await page.getByLabel("Timeline range end").inputValue()}`;
const rawTick = async (page: Page, cycle: number) => (await page.getByTestId("cycle-ruler").locator(`.cycle-tick[data-source-cycle='${cycle}']`).boundingBox())!;
/** Left edge + pitch of ruler cells: exact ticks in Cycle; derived from the cycle 0 / cycle 10 TC ticks in compressed Transaction. */
async function cellGeometry(page: Page, mode: "Cycle" | "Transaction" | "Combined", cycle: number) {
  if (mode !== "Transaction") {
    const tick = await rawTick(page, cycle);
    const nextTick = await rawTick(page, cycle + 1);
    return { x: tick.x, pitch: nextTick.x - tick.x };
  }
  const zero = await rawTick(page, 0); const ten = await rawTick(page, 10);
  const pitch = (ten.x - zero.x) / 10;
  return { x: zero.x + pitch * cycle, pitch };
}

for (const mode of ["Cycle", "Transaction", "Combined"] as const) for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`ruler cell is the hit target, in ${mode} at ${size.width}x${size.height}`, async ({ page }) => {
    await open(page, mode, size);
    const rulerBox = (await page.getByTestId("cycle-ruler").boundingBox())!;
    const lowerY = rulerBox.y + rulerBox.height - 6;
    const upperY = rulerBox.y + 4;
    const history = page.getByTestId("history-status");

    // Whitespace at the left, middle, right and near the boundary of a cell, lower and upper part of the row.
    for (const [cycle, dx, y] of [[0, 2, lowerY], [1, 12, lowerY], [2, 25, lowerY], [3, 37, lowerY], [4, 20, upperY]] as const) {
      const cell = await cellGeometry(page, mode, cycle);
      const x = cell.x + dx * cell.pitch / 40;
      const hit = await page.evaluate(({ x: screenX, y: screenY }) => {
        const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
        const ticks = [...ruler.querySelectorAll<HTMLElement>(".cycle-tick[data-source-cycle]")].slice(4, 9).map((tick) => ({ cycle: tick.dataset.sourceCycle, left: tick.getBoundingClientRect().left }));
        const waveform = document.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
        const rect = ruler.getBoundingClientRect();
        return { x: screenX, y: screenY, ruler: { left: rect.left, width: rect.width }, tickXs: ticks, waveLeft: waveform?.getBoundingClientRect().left, target: document.elementFromPoint(screenX, screenY)?.outerHTML.slice(0, 180) };
      }, { x, y });
      await page.mouse.click(x, y);
      await expect.poll(() => range(page), { message: `click in cell ${cycle}: ${JSON.stringify(hit)}` }).toBe(`${cycle}-${cycle + 1}`);
    }

    // Drags span the boundaries nearest the pointer at both ends (same rule), so both directions give the same range.
    const a = await cellGeometry(page, mode, 1);
    const b = await cellGeometry(page, mode, 4);
    await page.mouse.move(a.x + 25 * a.pitch / 40, lowerY);
    await page.mouse.down();
    await page.mouse.move(b.x + 25 * b.pitch / 40, lowerY, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => range(page), { message: "drag 1 -> 4" }).toBe("2-5");
    await page.mouse.move(b.x + 25 * b.pitch / 40, lowerY);
    await page.mouse.down();
    await page.mouse.move(a.x + 25 * a.pitch / 40, lowerY, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => range(page), { message: "drag 4 -> 1" }).toBe("2-5");
    await expect(history).toHaveText("History 0 / Redo 0"); // view-only
  });
}
