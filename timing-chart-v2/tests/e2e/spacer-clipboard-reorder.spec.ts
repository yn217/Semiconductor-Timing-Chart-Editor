import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// Insert Ribbon creation, Duplicate, Copy/Paste, same-Group reorder and
// cross-Group transfer all exercise the production Semantic Command route.
test("creates, duplicates, copies, reorders and transfers a stable Spacer across populated and empty Groups", async ({ page }) => {
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
  const clockRow = treeRows.locator("[data-role='left-row'][data-row-id='sig_cycle_clock']");
  await originalSpacerInTree.dragTo(clockRow, { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBeforeMove) + 1));
  expect(await originalSpacer.getAttribute("data-group-id")).toBe(controlGroupId);

  // Transfer into another Group before its first Signal, retaining identity.
  const revisionBeforeCrossGroupMove = await host.getAttribute("data-canonical-revision");
  const payloadRow = treeRows.locator("[data-role='left-row'][data-row-id='sig_cycle_data']");
  await originalSpacerInTree.dragTo(payloadRow, { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBeforeCrossGroupMove) + 1));
  const payloadGroupId = await payloadRow.getAttribute("data-group-id");
  await expect(originalSpacer).toHaveAttribute("data-group-id", payloadGroupId!);
  await expect(page.getByTestId("history-status")).toHaveText("History 5 / Redo 0");

  // An empty Group header is a drop target too; transfer is one semantic move.
  const groupHeaders = host.locator("[data-role='left-group-header'][data-group-id]");
  const existingGroupIds = await groupHeaders.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.groupId));
  await page.getByRole("button", { name: "Add signal or group", exact: true }).click();
  await page.getByTestId("create-group").click();
  const emptyGroupId = await groupHeaders.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.groupId).find((id) => id && !existingGroupIds.includes(id)));
  expect(emptyGroupId).toBeTruthy();
  const emptyGroupHeader = host.locator(`[data-role='left-group-header'][data-group-id='${emptyGroupId}']`);
  await expect(emptyGroupHeader).toBeVisible();
  const revisionBeforeEmptyDrop = await host.getAttribute("data-canonical-revision");
  await originalSpacerInTree.dragTo(emptyGroupHeader);
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBeforeEmptyDrop) + 1));
  await expect(originalSpacer).toHaveAttribute("data-group-id", emptyGroupId!);
  await expect(page.getByTestId("history-status")).toHaveText("History 7 / Redo 0");

  // Undo everything back to the start and confirm the document returns to
  // having zero Spacer rows (proves the whole sequence is real semantic
  // history, not view-only state).
  for (let guard = 0; guard < 10 && (await page.getByTestId("history-status").textContent()) !== "History 0 / Redo 7"; guard += 1) {
    await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  }
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 7");
  await expect(host.locator("[data-role='left-row'][data-row-id^='spacer_']")).toHaveCount(0);
});
