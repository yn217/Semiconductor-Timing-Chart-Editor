import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { scenarioModelFromV2, serializeScenarioDocumentModel } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
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
