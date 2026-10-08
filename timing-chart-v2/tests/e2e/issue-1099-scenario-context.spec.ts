import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { scenarioModelFromV2, serializeScenarioDocumentModel, type AnnotationId, type BookmarkId, type TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { startInCycleMode } from "./cycle-startup.js";
import { openBottomSettings } from "./bottom-settings.js";

startInCycleMode(test);
const initial = scenarioModelFromV2(canonicalFixture());
const source = initial.scenarios[0]!;
const alternate = { ...source, id: "scenario_alt" as typeof source.id, name: "Alternate" };
const model = { ...initial, scenarios: [source, alternate] };

async function openScenarios(page: Page) {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "scenario-context.tcd", mimeType: "application/json", buffer: Buffer.from(serializeScenarioDocumentModel(model)) });
  await expect(page.getByTestId("active-scenario")).toHaveValue(source.id);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function expectUnchanged(page: Page) {
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const saved = JSON.parse(await readFile((await (await download).path())!, "utf8"));
  expect(saved.scenarios).toEqual(model.scenarios);
  expect(saved.signalDefinitions).toEqual(model.signalDefinitions);
}

test("delayed Event import cannot commit into another Scenario with the same Signal ID", async ({ page }) => {
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsText;
    const state = window as typeof window & { finishScenarioEventRead?: () => void };
    FileReader.prototype.readAsText = function (blob, encoding) {
      if (!(blob instanceof File) || blob.name !== "delayed-context-events.json") return original.call(this, blob, encoding);
      Object.defineProperty(this, "result", { configurable: true, get: () => JSON.stringify({ values: [{ start: 0, value: "FF" }] }) });
      state.finishScenarioEventRead = () => this.dispatchEvent(new ProgressEvent("load"));
    };
  });
  await openScenarios(page);
  await page.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles({ name: "delayed-context-events.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.waitForFunction(() => typeof (window as typeof window & { finishScenarioEventRead?: unknown }).finishScenarioEventRead === "function");
  await page.getByTestId("active-scenario").selectOption(alternate.id);
  await page.evaluate(() => (window as typeof window & { finishScenarioEventRead?: () => void }).finishScenarioEventRead!());
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await expectUnchanged(page);
});

test("delayed Annotation import cannot commit into another Scenario", async ({ page }) => {
  await page.addInitScript(() => {
    const original = File.prototype.text;
    const state = window as typeof window & { finishScenarioAnnotationRead?: () => void };
    File.prototype.text = function () {
      if (this.name !== "delayed-context-annotations.json") return original.call(this);
      return new Promise<string>((resolve) => { state.finishScenarioAnnotationRead = () => resolve(JSON.stringify([{ id: "stale_annotation", type: "text", label: "Stale", visible: true, anchor: { cycle: 2, point: "cycle-start" } }])); });
    };
  });
  await openScenarios(page);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  await page.getByLabel("Import annotations").setInputFiles({ name: "delayed-context-annotations.json", mimeType: "application/json", buffer: Buffer.from("[]") });
  await page.waitForFunction(() => typeof (window as typeof window & { finishScenarioAnnotationRead?: unknown }).finishScenarioAnnotationRead === "function");
  await page.getByTestId("active-scenario").selectOption(alternate.id);
  await page.evaluate(() => (window as typeof window & { finishScenarioAnnotationRead?: () => void }).finishScenarioAnnotationRead!());
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await expectUnchanged(page);
});

test("equal-base Event drafts are cancelled on Scenario switch", async ({ page }) => {
  await openScenarios(page);
  await page.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  await page.getByLabel("New event comment").fill("Scenario A only");
  await page.getByTestId("event-row-comment-0").fill("Scenario A row draft");
  await expect(page.getByTestId("event-row-unapplied-0")).toBeVisible();
  await page.getByTestId("active-scenario").selectOption(alternate.id);
  await page.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  await expect(page.getByLabel("New event comment")).toHaveValue("");
  await expect(page.getByTestId("event-row-comment-0")).toHaveValue("");
  await expect(page.getByTestId("event-row-unapplied-0")).toHaveCount(0);
  await expectUnchanged(page);
});

test("validated AI preview is discarded on equal-revision Scenario switch", async ({ page }) => {
  await openScenarios(page);
  await page.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByLabel("AI semantic query").fill("rename selected signal to STALE_NAME");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await ai.getByTestId("ai-validate").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Validated · deterministic local checks passed");
  await page.getByTestId("active-scenario").selectOption(alternate.id);
  await expect(ai.getByTestId("ai-preview")).toHaveCount(0);
  await expect(ai.getByTestId("ai-status")).toHaveText("Ready · document or Scenario context changed");
  await expectUnchanged(page);
});

for (const kind of ["Transaction", "Annotation", "Bookmark"] as const) {
  test(`Scenario-owned ${kind} Pin is repaired when its target is absent in B`, async ({ page }) => {
    page.on("pageerror", (error) => console.error("SCENARIO_PIN_PAGE_ERROR", error.stack));
    const fixture = canonicalFixture();
    fixture.transactions = [{ id: "tx_context_A" as TransactionId, name: "A Transfer", start: 1, end: 6, phases: [] }];
    fixture.annotations = [{ id: "annotation_context_A" as AnnotationId, type: "text", label: "A Note", visible: true, anchor: { cycle: 2, point: "cycle-start" } }];
    fixture.bookmarks = [{ id: "bookmark_context_A" as BookmarkId, name: "A Bookmark", start: 3 }];
    const pinModel = scenarioModelFromV2(fixture);
    const pinSource = pinModel.scenarios[0]!;
    const pinAlternate = { ...pinSource, id: "scenario_pin_B" as typeof pinSource.id, name: "B", transactions: [], annotations: [], bookmarks: [] };
    await openScenarios(page);
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "scenario-pins.tcd", mimeType: "application/json", buffer: Buffer.from(serializeScenarioDocumentModel({ ...pinModel, scenarios: [pinSource, pinAlternate] })) });
    await expect(page.getByTestId("active-scenario")).toHaveValue(pinSource.id);
    if (kind === "Transaction") {
      await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
      await page.getByTestId("transaction-left-tree-row-tx_context_A").click();
    } else if (kind === "Annotation") {
      await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
      await page.getByTestId("annotation-list").locator("[data-annotation-list-id='annotation_context_A']").click();
    } else {
      await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Bookmarks", exact: true }).click();
      await page.getByTestId("bookmark-row-bookmark_context_A").click();
    }
    await openBottomSettings(page);
    await page.getByTestId("bottom-pin").click();
    await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("bottom-settings").click();
    await page.getByTestId("active-scenario").selectOption(pinAlternate.id);
    await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
    await openBottomSettings(page);
    await expect(page.getByTestId("follow-selection")).toBeChecked();
  });
}
