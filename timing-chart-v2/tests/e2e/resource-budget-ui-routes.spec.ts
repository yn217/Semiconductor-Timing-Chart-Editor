import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

startInCycleSample(test);

test.setTimeout(120_000);

function documentWithSignalCount(count: number): CanonicalDocument {
  const base = canonicalFixture();
  const template = base.signals.find((signal) => signal.type === "bus");
  if (!template || base.signalGroups[0] === undefined) throw new Error("canonical fixture is missing its signal template");
  const additions = Array.from({ length: count - base.signals.length }, (_, index) => {
    const name = `BUDGET_${index}`;
    const id = `budget_signal_${index}` as SignalId;
    return { ...template, id, name, source: { ...template.source, signalName: name }, display: { ...template.display, name } };
  });
  // This is a current-format Product Budget fixture, not a legacy-migration
  // fixture. Stable change IDs avoid adding the legitimate Open migration
  // diagnostic to the Problems count before the budget operation is tested.
  const signals = [...base.signals, ...additions].map((signal) => {
    if (signal.type === "clock") {
      return signal.enable === undefined ? signal : {
        ...signal,
        enable: signal.enable.map((change, index) => ({ ...change, id: `${signal.id}_enable_${index}` })),
      };
    }
    if (signal.type === "commentRow") return signal;
    return { ...signal, values: signal.values.map((change, index) => ({ ...change, id: `${signal.id}_change_${index}` })) };
  });
  return {
    ...base,
    document: { ...base.document, title: `Resource budget ${count}` },
    signals,
    signalGroups: [{ ...base.signalGroups[0], rows: signals.map((signal) => signal.id) }],
  };
}

async function openDocument(page: Page, document: CanonicalDocument) {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "resource-budget.tcd.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await expect(page.getByTestId("signal-count-status")).toHaveText(`Signals: ${document.signals.length}`);
  return host;
}

test("clipboard paste crosses the exact signal budget once and rejects overflow atomically", async ({ page }) => {
  const host = await openDocument(page, documentWithSignalCount(9_999));
  await host.locator("[data-role='frozen-row'][data-row-id='sig_clk']").click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");

  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied CLK");
  const revisionBeforePaste = await host.getAttribute("data-canonical-revision");
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 10000");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const revisionAtLimit = await host.getAttribute("data-canonical-revision");
  expect(revisionAtLimit).not.toBe(revisionBeforePaste);

  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host).toHaveAttribute("data-canonical-revision", revisionAtLimit!);
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 10000");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await page.getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("RESOURCE_LIMIT_EXCEEDED");
  await expect(page.getByTestId("problems-panel")).toContainText("signals");
});

test("bulk registration crosses the exact signal budget once and rejects overflow atomically", async ({ page }) => {
  await openDocument(page, documentWithSignalCount(9_998));
  await page.getByLabel("Add signal or group").click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Bulk Signal Registration", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  await dialog.getByLabel("Bulk signal definitions").fill("bulk.alpha binary\nbulk.beta binary");
  await dialog.getByTestId("bulk-register-preview-button").click();
  await expect(dialog.getByTestId("bulk-register-preview")).toContainText("Ready to register 2 signals");
  await dialog.getByTestId("bulk-register-apply").click();
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 10000");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByLabel("Add signal or group").click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Bulk Signal Registration", exact: true }).click();
  const overflowDialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  await overflowDialog.getByLabel("Bulk signal definitions").fill("bulk.overflow binary");
  await overflowDialog.getByTestId("bulk-register-preview-button").click();
  await overflowDialog.getByTestId("bulk-register-apply").click();
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 10000");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await expect(overflowDialog).toContainText("Document resource limit exceeded for signals: 10,001 exceeds 10,000.");
  await overflowDialog.getByRole("button", { name: "Close bulk registration" }).click();
  await page.getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("RESOURCE_LIMIT_EXCEEDED");
});

