import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

async function openSample(page: Page) {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  return host;
}

/** Screen point inside cell `cycle` of the signal row, `fraction` (0 top .. 1 bottom) of the way down the row. */
async function cellPoint(page: Page, signalId: string, cycle: number, fraction: number) {
  const row = await page.locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).boundingBox();
  const tick = await page.locator(`[data-testid='cycle-ruler'] [data-cycle='${cycle}']`).first().boundingBox();
  const next = await page.locator(`[data-testid='cycle-ruler'] [data-cycle='${cycle + 1}']`).first().boundingBox();
  expect(row && tick && next).toBeTruthy();
  const pitch = next!.x - tick!.x;
  return { x: tick!.x + tick!.width / 2 + pitch * 0.15, y: row!.y + row!.height * fraction };
}

async function eventRows(page: Page, signalId: string) {
  await page.locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  await expect(page.locator(".event-editor [role='row']")).not.toHaveCount(1);
  return page.locator(".event-editor [role='row']").evaluateAll((rows) => rows.slice(1).map((row) => [...row.children].map((cell) => cell.textContent?.trim()).filter(Boolean).join(",")));
}

test("Waveform Pencil draws HIGH/LOW per passed Cycle in one Undo step, with Ribbon and Bottom toggles in sync", async ({ page }) => {
  const host = await openSample(page);
  const history = page.getByTestId("history-status");
  const ribbonPencil = page.getByTestId("ribbon-waveform-pencil");
  const bottomPencil = page.getByTestId("bottom-waveform-pencil");
  const before = await eventRows(page, "sig_cycle_ready");
  await expect(ribbonPencil).toHaveAttribute("aria-pressed", "false");
  await bottomPencil.focus();
  await expect(page.getByTestId("bottom-waveform-pencil-tip")).toBeVisible();
  await expect(page.getByTestId("bottom-waveform-pencil-tip")).toContainText("Waveform Pencil — Draw HIGH/LOW by dragging directly on the signal waveform");
  await ribbonPencil.click();
  await expect(bottomPencil).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ribbon-select-tool")).toHaveAttribute("aria-pressed", "false");
  await expect(history).toHaveText("History 0 / Redo 0");

  // Cells 2-4 HIGH (upper half), wander back over cell 3 in the lower half (LOW), finish on cell 5 LOW.
  const start = await cellPoint(page, "sig_cycle_ready", 2, 0.15);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const preview = page.getByTestId("waveform-pencil-preview");
  await expect(preview).toHaveAttribute("data-painted", "[[2,1]]");
  const four = await cellPoint(page, "sig_cycle_ready", 4, 0.15);
  await page.mouse.move(four.x, four.y, { steps: 6 });
  await expect(preview).toHaveAttribute("data-painted", "[[2,1],[3,1],[4,1]]");
  const back = await cellPoint(page, "sig_cycle_ready", 3, 0.85);
  await page.mouse.move(back.x, back.y, { steps: 4 });
  await expect(preview).toHaveAttribute("data-painted", "[[2,1],[3,0],[4,1]]");
  const five = await cellPoint(page, "sig_cycle_ready", 5, 0.85);
  await page.mouse.move(five.x, five.y, { steps: 4 });
  await expect(history).toHaveText("History 0 / Redo 0"); // no History while drawing
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(history).toHaveText("History 1 / Redo 0");
  expect(await eventRows(page, "sig_cycle_ready")).not.toEqual(before);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(history).toHaveText("History 0 / Redo 1");
  expect(await eventRows(page, "sig_cycle_ready")).toEqual(before);
  await expect(host).toHaveAttribute("data-waveform-pencil", "on");
});

test("Waveform Pencil Esc cancels the stroke without a commit, then leaves drawing mode", async ({ page }) => {
  await openSample(page);
  const history = page.getByTestId("history-status");
  await page.getByTestId("bottom-waveform-pencil").click();
  await expect(page.getByTestId("ribbon-waveform-pencil")).toHaveAttribute("aria-pressed", "true");
  const start = await cellPoint(page, "sig_cycle_ready", 2, 0.15);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const end = await cellPoint(page, "sig_cycle_ready", 6, 0.15);
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await expect(page.getByTestId("waveform-pencil-preview")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("waveform-pencil-preview")).toHaveCount(0);
  await page.mouse.up();
  await expect(history).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("bottom-waveform-pencil")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bottom-waveform-pencil")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("ribbon-select-tool")).toHaveAttribute("aria-pressed", "true");
});

test("Waveform Pencil only draws on the Binary Signal it started on", async ({ page }) => {
  await openSample(page);
  const history = page.getByTestId("history-status");
  await page.getByTestId("ribbon-waveform-pencil").click();
  const start = await cellPoint(page, "sig_cycle_ready", 2, 0.15);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const otherRow = await cellPoint(page, "sig_cycle_valid", 4, 0.15);
  await page.mouse.move(otherRow.x, otherRow.y, { steps: 4 });
  await expect(page.getByTestId("waveform-pencil-preview")).toHaveAttribute("data-signal-id", "sig_cycle_ready");
  await page.mouse.up();
  await expect(history).toHaveText("History 1 / Redo 0");
  // A Bus row is not drawable: pressing on it leaves the document untouched.
  const bus = await cellPoint(page, "sig_cycle_data", 3, 0.5);
  await page.mouse.click(bus.x, bus.y);
  await expect(history).toHaveText("History 1 / Redo 0");
});
