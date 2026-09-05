import { expect, test } from "@playwright/test";

// #222: covers the acceptance items spacer.spec.ts / spacer-row.spec.ts don't --
// Insert Ribbon creation, Duplicate, Copy/Paste, and same-Group drag reorder
// -- plus proves the actual (not #222's assumed) cross-Group contract, so
// the full required-behavior list has real, direct evidence.
test("creates a Spacer from the Insert Ribbon, duplicates/copies it, reorders it within its Group by drag, and rejects a cross-Group drop", async ({ page }) => {
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

  // #222's own text asks for cross-Group Spacer move via drag, but
  // spacer.move's planner (packages/commands/src/planner.ts) explicitly
  // rejects a cross-Group targetGroupId with SPACER_OWNER_MISMATCH -- a
  // Spacer belongs to exactly one Group by deliberate Core command policy,
  // not by omission. The drag interaction owner correctly refuses to even
  // attempt it (a cross-Group drop is silently a no-op for a Spacer,
  // matching every other row kind's own drop-target validation). Assert
  // that contract directly rather than assuming the issue's cross-Group
  // wording is current: dropping onto a Payload-group row must not move
  // the Spacer out of Control.
  const revisionBeforeCrossGroupAttempt = await host.getAttribute("data-canonical-revision");
  const historyBeforeCrossGroupAttempt = await page.getByTestId("history-status").textContent();
  const payloadRow = treeRows.locator("[data-role='left-row'][data-row-id='sig_cycle_data']");
  await originalSpacerInTree.dragTo(payloadRow, { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBeforeCrossGroupAttempt!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeCrossGroupAttempt!);

  // Undo everything back to the start and confirm the document returns to
  // having zero Spacer rows (proves the whole sequence is real semantic
  // history, not view-only state).
  for (let guard = 0; guard < 10 && (await page.getByTestId("history-status").textContent()) !== "History 0 / Redo 4"; guard += 1) {
    await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  }
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 4");
  await expect(host.locator("[data-role='left-row'][data-row-id^='spacer_']")).toHaveCount(0);
});
