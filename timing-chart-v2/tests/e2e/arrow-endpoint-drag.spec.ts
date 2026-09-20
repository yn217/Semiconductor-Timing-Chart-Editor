import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #421: dragging an Arrow's end/to handle must move only that endpoint --
// both during the drag preview and after commit -- never the whole Arrow
// (with the non-target endpoint snapping back once released).

test("dragging the Arrow end handle moves only the end anchor; the start handle never moves, during preview or after commit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveLayer = surface.locator("[data-role='stable-waveform-surface']");
  const waveBox = (await waveLayer.boundingBox())!;
  const requestBox = (await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']").boundingBox())!;
  const readyBox = (await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_ready']").boundingBox())!;
  const cycle3 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle7 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='7']").evaluate((element) => (element as HTMLElement).style.left));

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await page.mouse.click(waveBox.x + cycle3, requestBox.y + requestBox.height / 2);
  await page.mouse.click(waveBox.x + cycle5, readyBox.y + readyBox.height / 2);
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = surface.locator("[data-annotation-type='arrow']");
  await expect(owner).toHaveCount(1);
  const startHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const endHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='to']");
  await expect(startHandle).toBeVisible();
  await expect(endHandle).toBeVisible();

  const beforeStartBox = (await startHandle.boundingBox())!;
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const beforeRevision = await host.getAttribute("data-canonical-revision");

  const endBox = (await endHandle.boundingBox())!;
  const endCenterX = endBox.x + endBox.width / 2;
  const endCenterY = endBox.y + endBox.height / 2;
  const targetX = waveBox.x + cycle7;

  await page.mouse.move(endCenterX, endCenterY);
  await page.mouse.down();
  // Mid-drag: the preview must already reflect the end-only move, and the
  // start handle must not have moved from its pre-drag position.
  await page.mouse.move(targetX, endCenterY, { steps: 4 });
  const duringStartBox = (await startHandle.boundingBox())!;
  expect(Math.abs(duringStartBox.x - beforeStartBox.x), JSON.stringify({ duringStartBox, beforeStartBox })).toBeLessThan(2);
  expect(Math.abs(duringStartBox.y - beforeStartBox.y), JSON.stringify({ duringStartBox, beforeStartBox })).toBeLessThan(2);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  // After commit: start must still be exactly where it was: no
  // snap-back/jump for the endpoint that was never being edited.
  const afterStartBox = (await startHandle.boundingBox())!;
  expect(Math.abs(afterStartBox.x - beforeStartBox.x), JSON.stringify({ afterStartBox, beforeStartBox })).toBeLessThan(2);
  expect(Math.abs(afterStartBox.y - beforeStartBox.y), JSON.stringify({ afterStartBox, beforeStartBox })).toBeLessThan(2);

  // The end handle actually moved, and exactly one History entry was
  // produced for the whole completed drag.
  const afterEndBox = (await endHandle.boundingBox())!;
  expect(afterEndBox.x - endBox.x).toBeGreaterThan(20);
  expect(await page.getByTestId("history-status").textContent()).not.toBe(beforeHistory);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  expect(await host.getAttribute("data-canonical-revision")).not.toBe(beforeRevision);

  // Undo reverts only the end-endpoint move; start stays exactly as after.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  const undoStartBox = (await startHandle.boundingBox())!;
  expect(Math.abs(undoStartBox.x - beforeStartBox.x)).toBeLessThan(2);
  const undoEndBox = (await endHandle.boundingBox())!;
  expect(Math.abs(undoEndBox.x - endBox.x)).toBeLessThan(2);
});

test("Escape during an endpoint drag discards the preview -- both endpoints stay exactly as committed, zero Canonical/History/Dirty delta", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveLayer = surface.locator("[data-role='stable-waveform-surface']");
  const waveBox = (await waveLayer.boundingBox())!;
  const requestBox = (await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']").boundingBox())!;
  const readyBox = (await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_ready']").boundingBox())!;
  const cycle3 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle7 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='7']").evaluate((element) => (element as HTMLElement).style.left));

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await page.mouse.click(waveBox.x + cycle3, requestBox.y + requestBox.height / 2);
  await page.mouse.click(waveBox.x + cycle5, readyBox.y + readyBox.height / 2);
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = surface.locator("[data-annotation-type='arrow']");
  const startHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const endHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='to']");
  const beforeStartBox = (await startHandle.boundingBox())!;
  const beforeEndBox = (await endHandle.boundingBox())!;
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeDirty = await page.getByTestId("dirty-status").textContent();

  await page.mouse.move(beforeEndBox.x + beforeEndBox.width / 2, beforeEndBox.y + beforeEndBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(waveBox.x + cycle7, beforeEndBox.y + beforeEndBox.height / 2, { steps: 4 });
  // Confirm the preview actually moved the end handle before cancelling,
  // so this test would catch a no-op Escape handler too.
  const midDragEndBox = (await endHandle.boundingBox())!;
  expect(midDragEndBox.x - beforeEndBox.x).toBeGreaterThan(20);

  await page.keyboard.press("Escape");
  await page.mouse.up();

  const afterEndBox = (await endHandle.boundingBox())!;
  expect(Math.abs(afterEndBox.x - beforeEndBox.x), JSON.stringify({ afterEndBox, beforeEndBox })).toBeLessThan(2);
  const afterStartBox = (await startHandle.boundingBox())!;
  expect(Math.abs(afterStartBox.x - beforeStartBox.x)).toBeLessThan(2);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("dirty-status")).toHaveText(beforeDirty!);
});
