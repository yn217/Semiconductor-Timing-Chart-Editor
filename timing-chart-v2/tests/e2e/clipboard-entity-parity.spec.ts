import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { canonicalFixture } from "../fixtures/canonical.js";
import { startInCycleSample } from "./cycle-startup.js";
import { snapshotAnnotationIds, waitForCreatedAnnotationId } from "./annotation-identity.js";

startInCycleSample(test);

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function openTransactionEditor(page: Page) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  return page.getByTestId("transaction-editor");
}

const cutLinkedSignal = {
  id: "sig_shared",
  name: "SHARED",
  type: "binary",
  role: "internal",
  source: { instancePath: [], signalName: "shared" },
  display: { name: "SHARED" },
  values: [{ start: 0, value: 0 }, { start: 4, value: 1 }],
};

function cutDocument(id: string, entities: Record<string, unknown> = {}) {
  return {
    formatVersion: 2,
    document: { id, title: id, header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
    timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_main", name: "Main", rows: [cutLinkedSignal.id] }],
    signals: [cutLinkedSignal],
    bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
    ...entities,
  };
}

test("Signal Cut/Paste restores the same stable ID and name in the target Group", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const signal = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await signal.click();
  const originalName = await signal.getAttribute("data-name");
  const ribbon = page.getByTestId("ribbon");
  const saveDocument = async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await ribbon.getByRole("button", { name: "Save", exact: true }).click();
    const path = await (await downloadPromise).path();
    expect(path).toBeTruthy();
    const saved = JSON.parse(readFileSync(path!, "utf8")) as { signals: Array<{ id: string; values?: Array<{ id?: string; start: number; value: string | number }> }> };
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    return saved;
  };
  const before = await saveDocument();
  const sourceSignal = before.signals.find((item) => item.id === "sig_cycle_request")!;
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(0);
  await host.locator("[data-role='frozen-row'][data-group-id='grp_cycle_payload']").first().click();
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  const restored = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await expect(restored).toBeVisible();
  await expect(restored).toHaveAttribute("data-name", originalName!);
  await expect(restored).toHaveAttribute("data-group-id", "grp_cycle_payload");
  const after = await saveDocument();
  const restoredSignal = after.signals.find((item) => item.id === "sig_cycle_request")!;
  expect(restoredSignal.values?.map(({ id }) => id)).toEqual(sourceSignal.values?.map(({ id }) => id));
});

test("Clock Duplicate and Copy/Paste allocate fresh enable-change IDs through Home", async ({ page }) => {
  const source = canonicalFixture();
  const clockSource = source.signals.find((signal) => signal.type === "clock");
  if (clockSource?.type !== "clock") throw new Error("Canonical fixture must contain a Clock Signal.");
  const clock = {
    ...clockSource,
    id: "sig_clipboard_clock" as typeof clockSource.id,
    name: "CLIPBOARD_CLK",
    display: { ...clockSource.display, name: "CLIPBOARD_CLK" },
    enable: [
      { id: "clock_enable_start", start: 1, value: 1 },
      { id: "clock_enable_stop", start: 5, value: 0 },
    ],
  };
  const document = {
    ...source,
    timeline: { ...source.timeline, referenceClock: clock.id, labelAnchors: [] },
    signalGroups: [{ ...source.signalGroups[0]!, rows: [clock.id], spacers: [] }],
    signals: [clock],
    transactions: [],
    annotations: [],
    annotationGroups: [],
    timeGroups: [],
    constraints: [],
  };
  await page.goto("/");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "clock-copy.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  let savedPath: string | undefined;
  const save = async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    savedPath = await (await downloadPromise).path() ?? undefined;
    expect(savedPath).toBeTruthy();
    const saved = JSON.parse(readFileSync(savedPath!, "utf8")) as { signals: Array<{ id: string; name: string; type: string; enable?: Array<{ id?: string; start: number; value: number }> }> };
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    return saved;
  };
  const hostClock = host.locator(`[data-role='frozen-row'][data-row-id='${clock.id}']`);
  await expect(hostClock).toBeVisible();
  const originalEnableIds = (await save()).signals.find((signal) => signal.id === clock.id)!.enable!.map((change) => change.id!);
  await hostClock.click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const afterDuplicate = await save();
  const duplicate = afterDuplicate.signals.find((signal) => signal.name === "CLIPBOARD_CLK_duplicate")!;
  expect(duplicate.type).toBe("clock");
  const duplicateIds = duplicate.enable!.map((change) => change.id!);
  expect(duplicateIds).toHaveLength(originalEnableIds.length);
  expect(duplicateIds.some((id) => originalEnableIds.includes(id))).toBe(false);

  await hostClock.click();
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const afterPaste = await save();
  const pasted = afterPaste.signals.find((signal) => signal.name === "CLIPBOARD_CLK_copy")!;
  const pastedIds = pasted.enable!.map((change) => change.id!);
  expect(pastedIds).toHaveLength(originalEnableIds.length);
  expect(pastedIds.some((id) => [...originalEnableIds, ...duplicateIds].includes(id))).toBe(false);
  expect(new Set([...originalEnableIds, ...duplicateIds, ...pastedIds]).size).toBe(originalEnableIds.length + duplicateIds.length + pastedIds.length);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await save()).toEqual(afterPaste);
});

