import { expect, test } from "@playwright/test";
import { openBottomSettings } from "./bottom-settings.js";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("delayed Annotation import does not overwrite a Signal edit committed after the read starts", async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    const testWindow = window as typeof window & {
      __annotationImportReadPending?: boolean;
      __completeAnnotationImportRead?: () => void;
    };
    File.prototype.text = function () {
      if (this.name !== "delayed-annotations.json") return originalText.call(this);
      testWindow.__annotationImportReadPending = true;
      return new Promise<string>((resolve) => {
        testWindow.__completeAnnotationImportRead = () => resolve(JSON.stringify([
          { id: "annotation_from_delayed_import", type: "text", label: "Delayed", visible: true, anchor: { cycle: 2, point: "cycle-start" } },
        ]));
      });
    };
  });

  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  await openBottomSettings(page);
  await page.getByTestId("follow-selection").uncheck();

  await page.getByLabel("Import annotations").setInputFiles({
    name: "delayed-annotations.json",
    mimeType: "application/json",
    buffer: Buffer.from("[]"),
  });
  await page.waitForFunction(() => (window as typeof window & { __annotationImportReadPending?: boolean }).__annotationImportReadPending === true);

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const signalName = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await expect(signalName).toBeVisible();
  await signalName.fill("REQUEST_AFTER_IMPORT_STARTED");
  await signalName.press("Enter");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQUEST_AFTER_IMPORT_STARTED");
  const historyAfterEdit = await page.getByTestId("history-status").textContent();
  const dirtyAfterEdit = await page.getByTestId("dirty-status").textContent();
  const revisionAfterEdit = await host.getAttribute("data-canonical-revision");

  await page.evaluate(() => (window as typeof window & { __completeAnnotationImportRead?: () => void }).__completeAnnotationImportRead?.());

  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQUEST_AFTER_IMPORT_STARTED");
  await expect(host).toHaveAttribute("data-canonical-revision", revisionAfterEdit!);
  await expect(page.getByTestId("history-status")).toHaveText(historyAfterEdit!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyAfterEdit!);
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await expect(page.getByTestId("annotation-collection-status")).toContainText("Annotation import cancelled");
  await expect(page.getByTestId("annotation-list").locator("[data-annotation-list-id='annotation_from_delayed_import']")).toHaveCount(0);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel").getByRole("button", { name: "ANNOTATION_IMPORT_STALE" })).toBeVisible();
});

test("delayed Event import is cancelled when its Signal editor is replaced by another target", async ({ page }) => {
  await page.addInitScript(() => {
    const originalReadAsText = FileReader.prototype.readAsText;
    const testWindow = window as typeof window & {
      __eventImportReadPending?: boolean;
      __completeEventImportRead?: () => void;
    };
    FileReader.prototype.readAsText = function (blob, encoding) {
      if (!(blob instanceof File) || blob.name !== "delayed-events.json") return originalReadAsText.call(this, blob, encoding);
      testWindow.__eventImportReadPending = true;
      Object.defineProperty(this, "result", { configurable: true, get: () => JSON.stringify({ values: [{ start: 0, value: "0" }, { start: 4, value: "X" }] }) });
      testWindow.__completeEventImportRead = () => this.dispatchEvent(new ProgressEvent("load"));
    };
  });

  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  await expect(editor.locator("form.event-row").first()).toBeVisible();
  const startingRows = await editor.locator("form.event-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-start")));
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();
  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles({
    name: "delayed-events.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await page.waitForFunction(() => (window as typeof window & { __eventImportReadPending?: boolean }).__eventImportReadPending === true);

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(page.getByTestId("signal-editor")).toContainText("READY");
  await page.evaluate(() => (window as typeof window & { __completeEventImportRead?: () => void }).__completeEventImportRead?.());

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const requestEditor = page.getByTestId("signal-editor");
  await expect(requestEditor).toContainText("REQUEST");
  const endingRows = await requestEditor.locator("form.event-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-start")));
  expect(endingRows).toEqual(startingRows);
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("Event import cancelled");
  await expect(page.getByTestId("problems-panel").getByRole("button", { name: "EVENT_IMPORT_STALE" })).toBeVisible();
});

