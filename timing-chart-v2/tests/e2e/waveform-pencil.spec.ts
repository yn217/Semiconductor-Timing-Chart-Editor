import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

const signalId = "sig_cycle_reset_n";

async function openBinarySignal(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  await surface.locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  await expect(page.getByTestId("signal-editor")).toBeVisible();
  await expect(page.getByTestId("waveform-pencil-ribbon")).toBeVisible();
  await expect(page.getByTestId("waveform-pencil-bottom")).toBeVisible();
  return surface;
}

async function cellPoint(page: Page, cycle: number, rowFraction: number) {
  const ruler = page.getByTestId("cycle-ruler");
  const start = await ruler.locator(`[data-source-cycle='${cycle}']`).evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  const end = await ruler.locator(`[data-source-cycle='${cycle + 1}']`).evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  const surface = (await page.locator("[data-role='stable-waveform-surface']").boundingBox())!;
  const owner = (await page.locator(`[data-role='wave-owner'][data-signal-id='${signalId}']`).boundingBox())!;
  return { x: surface.x + (start + end) / 2, y: owner.y + owner.height * rowFraction };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test("draws a freehand Binary stroke as one semantic edit and round-trips through undo, redo, and Save/Open", async ({ page }) => {
  const surface = await openBinarySignal(page);
  const bottomTool = page.getByTestId("waveform-pencil-bottom");
  const ribbonTool = page.getByTestId("waveform-pencil-ribbon");
  await expect(bottomTool).toBeEnabled();
  await bottomTool.hover();
  await expect(page.getByRole("tooltip", { name: /Draw HIGH\/LOW directly on a Binary Signal/ })).toBeVisible();

  const baselineRevision = await surface.getAttribute("data-canonical-revision");
  const baselineHistory = await page.getByTestId("history-status").innerText();
  await bottomTool.click();
  await expect(bottomTool).toHaveAttribute("aria-pressed", "true");
  await expect(ribbonTool).toHaveAttribute("aria-pressed", "true");

  // Cell 3 is already HIGH. Painting it is a semantic no-op and must not
  // create a history entry.
  await drag(page, await cellPoint(page, 3, 0.2), await cellPoint(page, 3, 0.2));
  await expect(page.getByTestId("history-status")).toHaveText(baselineHistory);
  await expect(surface).toHaveAttribute("data-canonical-revision", baselineRevision!);

  // The sample is low until cycle 2 and high afterward. A continuous drag
  // from HIGH in cycle 4 through LOW in cycle 6 creates boundaries at 5/7.
  const high = await cellPoint(page, 4, 0.2);
  const low = await cellPoint(page, 6, 0.8);
  await page.mouse.move(high.x, high.y);
  await page.mouse.down();
  await page.mouse.move((high.x + low.x) / 2, (high.y + low.y) / 2, { steps: 2 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText(baselineHistory);
  await page.mouse.move(low.x, low.y, { steps: 3 });
  await page.mouse.up();

  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(surface).not.toHaveAttribute("data-canonical-revision", baselineRevision!);
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  const table = page.getByTestId("signal-editor");
  await expect(table.locator("[data-event-start='5']")).toBeVisible();
  await expect(table.locator("[data-event-start='7']")).toBeVisible();
  await expect(table.locator("[data-event-start='5']").getByLabel("Value 5")).toHaveValue("0");
  await expect(table.locator("[data-event-start='7']").getByLabel("Value 7")).toHaveValue("1");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(table.locator("[data-event-start='5']")).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo" }).click();
  await expect(table.locator("[data-event-start='5']")).toBeVisible();

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.getByTestId("cycle-surface").locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='5']")).toBeVisible();
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='7']")).toBeVisible();
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='5']").getByLabel("Value 5")).toHaveValue("0");
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='7']").getByLabel("Value 7")).toHaveValue("1");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Escape cancels the active stroke without a semantic edit and disables the tool", async ({ page }) => {
  const surface = await openBinarySignal(page);
  const baselineRevision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();
  const bottomTool = page.getByTestId("waveform-pencil-bottom");
  await bottomTool.click();
  const from = await cellPoint(page, 4, 0.2);
  const to = await cellPoint(page, 6, 0.8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  await expect(bottomTool).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("waveform-pencil-ribbon")).toHaveAttribute("aria-pressed", "false");
  await page.mouse.up();
  await expect(surface).toHaveAttribute("data-canonical-revision", baselineRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='5']")).toHaveCount(0);
});

test("mode switch cancels an active stroke and the pencil controls are unavailable outside Cycle", async ({ page }) => {
  const surface = await openBinarySignal(page);
  const baselineRevision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();
  await page.getByTestId("waveform-pencil-ribbon").click();
  const from = await cellPoint(page, 4, 0.2);
  const to = await cellPoint(page, 6, 0.8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);

  const transactionMode = page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true });
  await transactionMode.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Transaction");
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  await expect(page.getByTestId("waveform-pencil-ribbon")).toHaveCount(0);
  await expect(page.getByTestId("waveform-pencil-bottom")).toHaveCount(0);
  await page.mouse.up();
  await expect(surface).toHaveAttribute("data-canonical-revision", baselineRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
