import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #423: dragging a Callout's comment/body must move only the label offset
// -- the anchor handle must stay exactly where it was, both during the
// drag preview and after commit (no snap-back).

test("dragging a Callout's comment body moves only the label; the anchor handle never moves, during preview or after commit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("callout");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = page.locator("[data-role='annotation-owner'][data-annotation-type='callout']");
  await expect(owner).toHaveCount(1);
  const anchorHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='anchor']");
  const label = owner.locator("[data-role='annotation-label']");
  await expect(anchorHandle).toBeVisible();
  await expect(label).toBeVisible();

  const beforeAnchorBox = (await anchorHandle.boundingBox())!;
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const beforeRevision = await host.getAttribute("data-canonical-revision");

  const labelBox = (await label.boundingBox())!;
  const labelCenterX = labelBox.x + labelBox.width / 2;
  const labelCenterY = labelBox.y + labelBox.height / 2;

  await page.mouse.move(labelCenterX, labelCenterY);
  await page.mouse.down();
  await page.mouse.move(labelCenterX + 60, labelCenterY + 40, { steps: 4 });
  // Mid-drag: the anchor handle must not have moved.
  const duringAnchorBox = (await anchorHandle.boundingBox())!;
  expect(Math.abs(duringAnchorBox.x - beforeAnchorBox.x), JSON.stringify({ duringAnchorBox, beforeAnchorBox })).toBeLessThan(2);
  expect(Math.abs(duringAnchorBox.y - beforeAnchorBox.y), JSON.stringify({ duringAnchorBox, beforeAnchorBox })).toBeLessThan(2);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  // After commit: anchor still exactly where it was; label actually moved;
  // exactly one History entry for the whole completed drag.
  const afterAnchorBox = (await anchorHandle.boundingBox())!;
  expect(Math.abs(afterAnchorBox.x - beforeAnchorBox.x), JSON.stringify({ afterAnchorBox, beforeAnchorBox })).toBeLessThan(2);
  expect(Math.abs(afterAnchorBox.y - beforeAnchorBox.y), JSON.stringify({ afterAnchorBox, beforeAnchorBox })).toBeLessThan(2);
  const afterLabelBox = (await label.boundingBox())!;
  expect(afterLabelBox.x - labelBox.x).toBeGreaterThan(30);
  expect(await page.getByTestId("history-status").textContent()).not.toBe(beforeHistory);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  expect(await host.getAttribute("data-canonical-revision")).not.toBe(beforeRevision);
});

test("dragging a Callout's anchor handle moves the label by the same delta, preserving its relative offset, with no jump on commit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("callout");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = page.locator("[data-role='annotation-owner'][data-annotation-type='callout']");
  const anchorHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='anchor']");
  const label = owner.locator("[data-role='annotation-label']");

  const beforeAnchorBox = (await anchorHandle.boundingBox())!;
  const beforeLabelBox = (await label.boundingBox())!;
  const relativeBefore = { x: beforeLabelBox.x - beforeAnchorBox.x, y: beforeLabelBox.y - beforeAnchorBox.y };

  const anchorCenterX = beforeAnchorBox.x + beforeAnchorBox.width / 2;
  const anchorCenterY = beforeAnchorBox.y + beforeAnchorBox.height / 2;
  await page.mouse.move(anchorCenterX, anchorCenterY);
  await page.mouse.down();
  await page.mouse.move(anchorCenterX + 50, anchorCenterY + 5, { steps: 4 });
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const afterAnchorBox = (await anchorHandle.boundingBox())!;
  const afterLabelBox = (await label.boundingBox())!;
  expect(afterAnchorBox.x - beforeAnchorBox.x, JSON.stringify({ afterAnchorBox, beforeAnchorBox })).toBeGreaterThan(20);
  const relativeAfter = { x: afterLabelBox.x - afterAnchorBox.x, y: afterLabelBox.y - afterAnchorBox.y };
  expect(Math.abs(relativeAfter.x - relativeBefore.x), JSON.stringify({ relativeAfter, relativeBefore })).toBeLessThan(2);
  expect(Math.abs(relativeAfter.y - relativeBefore.y), JSON.stringify({ relativeAfter, relativeBefore })).toBeLessThan(2);
});

test("Escape during a Callout comment-body drag discards the preview -- both anchor and label stay exactly as committed, zero Canonical/History/Dirty delta", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("callout");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = page.locator("[data-role='annotation-owner'][data-annotation-type='callout']");
  const anchorHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='anchor']");
  const label = owner.locator("[data-role='annotation-label']");
  const beforeAnchorBox = (await anchorHandle.boundingBox())!;
  const beforeLabelBox = (await label.boundingBox())!;
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeDirty = await page.getByTestId("dirty-status").textContent();

  await page.mouse.move(beforeLabelBox.x + beforeLabelBox.width / 2, beforeLabelBox.y + beforeLabelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeLabelBox.x + 70, beforeLabelBox.y + 45, { steps: 4 });
  const midDragLabelBox = (await label.boundingBox())!;
  expect(midDragLabelBox.x - beforeLabelBox.x).toBeGreaterThan(30);

  await page.keyboard.press("Escape");
  await page.mouse.up();

  const afterLabelBox = (await label.boundingBox())!;
  expect(Math.abs(afterLabelBox.x - beforeLabelBox.x), JSON.stringify({ afterLabelBox, beforeLabelBox })).toBeLessThan(2);
  const afterAnchorBox = (await anchorHandle.boundingBox())!;
  expect(Math.abs(afterAnchorBox.x - beforeAnchorBox.x)).toBeLessThan(2);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("dirty-status")).toHaveText(beforeDirty!);
});