test("delayed Annotation import cannot resurrect the previous document after File New", async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    const testWindow = window as typeof window & {
      __annotationImportReadPending?: boolean;
      __completeAnnotationImportRead?: () => void;
    };
    File.prototype.text = function () {
      if (this.name !== "delayed-annotations-new.json") return originalText.call(this);
      testWindow.__annotationImportReadPending = true;
      return new Promise<string>((resolve) => {
        testWindow.__completeAnnotationImportRead = () => resolve(JSON.stringify([
          { id: "annotation_from_old_document", type: "text", label: "Old document", visible: true, anchor: { cycle: 2, point: "cycle-start" } },
        ]));
      });
    };
  });

  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  await page.getByLabel("Import annotations").setInputFiles({
    name: "delayed-annotations-new.json",
    mimeType: "application/json",
    buffer: Buffer.from("[]"),
  });
  await page.waitForFunction(() => (window as typeof window & { __annotationImportReadPending?: boolean }).__annotationImportReadPending === true);

  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "New", exact: true }).click();
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const newDocumentIds = await page.getByTestId("annotation-list").locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")));

  await page.evaluate(() => (window as typeof window & { __completeAnnotationImportRead?: () => void }).__completeAnnotationImportRead?.());

  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  const endingIds = await page.getByTestId("annotation-list").locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")));
  expect(endingIds).toEqual(newDocumentIds);
  expect(endingIds).not.toContain("annotation_from_old_document");
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel").getByRole("button", { name: "ANNOTATION_IMPORT_STALE" })).toBeVisible();
});

test("delayed Annotation import cannot cross an Undo/Redo revision change", async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    const testWindow = window as typeof window & {
      __annotationUndoReadPending?: boolean;
      __completeAnnotationUndoRead?: () => void;
    };
    File.prototype.text = function () {
      if (this.name !== "delayed-annotations-undo.json") return originalText.call(this);
      testWindow.__annotationUndoReadPending = true;
      return new Promise<string>((resolve) => {
        testWindow.__completeAnnotationUndoRead = () => resolve(JSON.stringify([
          { id: "annotation_from_undo_import", type: "text", label: "Delayed after Undo", visible: true, anchor: { cycle: 2, point: "cycle-start" } },
        ]));
      });
    };
  });

  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const signalName = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await signalName.fill("REQUEST_BEFORE_UNDO_IMPORT");
  await signalName.press("Enter");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  await openBottomSettings(page);
  await page.getByTestId("follow-selection").uncheck();
  await page.getByLabel("Import annotations").setInputFiles({
    name: "delayed-annotations-undo.json",
    mimeType: "application/json",
    buffer: Buffer.from("[]"),
  });
  await page.waitForFunction(() => (window as typeof window & { __annotationUndoReadPending?: boolean }).__annotationUndoReadPending === true);

  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQUEST_BEFORE_UNDO_IMPORT");
  const revisionBeforeCompletion = await host.getAttribute("data-canonical-revision");
  const historyBeforeCompletion = await page.getByTestId("history-status").textContent();
  const dirtyBeforeCompletion = await page.getByTestId("dirty-status").textContent();

  await page.evaluate(() => (window as typeof window & { __completeAnnotationUndoRead?: () => void }).__completeAnnotationUndoRead?.());

  await expect(host).toHaveAttribute("data-canonical-revision", revisionBeforeCompletion!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeCompletion!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBeforeCompletion!);
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await expect(page.getByTestId("annotation-collection-status")).toContainText("Annotation import cancelled");
  await expect(page.getByTestId("annotation-list").locator("[data-annotation-list-id='annotation_from_undo_import']")).toHaveCount(0);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel").getByRole("button", { name: "ANNOTATION_IMPORT_STALE" })).toBeVisible();
});

