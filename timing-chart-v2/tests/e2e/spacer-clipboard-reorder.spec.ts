import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// Insert Ribbon creation, Duplicate, Copy/Paste, same-Group reorder and
// cross-Group transfer all exercise the production Semantic Command route.
for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
test(`creates, duplicates, copies, reorders and transfers a stable Spacer across populated and empty Groups at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");

  // Select an existing row first so the Spacer inserts into an
  // already-populated Group (avoids the unrelated #369 empty-group
  // render gap) and lands at a known, adjacent position.
  await host.locator("[data-role='left-row'][data-row-id='sig_cycle_clock']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  await page.getByTestId("ribbon").getByRole("button", { name: "Spacer", exact: true }).click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBefore) + 1));
  const spacerRow = host.locator("[data-role='left-row'][data-row-id^='spacer_']");
  await expect(spacerRow).toHaveCount(1);
  const spacerId = await spacerRow.getAttribute("data-row-id");
  expect(spacerId).toMatch(/^spacer_/);
  // A stable, ID-scoped locator for the original spacer, since later steps
  // (Duplicate, Paste) add more `spacer_*` rows that a bare prefix-match
  // locator would then ambiguously match.
  const originalSpacer = host.locator(`[data-role='left-row'][data-row-id='${spacerId}']`);
  expect(await host.locator(`[data-role='frozen-row'][data-row-id='${spacerId}']`)).toBeTruthy();

  // Select it (by its stable SpacerId), then Duplicate through the same
  // Home Ribbon route every other row type uses.
  await originalSpacer.click();
  await expect(originalSpacer).toHaveAttribute("data-selected", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await expect(ribbon.getByRole("button", { name: "Duplicate", exact: true })).toBeEnabled();
  const beforeCounters = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(host.locator("[data-role='left-row'][data-row-id^='spacer_']")).toHaveCount(2);
  const afterDuplicateCounters = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  expect(afterDuplicateCounters.waveDromRenders).toBe(beforeCounters.waveDromRenders);

  // Copy + Paste the original spacer -- a second, independent clipboard
  // route (not Duplicate) must also work per the central clipboard policy.
  await originalSpacer.click();
  await expect(ribbon.getByRole("button", { name: "Copy", exact: true })).toBeEnabled();
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByRole("button", { name: "Paste", exact: true })).toBeEnabled();
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host.locator("[data-role='left-row'][data-row-id^='spacer_']")).toHaveCount(3);

  // Reorder the original Spacer within its Group by drag, using the same
  // dragTo pattern tree-drag-drop.spec.ts already establishes for Signal
  // rows. Keep using the stable-ID `originalSpacer` locator throughout
  // (not a `.first()` re-query, which would silently start pointing at a
  // different physical row once the drag below reorders the DOM).
  const treeRows = surface.locator("[data-role='left-tree-rows']");
  const originalSpacerInTree = treeRows.locator(`[data-role='left-row'][data-row-id='${spacerId}']`);
  const controlGroupId = await host.locator("[data-role='left-group-header'][data-group-name='Control']").getAttribute("data-group-id");
  const revisionBeforeMove = await host.getAttribute("data-canonical-revision");
  const countersBeforeSameGroupMove = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  const clockRow = treeRows.locator("[data-role='left-row'][data-row-id='sig_cycle_clock']");
  await originalSpacerInTree.dragTo(clockRow, { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBeforeMove) + 1));
  expect(await originalSpacer.getAttribute("data-group-id")).toBe(controlGroupId);
  const countersAfterSameGroupMove = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  expect(countersAfterSameGroupMove.waveDromRenders).toBe(countersBeforeSameGroupMove.waveDromRenders);
  expect(countersAfterSameGroupMove.localGeometryBuilds).toBe(countersBeforeSameGroupMove.localGeometryBuilds);

  // Transfer into another Group before its first Signal, retaining identity.
  const revisionBeforeCrossGroupMove = await host.getAttribute("data-canonical-revision");
  const countersBeforeCrossGroupMove = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  const payloadRow = treeRows.locator("[data-role='left-row'][data-row-id='sig_cycle_data']");
  await originalSpacerInTree.dragTo(payloadRow, { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBeforeCrossGroupMove) + 1));
  const payloadGroupId = await payloadRow.getAttribute("data-group-id");
  await expect(originalSpacer).toHaveAttribute("data-group-id", payloadGroupId!);
  const countersAfterCrossGroupMove = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  expect(countersAfterCrossGroupMove.waveDromRenders).toBe(countersBeforeCrossGroupMove.waveDromRenders);
  expect(countersAfterCrossGroupMove.localGeometryBuilds).toBe(countersBeforeCrossGroupMove.localGeometryBuilds);
  await expect(page.getByTestId("history-status")).toHaveText("History 5 / Redo 0");

  // The opposite drop half places the same Spacer after an ordinary Signal.
  const revisionBeforeAfterSignalMove = await host.getAttribute("data-canonical-revision");
  const countersBeforeAfterSignalMove = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  const resultRow = treeRows.locator("[data-role='left-row'][data-row-id='sig_cycle_result']");
  const resultBox = await resultRow.boundingBox();
  expect(resultBox).not.toBeNull();
  await originalSpacerInTree.dragTo(resultRow, { targetPosition: { x: 100, y: resultBox!.height - 2 } });
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBeforeAfterSignalMove) + 1));
  await expect(originalSpacer).toHaveAttribute("data-group-id", payloadGroupId!);
  const payloadRowIds = await treeRows.locator(`[data-role='left-row'][data-group-id='${payloadGroupId}']`).evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.rowId));
  expect(payloadRowIds.indexOf(spacerId!)).toBe(payloadRowIds.indexOf("sig_cycle_result") + 1);
  const countersAfterAfterSignalMove = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  expect(countersAfterAfterSignalMove.waveDromRenders).toBe(countersBeforeAfterSignalMove.waveDromRenders);
  expect(countersAfterAfterSignalMove.localGeometryBuilds).toBe(countersBeforeAfterSignalMove.localGeometryBuilds);
  await expect(page.getByTestId("history-status")).toHaveText("History 6 / Redo 0");

  // An empty Group header is a drop target too; transfer is one semantic move.
  const groupHeaders = host.locator("[data-role='left-group-header'][data-group-id]");
  const existingGroupIds = await groupHeaders.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.groupId));
  await page.getByRole("button", { name: "Add signal or group", exact: true }).click();
  await page.getByTestId("create-group").click();
  const currentGroupIds = await groupHeaders.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.groupId));
  const emptyGroupId = currentGroupIds.find((id) => id && !existingGroupIds.includes(id));
  expect(emptyGroupId).toBeTruthy();
  const emptyGroupHeader = host.locator(`[data-role='left-group-header'][data-group-id='${emptyGroupId}']`);
  await expect(emptyGroupHeader).toBeVisible();
  const revisionBeforeEmptyDrop = await host.getAttribute("data-canonical-revision");
  await originalSpacerInTree.dragTo(emptyGroupHeader);
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBeforeEmptyDrop) + 1));
  await expect(originalSpacer).toHaveAttribute("data-group-id", emptyGroupId!);
  await expect(page.getByTestId("history-status")).toHaveText("History 8 / Redo 0");

  // Undo everything back to the start and confirm the document returns to
  // having zero Spacer rows (proves the whole sequence is real semantic
  // history, not view-only state).
  for (let guard = 0; guard < 10 && (await page.getByTestId("history-status").textContent()) !== "History 0 / Redo 8"; guard += 1) {
    await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  }
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 8");
  await expect(host.locator("[data-role='left-row'][data-row-id^='spacer_']")).toHaveCount(0);

  for (let guard = 0; guard < 10 && (await page.getByTestId("history-status").textContent()) !== "History 8 / Redo 0"; guard += 1) {
    await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  }
  await expect(page.getByTestId("history-status")).toHaveText("History 8 / Redo 0");
  await expect(originalSpacer).toHaveAttribute("data-group-id", emptyGroupId!);
  await expect(originalSpacer.locator("[data-role='tree-spacer-label']")).toHaveAttribute("title", "Spacer · 24px");
  const alignedRows = await Promise.all(["left-row", "frozen-row", "timing-row"].map((role) => host.locator(`[data-role='${role}'][data-row-id='${spacerId}']`).boundingBox()));
  expect(alignedRows.every(Boolean)).toBe(true);
  expect(Math.abs(alignedRows[0]!.y - alignedRows[1]!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(alignedRows[1]!.y - alignedRows[2]!.y)).toBeLessThanOrEqual(1);

  const download = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(await readFile(savedPath!, "utf8")) as { signalGroups: Array<{ id: string; rows: string[]; spacers: Array<{ id: string; height: number }> }> };
  const savedGroup = saved.signalGroups.find((group) => group.id === emptyGroupId);
  expect(savedGroup?.rows).toContain(spacerId);
  expect(savedGroup?.spacers).toContainEqual({ id: spacerId, height: 24 });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator(`[data-role='left-row'][data-row-id='${spacerId}']`)).toHaveAttribute("data-group-id", emptyGroupId!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
}
