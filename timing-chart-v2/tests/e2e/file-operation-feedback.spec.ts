import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startInCycleSample } from "./cycle-startup.js";
import { cycleDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";
import { serializeCanonicalDocument, type DocumentProblem } from "../../packages/schema/src/index.js";

startInCycleSample(test);

test("dirty New saves the edited document before replacing it with a clean template", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("SAVED_BEFORE_NEW");
  await name.press("Enter");
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible();
  const pending = page.waitForEvent("download");
  await dialog.getByTestId("unsaved-save").click();
  const file = await pending;
  const saved = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(saved.signals.find((signal: { id: string }) => signal.id === "sig_cycle_request").display.name).toBe("SAVED_BEFORE_NEW");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("titlebar-document-title")).toHaveText("Untitled Timing Chart");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("selection-status")).toHaveText("None");
  await expect(page.getByTestId("operation-feedback")).toHaveCount(0);
});

test("cancel Open picker and Save As do not publish errors or change the document", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await page.getByTestId("revision-status").textContent();
  const ribbon = page.getByTestId("ribbon");
  const pending = page.waitForEvent("filechooser");
  await ribbon.getByRole("button", { name: "Open", exact: true }).click();
  await (await pending).setFiles([]);
  await expect(page.getByTestId("operation-feedback")).toHaveCount(0);
  await ribbon.getByRole("button", { name: "Save As", exact: true }).click();
  const saveAs = page.getByRole("dialog", { name: "Save As", exact: true });
  await saveAs.getByLabel("Save As filename").fill("canceled-name");
  await page.keyboard.press("Escape");
  await expect(saveAs).toHaveCount(0);
  await expect(page.getByTestId("operation-feedback")).toHaveCount(0);
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("unsupported format preserves source and current document while explaining compatibility", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await page.getByTestId("revision-status").textContent();
  const title = await page.getByTestId("titlebar-document-title").textContent();
  const source = JSON.stringify({ formatVersion: 99, document: { id: "future", title: "Future document" }, unknownField: { retain: true } });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "future.tcd", mimeType: "application/json", buffer: Buffer.from(source) });
  const dialog = page.getByTestId("compatibility-dialog");
  await expect(dialog).toContainText("Format version 99");
  await expect(dialog.getByLabel("Compatibility source")).toHaveValue(source);
  await dialog.getByTestId("compatibility-read-only").click();
  await expect(dialog.getByRole("status")).toHaveText("Read-only Compatibility Mode active");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("titlebar-document-title")).toHaveText(title!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("serializer validation failure reaches visible feedback and Problems without corrupting the session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("VALID_LIVE_DOCUMENT");
  await name.press("Enter");
  const revision = await page.getByTestId("revision-status").textContent();
  // Boundary fault injection, not invalid Canonical mutation: validate a detached
  // candidate using the real schema serializer and pass its real error to Save.
  const candidate = structuredClone(cycleDocument);
  candidate.timeline.end = candidate.timeline.cycleCount + 1;
  let failure: (Error & { problems: readonly DocumentProblem[] }) | undefined;
  try { serializeCanonicalDocument(candidate); }
  catch (error) { failure = error as Error & { problems: readonly DocumentProblem[] }; }
  expect(failure?.problems.some((problem) => problem.code === "TIMELINE_END_MISMATCH" && problem.path === "$.timeline.end")).toBe(true);
  await page.evaluate(async (payload) => {
    const controllerPath = "/src/runtime/editor-session-controller.ts";
    const { EditorSessionController } = await import(controllerPath);
    const prototype = EditorSessionController.prototype;
    const original = prototype.serializeCurrentDocument;
    prototype.serializeCurrentDocument = function () {
      prototype.serializeCurrentDocument = original;
      throw Object.assign(new Error(payload.message), { name: payload.name, problems: payload.problems });
    };
  }, { message: failure!.message, name: failure!.name, problems: failure!.problems });
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const feedback = page.getByTestId("operation-feedback");
  await expect(feedback.getByRole("alert")).toContainText("cycleCount");
  await expect(feedback.getByRole("alert")).toContainText("Save document");
  await expect(feedback.getByRole("status")).toHaveCount(0);
  await feedback.getByRole("button", { name: "Open Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("$.timeline.end");
  await expect(page.getByTestId("problems-panel")).toContainText("TIMELINE_END_MISMATCH");
  await expect(page.getByTestId("problems-panel")).toContainText("Fix the reported field and retry Save");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await expect(name).toHaveValue("VALID_LIVE_DOCUMENT");
  const pending = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await pending;
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

for (const input of [
  { name: "syntax.tcd", text: "{ broken", code: "JSON_SYNTAX" },
  { name: "invalid.tcd", text: "{}", code: "FORMAT_VERSION" },
]) test(`failed Open ${input.name} is visible without a selected Signal`, async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await page.getByTestId("revision-status").textContent();
  await expect(page.getByTestId("selection-status")).toHaveText("None");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: input.name, mimeType: "application/json", buffer: Buffer.from(input.text) });
  const feedback = page.getByTestId("operation-feedback");
  await expect(feedback.getByRole("alert")).not.toBeEmpty();
  await feedback.getByRole("button", { name: "Open Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText(input.code);
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("file access failure retains its reason, filename and actionable diagnostic", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await page.getByTestId("revision-status").textContent();
  await page.evaluate(() => { File.prototype.arrayBuffer = async () => { throw new DOMException("Permission denied", "NotReadableError"); }; });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "unreadable.tcd", mimeType: "application/json", buffer: Buffer.from("{}") });
  const feedback = page.getByTestId("operation-feedback");
  await expect(feedback.getByRole("alert")).toContainText("Could not read unreadable.tcd: Permission denied");
  await feedback.getByRole("button", { name: "Open Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("OPEN_READ_FAILED");
  await expect(page.getByTestId("problems-panel")).toContainText("Check file access permissions");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("Save failure stays dirty; successful retry publishes filename only after download and New clears it", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("UNSAVED_REQUEST");
  await name.press("Enter");
  const revision = await page.getByTestId("revision-status").textContent();
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = (blob) => { URL.createObjectURL = original; throw new Error("download blocked"); }; });
  const save = page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true });
  await save.click();
  const feedback = page.getByTestId("operation-feedback");
  await expect(feedback.getByRole("alert")).toContainText("Save document failed: download blocked");
  await expect(feedback.getByRole("status")).toHaveCount(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const pending = page.waitForEvent("download");
  await save.click();
  const download = await pending;
  await expect(feedback.getByRole("status")).toHaveText(`Saved: ${download.suggestedFilename()}`);
  await expect(feedback.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await expect(feedback).toHaveCount(0);
});