test("AI Preview/Validate/Apply cannot commit a Signal beyond the resource budget", async ({ page }) => {
  const host = await openDocument(page, documentWithSignalCount(10_000));
  await host.locator("[data-role='frozen-row'][data-row-id='sig_clk']").click();
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByLabel("AI semantic query").fill("create signal named AI_OVERFLOW");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-preview")).toContainText("Create binary signal AI_OVERFLOW");
  await ai.getByTestId("ai-validate").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Validated · deterministic local checks passed");
  await ai.getByTestId("ai-apply").click();
  await expect(ai.getByTestId("ai-status")).toContainText("Apply failed · invalid");
  await expect(ai.getByTestId("ai-status")).toContainText("RESOURCE_LIMIT_EXCEEDED");
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 10000");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);
});

test("annotation import is rejected at the resource boundary without replacing the session", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  // The reload-persisted default document ships its own pre-existing
  // showcase annotations, which would otherwise inflate the "Annotations: 1"
  // count assertion below -- start from a genuinely blank document.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("unsaved-discard").click({ timeout: 2000 }).catch(() => {});
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 1");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const annotations = Array.from({ length: 20_001 }, (_, index) => ({
    id: `budget_annotation_${index}`,
    type: "text",
    label: `Budget annotation ${index}`,
    visible: true,
    anchor: { signalId: "sig_cycle_request", cycle: 0, point: "value-start" },
  }));
  await page.getByLabel("Import annotations").setInputFiles({
    name: "over-budget-annotations.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(annotations)),
  });
  const editor = page.getByTestId("annotation-editor");
  await expect(page.getByTestId("annotation-collection-status")).toContainText("Document resource limit exceeded for annotations: 20,001 exceeds 20,000.");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await page.getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("RESOURCE_LIMIT_EXCEEDED");
});

test("annotation import rejects deeply nested JSON before migration or replacement", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  let nested: unknown = {};
  for (let index = 0; index < 140; index += 1) nested = { nested };
  await page.getByLabel("Import annotations").setInputFiles({ name: "deep-annotations.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(nested)) });
  const editor = page.getByTestId("annotation-editor");
  await expect(page.getByTestId("annotation-collection-status")).toContainText("Document JSON nesting depth exceeds the import limit.");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
});

// #434 follow-up: Signal Event Import (`event-table.tsx`'s `importValues`)
// read the whole file and called raw `JSON.parse` before any byte/depth
// gate, reintroducing the same unbounded-recursion class of bug the shared
// `parseJsonInput()` boundary already closed for Annotation Import above.
test("Signal Event Import rejects deeply nested JSON before values are replaced", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  let nested: unknown = {};
  for (let index = 0; index < 140; index += 1) nested = { nested };
  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles({ name: "deep-events.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(nested)) });
  await expect(editor.getByTestId("event-import-status")).toContainText("nesting depth exceeds");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Signal Event Import rejects an oversized file before it is read as JSON", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  // Playwright's inline `buffer` input caps out at 50MB; a real over-budget
  // file must be written to disk and referenced by path instead.
  const oversized = { values: [{ start: 0, value: "0", comment: "x".repeat(51 * 1024 * 1024) }] };
  const tempDir = mkdtempSync(join(tmpdir(), "signal-event-import-"));
  const tempFile = join(tempDir, "oversized-events.json");
  writeFileSync(tempFile, JSON.stringify(oversized));
  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles(tempFile);
  await expect(editor.getByTestId("event-import-status")).toContainText("exceeds");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Advanced JSON rejects a resource overflow before document replacement", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  const document = JSON.parse(await json.getByLabel("Advanced JSON").inputValue()) as { timeline: { cycleCount: number; end: number } };
  document.timeline.cycleCount = 100_001;
  document.timeline.end = 100_001;
  await json.getByLabel("Advanced JSON").fill(JSON.stringify(document, null, 2));
  await json.getByTestId("apply-advanced-json").click();
  await expect(json).toContainText("Invalid: RESOURCE_LIMIT_EXCEEDED");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
});
