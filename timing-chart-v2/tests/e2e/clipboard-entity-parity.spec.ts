import { expect, test, type Page } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function openTransactionEditor(page: Page) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  return page.getByTestId("transaction-editor");
}

test("Signal Cut/Paste restores the same stable ID and name in the target Group", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const signal = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await signal.click();
  const originalName = await signal.getAttribute("data-name");
  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(0);
  await host.locator("[data-role='frozen-row'][data-group-id='grp_cycle_payload']").first().click();
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  const restored = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await expect(restored).toBeVisible();
  await expect(restored).toHaveAttribute("data-name", originalName!);
  await expect(restored).toHaveAttribute("data-group-id", "grp_cycle_payload");
});

test("Comment Row clipboard preserves content, uses fresh IDs, and supports Cut Undo Redo", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 9");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const comment = host.locator("[data-role='frozen-row'][data-kind='comment'][data-row-id]").last();
  await expect(comment).toBeVisible();
  const originalId = await comment.getAttribute("data-row-id");
  await comment.click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const revisionBeforeCopy = await page.getByTestId("revision-status").textContent();
  const historyBeforeCopy = await page.getByTestId("history-status").textContent();
  const countersBeforeCopy = await surface.getAttribute("data-render-counters");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Copied/);
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBeforeCopy!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeCopy!);
  const afterCopyCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  const beforeCopyCounters = JSON.parse(countersBeforeCopy ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  expect(afterCopyCounters.waveDromRenders).toBe(beforeCopyCounters.waveDromRenders);
  expect(afterCopyCounters.localGeometryBuilds).toBe(beforeCopyCounters.localGeometryBuilds);

  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Pasted 1 signal/);
  const rowIdsAfterPaste = await host.locator("[data-role='frozen-row'][data-row-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")));
  expect(rowIdsAfterPaste).toContain(originalId);
  expect(rowIdsAfterPaste.some((id) => id !== null && id !== originalId && id.startsWith("commentRow_phase9_"))).toBe(true);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 10");
  const afterPasteCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  expect(afterPasteCounters.waveDromRenders).toBe(beforeCopyCounters.waveDromRenders);
  expect(afterPasteCounters.localGeometryBuilds).toBe(beforeCopyCounters.localGeometryBuilds);

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const commentSavePromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const commentSavedPath = await (await commentSavePromise).path();
  expect(commentSavedPath).toBeTruthy();
  await page.getByRole("button", { name: "Home", exact: true }).click();

  const pasted = host.locator("[data-role='frozen-row'][data-kind='comment'][data-row-id]").last();
  const pastedId = await pasted.getAttribute("data-row-id");
  await pasted.click();
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Cut/);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(host.locator(`[data-role='frozen-row'][data-row-id='${pastedId}']`)).toHaveCount(0);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(commentSavedPath!);
  await expect(page.getByTestId("unsaved-file-dialog")).toBeVisible();
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 10");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("Annotation clipboard is view-only on Copy, creates a fresh entity on Paste, and cuts atomically", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const annotationList = page.getByTestId("annotation-list");
  await expect(annotationList).toBeVisible();
  const annotation = annotationList.locator("[data-annotation-list-id]").last();
  const originalId = await annotation.getAttribute("data-annotation-list-id");
  await annotation.click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const revisionBeforeCopy = await page.getByTestId("revision-status").textContent();
  const historyBeforeCopy = await page.getByTestId("history-status").textContent();
  const countersBeforeCopy = await surface.getAttribute("data-render-counters");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Copied .* annotation/);
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBeforeCopy!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeCopy!);
  const afterCopyCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  const beforeCopyCounters = JSON.parse(countersBeforeCopy ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  expect(afterCopyCounters.waveDromRenders).toBe(beforeCopyCounters.waveDromRenders);
  expect(afterCopyCounters.localGeometryBuilds).toBe(beforeCopyCounters.localGeometryBuilds);
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Pasted .* annotation/);
  const idsAfterPaste = await annotationList.locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")));
  expect(idsAfterPaste).toContain(originalId);
  expect(new Set(idsAfterPaste).size).toBe(idsAfterPaste.length);
  expect(idsAfterPaste).toHaveLength(2);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 2");
  const afterPasteCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  expect(afterPasteCounters.waveDromRenders).toBe(beforeCopyCounters.waveDromRenders);
  expect(afterPasteCounters.localGeometryBuilds).toBe(beforeCopyCounters.localGeometryBuilds);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const annotationSavePromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const annotationSavedPath = await (await annotationSavePromise).path();
  expect(annotationSavedPath).toBeTruthy();
  await page.getByRole("button", { name: "Home", exact: true }).click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const pastedAnnotation = annotationList.locator("[data-annotation-list-id]").last();
  await pastedAnnotation.click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Cut .* annotation/);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(annotationList.locator("[data-annotation-list-id]")).toHaveCount(1);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(annotationSavedPath!);
  await expect(page.getByTestId("unsaved-file-dialog")).toBeVisible();
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 2");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

