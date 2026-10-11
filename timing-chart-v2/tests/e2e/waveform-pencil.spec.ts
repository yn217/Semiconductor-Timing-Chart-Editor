import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { scenarioModelFromV2, serializeScenarioDocumentModel } from "@timing-chart-v2/schema";
import { startInCycleSample } from "./cycle-startup.js";
import { openBottomSettings } from "./bottom-settings.js";

startInCycleSample(test);

const signalId = "sig_cycle_reset_n";

async function openBinarySignal(page: Page, viewport = { width: 1280, height: 720 }) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  await surface.locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  await expect(page.getByTestId("signal-editor")).toBeVisible();
  await expect(page.getByTestId("waveform-pencil-ribbon")).toBeVisible();
  await expect(page.getByTestId("waveform-pencil-bottom")).toBeVisible();
  return surface;
}

async function cellPoint(page: Page, cycle: number, rowFraction: number, targetSignalId = signalId) {
  const ruler = page.getByTestId("cycle-ruler");
  // Use the rendered master-boundary screen positions. Combining unscaled
  // inline left values with a surface origin is invalid after zoom/scroll.
  const start = (await ruler.locator(`[data-source-cycle='${cycle}']`).boundingBox())!;
  const end = (await ruler.locator(`[data-source-cycle='${cycle + 1}']`).boundingBox())!;
  const owner = (await page.locator(`[data-role='wave-owner'][data-signal-id='${targetSignalId}']`).boundingBox())!;
  return { x: (start.x + end.x) / 2, y: owner.y + owner.height * rowFraction };
}