test("same-document multi-Signal Cut/Paste restores Transaction links atomically and through Save/Open", async ({ page }) => {
  await ready(page);
  const second = { ...cutLinkedSignal, id: "sig_second", name: "SECOND", display: { name: "SECOND" }, source: { instancePath: [], signalName: "second" } };
  const target = { ...cutLinkedSignal, id: "sig_target", name: "TARGET", display: { name: "TARGET" }, source: { instancePath: [], signalName: "target" } };
  const document = cutDocument("doc_cut_links", {
    signalGroups: [
      { id: "grp_source", name: "Source", rows: [cutLinkedSignal.id, second.id] },
      { id: "grp_target", name: "Target", rows: [target.id] },
    ],
    signals: [cutLinkedSignal, second, target],
    transactions: [{ id: "txn_linked", name: "Linked", start: 1, end: 4, laneId: "lane_0", linkedSignals: [cutLinkedSignal.id, second.id] }],
  });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "cut-links.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host.locator(`[data-role='frozen-row'][data-row-id='${cutLinkedSignal.id}']`)).toBeVisible();
  await expect(host.locator(`[data-role='frozen-row'][data-row-id='${target.id}']`)).toBeVisible();
  await host.locator(`[data-role='frozen-row'][data-row-id='${cutLinkedSignal.id}']`).click();
  await host.locator(`[data-role='frozen-row'][data-row-id='${second.id}']`).click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Cut 2 signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await host.locator(`[data-role='frozen-row'][data-row-id='${target.id}']`).click();
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Moved 2 signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  for (const id of [cutLinkedSignal.id, second.id]) {
    await expect(host.locator(`[data-role='frozen-row'][data-row-id='${id}']`)).toHaveAttribute("data-group-id", "grp_target");
  }

  const saveAndRead = async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await ribbon.getByRole("button", { name: "Save", exact: true }).click();
    const path = await (await downloadPromise).path();
    expect(path).toBeTruthy();
    const saved = JSON.parse(readFileSync(path!, "utf8")) as { signals: readonly { id: string }[]; transactions: readonly { id: string; linkedSignals?: readonly string[] }[] };
    await page.getByRole("button", { name: "Home", exact: true }).click();
    return saved;
  };
  const moved = await saveAndRead();
  expect(moved.transactions.find((item) => item.id === "txn_linked")?.linkedSignals).toEqual([cutLinkedSignal.id, second.id]);

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  const undone = await saveAndRead();
  expect(undone.signals.some((signal) => signal.id === cutLinkedSignal.id || signal.id === second.id)).toBe(false);
  expect(undone.transactions.find((item) => item.id === "txn_linked")?.linkedSignals).toEqual([]);

  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const redone = await saveAndRead();
  expect(redone.transactions.find((item) => item.id === "txn_linked")?.linkedSignals).toEqual([cutLinkedSignal.id, second.id]);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "cut-links-saved.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(redone)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Cut rejects the current Reference Clock instead of silently removing its identity", async ({ page }) => {
  await ready(page);
  const clock = { id: "sig_clock", name: "CLOCK", type: "clock", role: "input", source: { instancePath: [], signalName: "clock" }, display: { name: "CLOCK" }, generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } };
  const document = cutDocument("doc_reference_cut", {
    timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", referenceClock: clock.id, edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_main", name: "Main", rows: [clock.id, cutLinkedSignal.id] }],
    signals: [clock, cutLinkedSignal],
  });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "reference-clock.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host.locator(`[data-role='frozen-row'][data-row-id='${clock.id}']`)).toBeVisible();
  await host.locator(`[data-role='frozen-row'][data-row-id='${clock.id}']`).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Reference Clock cannot be cut; change the reference clock first");
  await expect(host.locator(`[data-role='frozen-row'][data-row-id='${clock.id}']`)).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
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
  const previousIds = await snapshotAnnotationIds(host);
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const annotationList = page.getByTestId("annotation-list");
  await expect(annotationList).toBeVisible();
  const originalId = await waitForCreatedAnnotationId(host, previousIds);
  const annotation = annotationList.locator(`[data-annotation-list-id='${originalId}']`);
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
  const beforePasteIds = await snapshotAnnotationIds(host);
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Pasted .* annotation/);
  const pastedId = await waitForCreatedAnnotationId(host, beforePasteIds);
  const pastedAnnotation = annotationList.locator(`[data-annotation-list-id='${pastedId}']`);
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
  // The form fields are in TC (1 TC = 10 cycles by default): 0.2 .. 0.6 TC = cycles 2 .. 6 (2..6 TC would exceed the 24-cycle sample and be rejected).
  await editor.getByLabel("New Transaction start").fill("0.2");
  await editor.getByLabel("New Transaction end").fill("0.6");
  await editor.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.locator(".transaction-list-row")).toHaveCount(1);

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
  await expect(editorAfterPaste.locator(".transaction-list-row")).toHaveCount(2);
  await expect(editorAfterPaste.getByRole("group", { name: /Edit Clip Test Paste/ })).toHaveCount(1);
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
  // The pasted Transaction is auto-selected, so its row is already the in-place editing group (#703).
  await expect(editorForCut.getByRole("group", { name: /Edit Clip Test Paste/ })).toBeVisible();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Cut .* transaction/);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  const editorAfterCut = await openTransactionEditor(page);
  await expect(editorAfterCut.locator(".transaction-list-row")).toHaveCount(1);

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(transactionSavedPath!);
  await expect(page.getByTestId("unsaved-file-dialog")).toBeVisible();
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  const editorAfterReopen = await openTransactionEditor(page);
  await expect(editorAfterReopen.locator(".transaction-list-row")).toHaveCount(2);
});
