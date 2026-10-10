import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { scenarioModelFromV2, serializeScenarioDocumentModel } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { canonicalFixture } from "../fixtures/canonical.js";
import { documentState, expectViewOnly } from "./view-only.js";
import { startInCycleMode } from "./cycle-startup.js";
import { readWave } from "./wave-probe.js";

startInCycleMode(test);

test("Enable Scenarios migrates the current v2 document as one dirty Scenario", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByTestId("scenario-enable").click();
  await expect(page.getByTestId("active-scenario").locator("option")).toHaveCount(1);
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const saved = JSON.parse((await readFile((await (await download).path())!).then((bytes) => bytes.toString("utf8")))) as { formatVersion: number; scenarios: unknown[] };
  expect(saved.formatVersion).toBe(3);
  expect(saved.scenarios).toHaveLength(1);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("Scenario v3 switches as view state and management survives Undo/Redo and Save/Open", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const model = scenarioModelFromV2(generatePerformanceDocument({ signalCount: 4, cycleCount: 24, profile: "standard" }));
  const base = model.scenarios[0]!;
  const valueSignalId = model.signalDefinitions.find((signal) => signal.type !== "clock")!.id;
  const alternate = { ...base, id: "scenario_alt" as typeof base.id, name: "Alternate", signalStates: { ...base.signalStates, [valueSignalId]: { kind: "values" as const, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] } } };
  const input = page.locator("input[type='file'][accept='.json,.tcd']");
  await input.setInputFiles({ name: "scenario-431.tcd", mimeType: "application/json", buffer: Buffer.from(serializeScenarioDocumentModel({ ...model, scenarios: [base, alternate] })) });
  await expect(page.getByTestId("active-scenario")).toHaveValue(base.id);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  const beforeSwitch = await documentState(page);
  const beforeWave = await readWave(page, valueSignalId);
  await page.getByTestId("active-scenario").selectOption(alternate.id);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await expectViewOnly(page, beforeSwitch, "Scenario selection is workspace state");
  await expect.poll(async () => {
    const wave = await readWave(page, valueSignalId);
    return wave.present && wave.uses.some((use) => use.href === "#0m1" && Math.abs(use.x - (wave.boundaries[4] ?? Number.NaN)) < 0.1)
      && JSON.stringify(wave.uses.map((use) => use.href)) !== JSON.stringify(beforeWave.uses.map((use) => use.href));
  }).toBe(true);
  await page.getByTestId("scenario-compare-toggle").click();
  await expect(page.getByTestId("scenario-comparison")).toBeVisible();
  await expect(page.locator(`[data-scenario-difference-signal-id='${valueSignalId}']`)).toBeVisible();
  const differenceOverlay = page.locator(`[data-role='scenario-difference-overlay'][data-signal-id='${valueSignalId}']`).first();
  await expect(differenceOverlay).toBeVisible();
  await expect(differenceOverlay).not.toHaveAttribute("data-annotation-id", /.*/);
  expect(Number.parseFloat(await differenceOverlay.evaluate((element) => getComputedStyle(element).width))).toBeGreaterThan(0);
  const overlayStart = await differenceOverlay.getAttribute("data-source-start");
  const overlayEnd = await differenceOverlay.getAttribute("data-source-end");
  expect(Number(overlayEnd)).toBeGreaterThan(Number(overlayStart));
  await page.getByRole("button", { name: "Combined", exact: true }).click();
  await expect(differenceOverlay).toBeVisible();
  const combinedOverlayBox = await differenceOverlay.boundingBox();
  const combinedBoundaryBox = await page.locator(`.cycle-tick[data-source-cycle="${overlayStart}"]`).boundingBox();
  expect(combinedOverlayBox).not.toBeNull();
  expect(combinedBoundaryBox).not.toBeNull();
  expect(Math.abs(combinedOverlayBox!.x - combinedBoundaryBox!.x)).toBeLessThanOrEqual(0.5);
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(differenceOverlay).toBeVisible();
  await page.getByTestId("scenario-compare-toggle").click();
  await expect(page.locator("[data-role='scenario-difference-overlay']")).toHaveCount(0);
  await page.getByTestId("scenario-compare-toggle").click();
  await expect(differenceOverlay).toBeVisible();
  const revealDifference = page.locator(`[data-testid^='scenario-difference-reveal-${valueSignalId}-']`).first();
  await expect(revealDifference).toBeVisible();
  const differenceText = await page.locator(`[data-scenario-difference-signal-id='${valueSignalId}'] > span`).first().innerText();
  const displayedRange = differenceText.match(/cycles\s+(\d+)–(\d+)/);
  expect(displayedRange).not.toBeNull();
  await revealDifference.click();
  await expect(page.locator(`[data-role='frozen-row'][data-row-id='${valueSignalId}']`)).toHaveAttribute("data-selected", "true");
  const revealedRange = page.getByTestId("range-selection-band");
  await expect(revealedRange).toBeVisible();
  await expect(revealedRange).toHaveAttribute("data-range-start", displayedRange![1]!);
  await expect(revealedRange).toHaveAttribute("data-range-end", String(Number(displayedRange![2]!) + 1));
  await expectViewOnly(page, beforeSwitch, "Scenario comparison is derived view state");

  await page.getByTestId("scenario-name").fill("Stress");
  await page.getByTestId("scenario-rename").click();
  await expect(page.getByTestId("active-scenario")).toHaveValue(alternate.id);
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("active-scenario")).toHaveValue(alternate.id);
  await expect(page.getByTestId("scenario-name")).toHaveValue("Alternate");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("scenario-name")).toHaveValue("Stress");

  await page.getByTestId("scenario-duplicate").click();
  const duplicateId = await page.getByTestId("active-scenario").inputValue();
  expect(duplicateId).not.toBe(alternate.id);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const savedBytes = await readFile((await (await download).path())!);
  const saved = JSON.parse(savedBytes.toString("utf8")) as { formatVersion: number; scenarios: { id: string; name: string }[] };
  expect(saved.formatVersion).toBe(3);
  expect(saved.scenarios.map((scenario) => scenario.id)).toContain(base.id);
  expect(saved.scenarios.map((scenario) => scenario.id)).toContain(alternate.id);
  expect(saved.scenarios.map((scenario) => scenario.id)).toContain(duplicateId);
  expect(saved.scenarios.find((scenario) => scenario.id === alternate.id)?.name).toBe("Stress");

  await page.getByTestId("scenario-delete").click();
  await expect(page.getByTestId("active-scenario").locator("option")).toHaveCount(2);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("active-scenario").locator("option")).toHaveCount(3);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).first().click();
  await page.getByTestId("cycle-surface").waitFor({ state: "visible" });
  await input.setInputFiles({ name: "saved-scenario-431.tcd", mimeType: "application/json", buffer: savedBytes });
  await expect(page.getByTestId("active-scenario")).toHaveValue(base.id);
  await expect(page.getByTestId("active-scenario").locator("option")).toHaveCount(3);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("Scenario Duplicate remaps Transaction Phase IDs and Undo/Redo and Save/Open preserve them", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const v2 = {
    ...canonicalFixture(),
    transactions: [
      { id: "tx_address" as never, name: "Address", start: 0, end: 4, phases: [
        { id: "phase_address_setup" as never, name: "Setup", start: 0, end: 2 },
        { id: "phase_address_hold" as never, name: "Hold", start: 2, end: 4 },
      ] },
      { id: "tx_response" as never, name: "Response", start: 4, end: 8, phases: [
        { id: "phase_response_valid" as never, name: "Valid", start: 4, end: 8 },
      ] },
    ],
  };
  const model = scenarioModelFromV2(v2);
  const sourceScenario = model.scenarios[0]!;
  const sourcePhaseIds = sourceScenario.transactions.flatMap((transaction) => transaction.phases!.map((phase) => phase.id));
  const input = page.locator("input[type='file'][accept='.json,.tcd']");
  await input.setInputFiles({ name: "scenario-phase-identity.tcd", mimeType: "application/json", buffer: Buffer.from(serializeScenarioDocumentModel(model)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  const ribbon = page.getByTestId("ribbon");
  const save = async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    const download = page.waitForEvent("download");
    await ribbon.getByRole("button", { name: "Save", exact: true }).first().click();
    const path = await (await download).path();
    expect(path).toBeTruthy();
    const bytes = await readFile(path!);
    const parsed = JSON.parse(bytes.toString("utf8")) as { scenarios: Array<{ id: string; transactions: Array<{ phases?: Array<{ id: string; name: string; start: number; end: number }> }> }> };
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    return { bytes, parsed };
  };
  const before = await save();
  await page.getByTestId("scenario-duplicate").click();
  const duplicateId = await page.getByTestId("active-scenario").inputValue();
  expect(duplicateId).not.toBe(sourceScenario.id);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const afterDuplicate = await save();
  const original = afterDuplicate.parsed.scenarios.find((scenario) => scenario.id === sourceScenario.id)!;
  const duplicate = afterDuplicate.parsed.scenarios.find((scenario) => scenario.id === duplicateId)!;
  const duplicatePhaseIds = duplicate.transactions.flatMap((transaction) => transaction.phases?.map((phase) => phase.id) ?? []);
  expect(original.transactions.flatMap((transaction) => transaction.phases?.map((phase) => phase.id) ?? [])).toEqual(sourcePhaseIds);
  expect(duplicatePhaseIds).toHaveLength(sourcePhaseIds.length);
  expect(duplicatePhaseIds.some((id) => sourcePhaseIds.includes(id))).toBe(false);
  expect(new Set([...sourcePhaseIds, ...duplicatePhaseIds]).size).toBe(sourcePhaseIds.length + duplicatePhaseIds.length);
  expect(duplicate.transactions.map((transaction) => transaction.phases?.map(({ id: _id, ...phase }) => phase)))
    .toEqual(original.transactions.map((transaction) => transaction.phases?.map(({ id: _id, ...phase }) => phase)));

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  expect((await save()).parsed).toEqual(before.parsed);
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect((await save()).parsed).toEqual(afterDuplicate.parsed);

  await input.setInputFiles({ name: "scenario-phase-identity-saved.tcd", mimeType: "application/json", buffer: afterDuplicate.bytes });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("active-scenario").locator("option")).toHaveCount(2);
  expect((await save()).parsed).toEqual(afterDuplicate.parsed);

  await page.getByTestId("active-scenario").selectOption(duplicateId);
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const duplicatedPhase = page.locator(`.transaction-phase-hit-target[data-phase-id="${duplicatePhaseIds[0]}"]`);
  await duplicatedPhase.click();
  await expect(duplicatedPhase).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("active-scenario").selectOption(sourceScenario.id);
  await expect(page.locator('.transaction-phase-hit-target[aria-pressed="true"]')).toHaveCount(0);
  await page.getByTestId("active-scenario").selectOption(duplicateId);
  await expect(page.locator('.transaction-phase-hit-target[aria-pressed="true"]')).toHaveCount(0);
});