// #221: Transaction had no dedicated clipboard e2e evidence beyond Duplicate
// (transaction-export.spec.ts's Split View test) -- Copy/Cut/Paste through
// the same shared clipboard-actions.ts owner as every other entity type
// were unverified. The production code already supports this (transactionRef/
// createTransaction), so this closes a test-coverage gap, not a code gap.
test("Transaction clipboard is view-only on Copy, creates a fresh entity on Paste, and cuts atomically", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const ribbon = page.getByTestId("ribbon");
  const surface = host.locator("[data-role='timing-chart-surface']");

  const editor = await openTransactionEditor(page);
  await editor.getByLabel("New Transaction name").fill("Clip Test");
  await editor.getByLabel("New Transaction start").fill("2");
  await editor.getByLabel("New Transaction end").fill("6");
  await editor.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.locator(".transaction-list button")).toHaveCount(7);

  // Creating a Transaction auto-selects it (onTransactionCreated ->
  // selection.selectTransaction), so Copy is reachable directly from Home.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const revisionBeforeCopy = await page.getByTestId("revision-status").textContent();
  const historyBeforeCopy = await page.getByTestId("history-status").textContent();
  const countersBeforeCopy = await surface.getAttribute("data-render-counters");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Copied .* transaction/);
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBeforeCopy!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeCopy!);
  const afterCopyCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  const beforeCopyCounters = JSON.parse(countersBeforeCopy ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  expect(afterCopyCounters.waveDromRenders).toBe(beforeCopyCounters.waveDromRenders);
  expect(afterCopyCounters.localGeometryBuilds).toBe(beforeCopyCounters.localGeometryBuilds);

  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Pasted .* transaction/);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const editorAfterPaste = await openTransactionEditor(page);
  await expect(editorAfterPaste.locator(".transaction-list button")).toHaveCount(8);
  await expect(editorAfterPaste.getByRole("button", { name: /Clip Test Paste/ })).toHaveCount(1);
  const afterPasteCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as { waveDromRenders?: number; localGeometryBuilds?: number };
  expect(afterPasteCounters.waveDromRenders).toBe(beforeCopyCounters.waveDromRenders);
  expect(afterPasteCounters.localGeometryBuilds).toBe(beforeCopyCounters.localGeometryBuilds);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const transactionSavePromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const transactionSavedPath = await (await transactionSavePromise).path();
  expect(transactionSavedPath).toBeTruthy();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const editorForCut = page.getByTestId("transaction-editor");
  await editorForCut.getByRole("button", { name: /Clip Test Paste/ }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Cut .* transaction/);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  const editorAfterCut = await openTransactionEditor(page);
  await expect(editorAfterCut.locator(".transaction-list button")).toHaveCount(7);

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(transactionSavedPath!);
  await expect(page.getByTestId("unsaved-file-dialog")).toBeVisible();
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  const editorAfterReopen = await openTransactionEditor(page);
  await expect(editorAfterReopen.locator(".transaction-list button")).toHaveCount(8);
});