async function visibleCellCycle(page: Page, minimumCycle = 3) {
  const rulerViewport = (await page.getByTestId("cycle-ruler").boundingBox())!;
  const ticks = await page.getByTestId("cycle-ruler").locator("[data-source-cycle]").evaluateAll((elements) => elements.map((element) => ({ cycle: Number((element as HTMLElement).dataset.sourceCycle), x: element.getBoundingClientRect().left })).sort((a, b) => a.cycle - b.cycle));
  const pair = ticks.find((tick, index) => tick.cycle >= minimumCycle && ticks[index + 1]?.cycle === tick.cycle + 1 && (tick.x + ticks[index + 1]!.x) / 2 >= rulerViewport.x && (tick.x + ticks[index + 1]!.x) / 2 < rulerViewport.x + rulerViewport.width);
  if (!pair) throw new Error(`No visible adjacent cycle boundaries found at/after ${minimumCycle}`);
  return pair.cycle;
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test("draws a freehand Binary stroke as one semantic edit and round-trips through undo, redo, and Save/Open", async ({ page }) => {
  const surface = await openBinarySignal(page);
  const bottomTool = page.getByTestId("waveform-pencil-bottom");
  const ribbonTool = page.getByTestId("waveform-pencil-ribbon");
  await expect(bottomTool).toBeEnabled();
  await bottomTool.hover();
  await expect(page.getByRole("tooltip", { name: /Draw HIGH\/LOW directly on a Binary Signal/ })).toBeVisible();
  await bottomTool.focus();
  await expect(page.getByRole("tooltip", { name: /Draw HIGH\/LOW directly on a Binary Signal/ })).toBeVisible();
  await expect(ribbonTool).toHaveAttribute("title", /Binary Signal.*Clock, Bus, and Enum signals are not supported/);
  expect((await bottomTool.boundingBox())?.width).toBe(29);
  expect((await bottomTool.boundingBox())?.height).toBe(29);

  const baselineRevision = await surface.getAttribute("data-canonical-revision");
  const baselineHistory = await page.getByTestId("history-status").innerText();
  const baselineDirty = await page.getByTestId("dirty-status").innerText();
  await bottomTool.click();
  await expect(bottomTool).toHaveAttribute("aria-pressed", "true");
  await expect(ribbonTool).toHaveAttribute("aria-pressed", "true");

  // Cell 3 is already HIGH. Painting it is a semantic no-op and must not
  // create a history entry.
  await drag(page, await cellPoint(page, 3, 0.2), await cellPoint(page, 3, 0.2));
  await expect(page.getByTestId("history-status")).toHaveText(baselineHistory);
  await expect(surface).toHaveAttribute("data-canonical-revision", baselineRevision!);

  // The sample is low until cycle 2 and high afterward. A continuous drag
  // from HIGH in cycle 4 through LOW in cycle 6 creates boundaries at 5/7.
  const high = await cellPoint(page, 4, 0.2);
  const low = await cellPoint(page, 6, 0.8);
  await page.mouse.move(high.x, high.y);
  await page.mouse.down();
  await page.mouse.move((high.x + low.x) / 2, (high.y + low.y) / 2, { steps: 2 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText(baselineHistory);
  await expect(page.getByTestId("dirty-status")).toHaveText(baselineDirty);
  await expect(surface).toHaveAttribute("data-canonical-revision", baselineRevision!);
  await page.mouse.move(low.x, low.y, { steps: 3 });
  await page.mouse.up();

  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(surface).not.toHaveAttribute("data-canonical-revision", baselineRevision!);
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  const table = page.getByTestId("signal-editor");
  await expect(table.locator("[data-event-start='5']")).toBeVisible();
  await expect(table.locator("[data-event-start='7']")).toBeVisible();
  await expect(table.locator("[data-event-start='5']").getByLabel("Value 5")).toHaveValue("0");
  await expect(table.locator("[data-event-start='7']").getByLabel("Value 7")).toHaveValue("1");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(table.locator("[data-event-start='5']")).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo" }).click();
  await expect(table.locator("[data-event-start='5']")).toBeVisible();

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(await readFile(savedPath!, "utf8")) as { signals: Array<{ id: string; values: Array<{ id?: string; start: number; value: number }> }> };
  const savedSignal = saved.signals.find((candidate) => candidate.id === signalId)!;
  const stableValueIds = savedSignal.values.filter((value) => value.start === 5 || value.start === 7).map(({ start, id }) => ({ start, id }));
  expect(stableValueIds).toEqual([{ start: 5, id: expect.any(String) }, { start: 7, id: expect.any(String) }]);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.getByTestId("cycle-surface").locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='5']")).toBeVisible();
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='7']")).toBeVisible();
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='5']").getByLabel("Value 5")).toHaveValue("0");
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='7']").getByLabel("Value 7")).toHaveValue("1");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const roundTripSave = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const roundTripPath = await (await roundTripSave).path();
  const reopened = JSON.parse(await readFile(roundTripPath!, "utf8")) as typeof saved;
  const reopenedSignal = reopened.signals.find((candidate) => candidate.id === signalId)!;
  expect(reopenedSignal.values.filter((value) => value.start === 5 || value.start === 7).map(({ start, id }) => ({ start, id }))).toEqual(stableValueIds);
});

test("Escape cancels the active stroke without a semantic edit and disables the tool", async ({ page }) => {
  const surface = await openBinarySignal(page);
  const baselineRevision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();
  const bottomTool = page.getByTestId("waveform-pencil-bottom");
  await bottomTool.click();
  const from = await cellPoint(page, 4, 0.2);
  const to = await cellPoint(page, 6, 0.8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  await expect(bottomTool).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("waveform-pencil-ribbon")).toHaveAttribute("aria-pressed", "false");
  await page.mouse.up();
  await expect(surface).toHaveAttribute("data-canonical-revision", baselineRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='5']")).toHaveCount(0);
});