test("Scenario Compare ignores remapped Clock enable and marker IDs after production duplication", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const source = canonicalFixture();
  const sourceClock = source.signals.find((signal) => signal.type === "clock");
  if (sourceClock?.type !== "clock") throw new Error("Canonical fixture must contain a Clock Signal.");
  const markerId = "bookmark_compare_clock_origin" as never;
  const clock = {
    ...sourceClock,
    enable: [
      { id: "compare_enable_on", start: 1, value: 1 },
      { id: "compare_enable_off", start: 5, value: 0 },
    ],
    edgeCounter: { ...sourceClock.edgeCounter, show: true, countFrom: "marker" as const, anchorId: markerId },
  };
  const model = scenarioModelFromV2({
    ...source,
    bookmarks: [{ id: markerId, name: "Clock origin", start: 3 }],
    signals: source.signals.map((signal) => signal.id === sourceClock.id ? clock : signal),
  });

  await page.goto("/");
  const input = page.locator("input[type='file'][accept='.json,.tcd']");
  await input.setInputFiles({ name: "scenario-clock-compare.tcd", mimeType: "application/json", buffer: Buffer.from(serializeScenarioDocumentModel(model)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  const sourceScenarioId = await page.getByTestId("active-scenario").inputValue();
  await page.getByTestId("scenario-duplicate").click();
  const duplicateScenarioId = await page.getByTestId("active-scenario").inputValue();
  expect(duplicateScenarioId).not.toBe(sourceScenarioId);

  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const savedPath = await (await download).path();
  if (!savedPath) throw new Error("Scenario duplicate did not save a document.");
  const saved = JSON.parse(await readFile(savedPath, "utf8")) as { scenarios: Array<{ id: string; signalStates: Record<string, { kind: string; enable?: Array<{ id?: string }>; edgeCounter?: { anchorId?: string } }>; bookmarks: Array<{ id: string }> }> };
  const original = saved.scenarios.find((scenario) => scenario.id === sourceScenarioId)!;
  const duplicate = saved.scenarios.find((scenario) => scenario.id === duplicateScenarioId)!;
  const originalClockState = original.signalStates[sourceClock.id]!;
  const duplicateClockState = duplicate.signalStates[sourceClock.id]!;
  expect(duplicateClockState.enable?.map(({ id }) => id)).not.toEqual(originalClockState.enable?.map(({ id }) => id));
  expect(duplicateClockState.edgeCounter?.anchorId).not.toBe(originalClockState.edgeCounter?.anchorId);
  expect(duplicate.bookmarks.find(({ id }) => id === duplicateClockState.edgeCounter?.anchorId)).toBeTruthy();

  await page.getByTestId("scenario-compare-toggle").click();
  await expect(page.getByTestId("scenario-no-differences")).toBeVisible();
  await expect(page.locator("[data-scenario-difference-signal-id]")).toHaveCount(0);
});

test("duplicated Clock compares equal after fresh enable and marker IDs through Undo/Redo and Save/Open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const sourceDocument = canonicalFixture();
  const sourceClock = sourceDocument.signals.find((signal) => signal.type === "clock");
  if (sourceClock?.type !== "clock") throw new Error("Fixture must contain a Clock Signal.");
  const markerId = "bookmark_clock_origin" as never;
  const clock = {
    ...sourceClock,
    enable: [
      { id: "clock_enable_on", start: 1, value: 1 },
      { id: "clock_enable_off", start: 5, value: 0 },
    ],
    edgeCounter: { ...sourceClock.edgeCounter, show: true, countFrom: "marker" as const, anchorId: markerId },
  };
  const sourceModel = scenarioModelFromV2({
    ...sourceDocument,
    bookmarks: [{ id: markerId, name: "Clock origin", start: 3 }],
    signals: sourceDocument.signals.map((signal) => signal.id === clock.id ? clock : signal),
  });
  const originalScenarioId = sourceModel.scenarios[0]!.id;
  const input = page.locator("input[type='file'][accept='.json,.tcd']");
  await input.setInputFiles({ name: "scenario-clock-identity.tcd", mimeType: "application/json", buffer: Buffer.from(serializeScenarioDocumentModel(sourceModel)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.getByTestId("scenario-duplicate").click();
  const duplicateScenarioId = await page.getByTestId("active-scenario").inputValue();
  expect(duplicateScenarioId).not.toBe(originalScenarioId);

  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("active-scenario").locator("option")).toHaveCount(1);
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("active-scenario").locator("option")).toHaveCount(2);
  await expect(page.getByTestId("active-scenario")).toHaveValue(duplicateScenarioId);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await ribbon.getByRole("button", { name: "Save", exact: true }).first().click();
  const savedBytes = await readFile((await (await downloadPromise).path())!);
  const saved = JSON.parse(savedBytes.toString("utf8")) as {
    scenarios: Array<{
      id: string;
      bookmarks: Array<{ id: string; start: number }>;
      signalStates: Record<string, { kind: string; enable?: Array<{ id?: string; start: number; value: number }>; edgeCounter?: { anchorId?: string } }>;
    }>;
  };
  const originalSaved = saved.scenarios.find((scenario) => scenario.id === originalScenarioId)!;
  const duplicateSaved = saved.scenarios.find((scenario) => scenario.id === duplicateScenarioId)!;
  const originalState = originalSaved.signalStates[clock.id]!;
  const duplicateState = duplicateSaved.signalStates[clock.id]!;
  expect(duplicateState.enable?.map((change) => change.id)).not.toEqual(originalState.enable?.map((change) => change.id));
  expect(duplicateState.edgeCounter?.anchorId).not.toBe(originalState.edgeCounter?.anchorId);
  expect(duplicateState.edgeCounter?.anchorId).toBe(duplicateSaved.bookmarks[0]?.id);

  await input.setInputFiles({ name: "scenario-clock-identity-saved.tcd", mimeType: "application/json", buffer: savedBytes });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.getByTestId("active-scenario").selectOption(duplicateScenarioId);
  await page.getByTestId("scenario-compare-toggle").click();
  await page.getByTestId("scenario-compare-target").selectOption(originalScenarioId);
  await expect(page.getByTestId("scenario-no-differences")).toHaveText("No waveform differences");
  await expect(page.locator("[data-role='scenario-difference-overlay']")).toHaveCount(0);
});