test("delayed Event import is rejected after New/Open reuses the original Signal ID", async ({ page }) => {
  await page.addInitScript(() => {
    const originalReadAsText = FileReader.prototype.readAsText;
    const testWindow = window as typeof window & {
      __eventNewOpenReadPending?: boolean;
      __completeEventNewOpenRead?: () => void;
    };
    FileReader.prototype.readAsText = function (blob, encoding) {
      if (!(blob instanceof File) || blob.name !== "delayed-events-new-open.json") return originalReadAsText.call(this, blob, encoding);
      testWindow.__eventNewOpenReadPending = true;
      Object.defineProperty(this, "result", { configurable: true, get: () => JSON.stringify({ values: [{ start: 0, value: "0" }, { start: 4, value: "X" }] }) });
      testWindow.__completeEventNewOpenRead = () => this.dispatchEvent(new ProgressEvent("load"));
    };
  });

  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedDocument = await downloadPromise;
  const savedPath = await savedDocument.path();
  expect(savedPath).toBeTruthy();

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  await expect(editor.locator("form.event-row").first()).toBeVisible();
  const targetId = await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").getAttribute("data-row-id");
  expect(targetId).toBe("sig_cycle_request");
  const startingRows = await editor.locator("form.event-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-start")));
  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles({
    name: "delayed-events-new-open.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await page.waitForFunction(() => (window as typeof window & { __eventNewOpenReadPending?: boolean }).__eventNewOpenReadPending === true);

  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "New", exact: true }).click();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const reopenedEditor = page.getByTestId("signal-editor");
  await expect(reopenedEditor).toContainText("REQUEST");
  await expect(host.locator(`[data-role='frozen-row'][data-row-id='${targetId}']`)).toHaveCount(1);
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();

  await page.evaluate(() => (window as typeof window & { __completeEventNewOpenRead?: () => void }).__completeEventNewOpenRead?.());

  const endingRows = await reopenedEditor.locator("form.event-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-start")));
  expect(endingRows).toEqual(startingRows);
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("Event import cancelled");
  await expect(page.getByTestId("problems-panel").getByRole("button", { name: "EVENT_IMPORT_STALE" })).toBeVisible();
});

test("delayed Annotation import is rejected after its collection editor unmounts", async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    const testWindow = window as typeof window & {
      __annotationUnmountReadPending?: boolean;
      __completeAnnotationUnmountRead?: () => void;
    };
    File.prototype.text = function () {
      if (this.name !== "delayed-annotations-unmount.json") return originalText.call(this);
      testWindow.__annotationUnmountReadPending = true;
      return new Promise<string>((resolve) => {
        testWindow.__completeAnnotationUnmountRead = () => resolve(JSON.stringify([
          { id: "annotation_from_unmounted_editor", type: "text", label: "Late import", visible: true, anchor: { cycle: 2, point: "cycle-start" } },
        ]));
      });
    };
  });

  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const tabs = page.getByRole("tablist", { name: "Bottom context panels" });
  await tabs.getByRole("tab", { name: "Annotation" }).click();
  await page.getByLabel("Import annotations").setInputFiles({
    name: "delayed-annotations-unmount.json",
    mimeType: "application/json",
    buffer: Buffer.from("[]"),
  });
  await page.waitForFunction(() => (window as typeof window & { __annotationUnmountReadPending?: boolean }).__annotationUnmountReadPending === true);
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();

  await tabs.getByRole("tab", { name: "Signal" }).click();
  await expect(page.getByLabel("Import annotations")).toHaveCount(0);
  await page.evaluate(() => (window as typeof window & { __completeAnnotationUnmountRead?: () => void }).__completeAnnotationUnmountRead?.());

  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await tabs.getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("Annotation import cancelled");
  await expect(page.getByTestId("problems-panel").getByRole("button", { name: "ANNOTATION_IMPORT_STALE" })).toBeVisible();
});