for (const destination of [{ label: "Transaction", mode: "Transaction" }, { label: "Combined", mode: "Split" }]) {
  test(`switching to ${destination.label} cancels an active stroke and removes the Cycle-only tool`, async ({ page }) => {
    const surface = await openBinarySignal(page);
    const baselineRevision = await surface.getAttribute("data-canonical-revision");
    const history = await page.getByTestId("history-status").innerText();
    await page.getByTestId("waveform-pencil-ribbon").click();
    const from = await cellPoint(page, 4, 0.2);
    const to = await cellPoint(page, 6, 0.8);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);

    const modeButton = page.locator(".view-mode").getByRole("button", { name: destination.label, exact: true });
    await modeButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", destination.mode);
    await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
    for (const toolId of ["waveform-pencil-ribbon", "waveform-pencil-bottom"]) {
      const tool = page.getByTestId(toolId);
      if (await tool.count()) {
        await expect(tool).toBeDisabled();
        await expect(tool).toHaveAttribute("aria-pressed", "false");
      }
    }
    await page.mouse.up();
    await expect(surface).toHaveAttribute("data-canonical-revision", baselineRevision!);
    await expect(page.getByTestId("history-status")).toHaveText(history);
  });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`paints a single HIGH cell from its upper half at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const surface = await openBinarySignal(page, viewport);
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption("200");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    const tool = page.getByTestId("waveform-pencil-ribbon");
    await tool.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("waveform-pencil-bottom")).toHaveAttribute("aria-pressed", "true");

    // Cycle 1 starts LOW in the sample. A one-cell upper-half stroke makes
    // only cycle 1 HIGH; the pre-existing cycle-2 HIGH transition coalesces.
    const point = await cellPoint(page, 1, 0.2);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.up();
    const table = page.getByTestId("signal-editor");
    await expect(table.locator("[data-event-start='1']").getByLabel("Value 1")).toHaveValue("1");
    await expect(table.locator("[data-event-start='2']")).toHaveCount(0);
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
  });
}

test("keeps source-cycle targeting correct after production zoom and horizontal scrollbar interaction", async ({ page }) => {
  await openBinarySignal(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("200");
  const scrollbar = page.getByTestId("timeline-hscroll");
  await expect(scrollbar).toBeVisible();
  const track = (await scrollbar.boundingBox())!;
  const { before, thumbWidth } = await scrollbar.evaluate((element: HTMLElement) => ({ before: element.scrollLeft, thumbWidth: element.clientWidth * element.clientWidth / element.scrollWidth }));
  await page.mouse.move(track.x + Math.max(12, thumbWidth / 2), track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width - Math.max(12, thumbWidth / 2), track.y + track.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
  await page.mouse.wheel(600, 0);
  await expect.poll(() => scrollbar.evaluate((element: HTMLElement) => element.scrollLeft)).toBeGreaterThan(before);

  const cycle = await visibleCellCycle(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("waveform-pencil-ribbon").click();
  const point = await cellPoint(page, cycle, 0.8);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  const table = page.getByTestId("signal-editor");
  await expect(table.locator(`[data-event-start='${cycle}']`).getByLabel(`Value ${cycle}`)).toHaveValue("0");
  await expect(table.locator(`[data-event-start='${cycle + 1}']`).getByLabel(`Value ${cycle + 1}`)).toHaveValue("1");
});

test("draws the waveform owner stable ID when Bottom Follow Selection is off and tree selection differs", async ({ page }) => {
  const surface = await openBinarySignal(page);
  const bottom = page.getByTestId("bottom-editor");
  await openBottomSettings(page);
  await bottom.getByTestId("follow-selection").uncheck();
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
  await bottom.getByTestId("bottom-settings").click();

  // Bottom remains targeted at RESET_N, while the live selection moves to REQUEST.
  await surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const table = page.getByTestId("signal-editor");
  await expect(table.locator("[data-event-start='2']")).toBeVisible();
  await expect(table.locator("[data-event-start='3']")).toHaveCount(0);
  await page.getByTestId("waveform-pencil-ribbon").click();

  const high = await cellPoint(page, 4, 0.2);
  const lowerSameCycle = await cellPoint(page, 4, 0.8);
  await page.mouse.move(high.x, high.y);
  await page.mouse.down();
  await page.mouse.move(lowerSameCycle.x, lowerSameCycle.y, { steps: 2 });
  await page.mouse.up();

  // The tree's REQUEST selection is not a target authority; the stable ID on
  // the waveform row is. The retained Bottom target updates, not REQUEST.
  await expect(table.locator("[data-event-start='4']").getByLabel("Value 4")).toHaveValue("0");
  await expect(table.locator("[data-event-start='5']").getByLabel("Value 5")).toHaveValue("1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  const saved = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const path = await (await saved).path();
  const document = JSON.parse(await readFile(path!, "utf8")) as { signals: Array<{ id: string; values: Array<{ start: number; value: number }> }> };
  expect(document.signals.find((signal) => signal.id === signalId)?.values.map(({ start, value }) => [start, value])).toEqual([[0, 0], [2, 1], [4, 0], [5, 1]]);
  expect(document.signals.find((signal) => signal.id === "sig_cycle_request")?.values.map(({ start, value }) => [start, value])).toEqual([[0, 0], [3, 1], [7, 0]]);
});

test("pointer cancellation discards the stroke without changing canonical values or history", async ({ page }) => {
  const surface = await openBinarySignal(page);
  const baselineRevision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();
  await page.getByTestId("waveform-pencil-ribbon").click();
  const from = await cellPoint(page, 4, 0.2);
  const to = await cellPoint(page, 6, 0.8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);
  await page.locator(`[data-role='wave-owner'][data-signal-id='${signalId}']`).dispatchEvent("pointercancel", { pointerId: 1 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  await page.mouse.up();
  await expect(surface).toHaveAttribute("data-canonical-revision", baselineRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='5']")).toHaveCount(0);
});

test("Pencil only captures primary-button input and leaves other pointer buttons to existing tools", async ({ page }) => {
  const surface = await openBinarySignal(page);
  const revision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();
  await page.getByTestId("waveform-pencil-ribbon").click();
  const point = await cellPoint(page, 4, 0.2);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.mouse.click(point.x, point.y, { button: "middle" });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("waveform-pencil-ribbon")).toHaveAttribute("aria-pressed", "true");
});

test("existing Annotation selection and Cursor controls remain usable while Pencil is enabled", async ({ page }) => {
  const surface = await openBinarySignal(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  const annotation = surface.locator("[data-role='annotation-owner']").first();
  await expect(annotation).toBeVisible();
  const annotationId = await annotation.getAttribute("data-annotation-id");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const history = await page.getByTestId("history-status").innerText();
  const revision = await surface.getAttribute("data-canonical-revision");
  await page.getByTestId("waveform-pencil-ribbon").click();

  await annotation.locator("[data-role='annotation-label']").click({ force: true });
  await expect(page.getByTestId("annotation-editor")).toBeVisible();
  await expect(page.getByTestId("annotation-editor")).toHaveAttribute("data-annotation-id", annotationId!);
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("cursor-set-a").click();
  await expect(page.getByTestId("cursor-status")).toContainText("A 2");
  await expect(page.locator("[data-role='cursor-line'][data-cursor='a']").first()).toHaveAttribute("data-cycle", "2");
  await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
});

test("document replacement cancels an in-flight stroke before it can commit", async ({ page }) => {
  const surface = await openBinarySignal(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await surface.locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  await page.getByTestId("waveform-pencil-ribbon").click();
  const from = await cellPoint(page, 4, 0.2);
  const to = await cellPoint(page, 6, 0.8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await page.getByTestId("cycle-surface").locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  await expect(page.getByTestId("signal-editor").locator("[data-event-start='5']")).toHaveCount(0);
});

test("Scenario switch cancels an in-flight stroke as view-only state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const model = scenarioModelFromV2(generatePerformanceDocument({ signalCount: 4, cycleCount: 24, profile: "standard" }));
  const base = model.scenarios[0]!;
  const target = model.signalDefinitions.find((signal) => signal.type === "binary")!;
  const alternate = {
    ...base,
    id: "scenario_pencil_alt" as typeof base.id,
    name: "Pencil Alternate",
    signalStates: { ...base.signalStates, [target.id]: { kind: "values" as const, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] } },
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "waveform-pencil-scenario.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(serializeScenarioDocumentModel({ ...model, scenarios: [base, alternate] })),
  });
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await surface.locator(`[data-role='frozen-row'][data-row-id='${target.id}']`).click();
  await page.getByTestId("waveform-pencil-ribbon").click();
  const from = await cellPoint(page, 4, 0.2, target.id);
  const to = await cellPoint(page, 6, 0.8, target.id);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);

  const revision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();
  const dirty = await page.getByTestId("dirty-status").innerText();
  await page.getByTestId("active-scenario").selectOption(alternate.id);
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  await page.mouse.up();
  await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
});

test("large full-span waveform stroke updates only its preview, not mounted WaveDrom owners", async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as typeof window & { __wavePencilLongTasks?: Array<{ startTime: number; duration: number; attribution: string[] }>; __wavePencilMarks?: Array<{ name: string; time: number }> };
    target.__wavePencilLongTasks = [];
    target.__wavePencilMarks = [];
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const task = entry as PerformanceEntry & { attribution?: Array<{ name?: string; containerType?: string; containerName?: string }> };
          target.__wavePencilLongTasks?.push({ startTime: entry.startTime, duration: entry.duration, attribution: task.attribution?.map((item) => `${item.name ?? ""}:${item.containerType ?? ""}:${item.containerName ?? ""}`) ?? [] });
        }
      }).observe({ type: "longtask", buffered: true });
    }
  });
  await page.setViewportSize({ width: 1672, height: 3700 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const fixturePath = path.resolve("samples/performance/perf_100x500_full_span.tcd.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as { timeline: { cycleCount: number }; signals: unknown[] };
  expect(fixture.signals).toHaveLength(100);
  expect(fixture.timeline.cycleCount).toBe(500);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(fixturePath);
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60000 });
  const owners = page.locator("[data-role='wave-owner'][data-signal-id]");
  await expect(owners).toHaveCount(100);

  const signalId = "sig_perf_1";
  await surface.locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  await page.getByTestId("waveform-pencil-ribbon").click();
  const baselineHistory = await page.getByTestId("history-status").innerText();
  const baselineDirty = await page.getByTestId("dirty-status").innerText();
  const baselineRevision = await surface.getAttribute("data-canonical-revision");
  const from = await cellPoint(page, 4, 0.2, signalId);
  const middle = await cellPoint(page, 6, 0.8, signalId);
  const to = await cellPoint(page, 8, 0.2, signalId);
  const mountedSvgCount = await owners.locator(":scope > svg").count();
  expect(mountedSvgCount).toBe(100);
  const gestureStarted = await page.evaluate(() => {
    const target = window as typeof window & { __wavePencilDomSnapshot?: { waveSvgs: Element[]; rows: Element[] } };
    target.__wavePencilDomSnapshot = { waveSvgs: [...document.querySelectorAll("[data-role='wave-owner'] > svg")], rows: [...document.querySelectorAll("[data-role='frozen-row']")] };
    performance.mark("pencil:gesture-start");
    return performance.now();
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(1);
  await page.mouse.move(middle.x, middle.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 2 });
  const during = await page.evaluate(() => {
    const target = window as typeof window & { __wavePencilDomSnapshot?: { waveSvgs: Element[]; rows: Element[] } };
    const host = document.querySelector<HTMLElement>("[data-testid='cycle-surface']");
    return {
      previewCount: document.querySelectorAll("[data-role='waveform-pencil-preview']").length,
      history: document.querySelector<HTMLElement>("[data-testid='history-status']")?.innerText,
      dirty: document.querySelector<HTMLElement>("[data-testid='dirty-status']")?.innerText,
      revision: host?.dataset.canonicalRevision,
      waveSvgsConnected: target.__wavePencilDomSnapshot?.waveSvgs.filter((element) => element.isConnected).length,
      rowsConnected: target.__wavePencilDomSnapshot?.rows.filter((element) => element.isConnected).length,
      rowCount: target.__wavePencilDomSnapshot?.rows.length,
    };
  });
  expect(during).toMatchObject({ previewCount: 1, history: baselineHistory, dirty: baselineDirty, revision: baselineRevision, waveSvgsConnected: 100 });
  expect(during.rowCount).toBeGreaterThan(0);
  expect(during.rowsConnected).toBe(during.rowCount);
  const beforeUp = await page.evaluate(() => performance.now());
  await page.mouse.up();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.locator("[data-role='waveform-pencil-preview']")).toHaveCount(0);
  await page.waitForTimeout(100);
  const longTasks = await page.evaluate((started) => ((window as typeof window & { __wavePencilLongTasks?: Array<{ startTime: number; duration: number; attribution: string[] }> }).__wavePencilLongTasks ?? []).filter((task) => task.startTime >= started), gestureStarted);
  if (longTasks.some((task) => task.duration >= 50 && task.startTime < beforeUp)) console.log("pencil-large-longtasks-during-stroke", longTasks);
  expect(longTasks.filter((task) => task.duration >= 50 && task.startTime < beforeUp)).toEqual([]);
});
