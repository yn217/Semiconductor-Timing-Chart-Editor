import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openBottomSettings } from "./bottom-settings";

/**
 * Review fixes for workspace mode state (use-workspace-ui-state / use-bottom-panel-sizing):
 * - Combined (Split) is a temporary layout and is never remembered as the startup mode.
 * - Combined pane edits do not leak into the Cycle/Transaction snapshots on return.
 * - Cycle's Bottom maximum height follows the window height.
 * - Document replacement (Open) clears Bottom pins of every standalone mode, not only the active one.
 */

const modeStatus = (page: Page) => page.getByTestId("view-mode-status");
const COMBINED = /Mode: (Combined|Split)/;

async function openCycle(page: Page) {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(modeStatus(page)).toHaveText("Mode: Cycle");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function setMode(page: Page, mode: "Cycle" | "Transaction" | "Combined") {
  await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
  await expect(modeStatus(page)).toHaveText(mode === "Combined" ? COMBINED : `Mode: ${mode}`);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
}

/** Grabs the handle at its vertical centre, or 40px below its top for tall handles (Combined's splitter is partly covered by the bottom tabs). */
async function dragBy(page: Page, locator: Locator, dx: number, dy = 0) {
  const box = (await locator.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.height > 100 ? box.y + 40 : box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

test("Combined is never saved as the startup mode", async ({ page }) => {
  await openCycle(page);
  await setMode(page, "Combined");
  await page.reload();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(modeStatus(page)).toHaveText("Mode: Cycle");
});

test("Cycle left-pane width is restored after a Combined round trip, not replaced by Combined's width", async ({ page }) => {
  await openCycle(page);
  await dragBy(page, page.getByTestId("left-pane-resizer"), 80);
  const cycleWidth = await page.getByTestId("left-pane-resizer").getAttribute("aria-valuenow");
  expect(cycleWidth).not.toBeNull();

  await setMode(page, "Combined");
  await dragBy(page, page.getByTestId("left-pane-resizer"), -60);
  const combinedWidth = await page.getByTestId("left-pane-resizer").getAttribute("aria-valuenow");
  expect(combinedWidth).not.toBe(cycleWidth);

  await setMode(page, "Cycle");
  await expect(page.getByTestId("left-pane-resizer")).toHaveAttribute("aria-valuenow", cycleWidth!);
});

test("Cycle Bottom maximum follows a shorter window instead of staying at 420", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await openCycle(page);
  const resizer = page.getByTestId("bottom-resizer");
  await dragBy(page, resizer, 0, -600);
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-bottom-height", "420");

  await page.setViewportSize({ width: 1672, height: 680 });
  const workspaceHeight = await page.locator(".desktop-workspace").evaluate((element) => element.clientHeight);
  const fitting = workspaceHeight - 191;
  expect(fitting).toBeGreaterThan(180);
  expect(fitting).toBeLessThan(420);
  await expect.poll(async () => Number(await resizer.getAttribute("aria-valuemax"))).toBeLessThanOrEqual(fitting);
  expect(Number(await resizer.getAttribute("aria-valuemax"))).toBe(Math.floor(fitting));
  await expect.poll(async () => Number(await page.locator(".editor-shell").getAttribute("data-bottom-height"))).toBeLessThanOrEqual(fitting);
});

test("Open clears Bottom pins of standalone modes that were not active", async ({ page }) => {
  await openCycle(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']").click();
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await bottom.getByTestId("bottom-settings").click();

  // Save a copy of the current document (download), then switch away from Cycle before re-opening it.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const saved = JSON.parse(await readFile((await (await pending).path())!, "utf8"));

  await setMode(page, "Transaction");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "pin-reset.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  await setMode(page, "Cycle");
  await openBottomSettings(page);
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
});
