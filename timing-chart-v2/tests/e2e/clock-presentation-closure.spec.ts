import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Bottom Clock validates suppressed slots relative to delayed start", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='left-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("Clock start").fill("4");
  await editor.getByLabel("Clock period").fill("2");
  await editor.getByLabel("Clock suppressed periods").fill("0, 2");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("Bottom Clock edits update real waveform geometry and edge-counter overlays", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='left-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const initialHistory = await page.getByTestId("history-status").textContent();
  const initialHistoryCount = Number(initialHistory?.match(/History (\d+)/)?.[1]);
  expect(Number.isFinite(initialHistoryCount)).toBe(true);
  const clock = surface.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_clock']");
  const beforeWave = await clock.locator("svg").innerHTML();
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const mountedWaveOwnerCount = await surface.locator("[data-role='wave-owner']").count();
  const duty = editor.getByLabel("Clock duty");
  await duty.fill("0.3");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(editor.getByTestId("clock-generator-error")).toContainText("UNSUPPORTED_CLOCK_DUTY");
  await expect(page.getByTestId("history-status")).toHaveText(`History ${initialHistoryCount} / Redo 0`);
  // Restore a valid generator after the rejected draft; changing the period
  // exercises the production waveform/geometry refresh without relying on an
  // unsupported non-50% duty expansion in the browser renderer.
  await editor.getByLabel("Clock period").fill("4");
  await duty.fill("0.5");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await clock.locator("svg").innerHTML()).not.toBe(beforeWave);
  const afterDuty = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(afterDuty.waveDromRenders).toBe(before.waveDromRenders + mountedWaveOwnerCount);
  expect(afterDuty.localGeometryBuilds).toBe(before.localGeometryBuilds + mountedWaveOwnerCount);

  await editor.getByLabel("Clock edge counter show").check();
  await editor.getByLabel("Clock edge counter mode").selectOption("rising");
  await editor.getByTestId("apply-clock-edge-counter").click();
  await expect(surface.locator("[data-role='clock-edge-number'][data-edge-counter-id*=':rising:']")).toHaveCount(7);
  const beforeCounterOnly = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await editor.getByLabel("Clock edge counter mode").selectOption("falling");
  await editor.getByTestId("apply-clock-edge-counter").click();
  await expect(surface.locator("[data-role='clock-edge-number'][data-edge-counter-id*=':falling:']")).toHaveCount(7);
  const afterCounterOnly = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(afterCounterOnly.waveDromRenders).toBe(beforeCounterOnly.waveDromRenders);
  expect(afterCounterOnly.localGeometryBuilds).toBe(beforeCounterOnly.localGeometryBuilds);

  const historyBeforeSuppressed = await page.getByTestId("history-status").textContent();
  await editor.getByLabel("Clock suppressed periods").fill("99");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(editor.getByTestId("clock-generator-error")).toContainText("INVALID_SUPPRESSED_PERIODS");
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeSuppressed!);
  await editor.getByLabel("Clock suppressed periods").fill("1");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(clock).not.toHaveAttribute("data-wave-error");
  await expect(page.getByTestId("history-status")).toHaveText(`History ${initialHistoryCount + 4} / Redo 0`);
  expect(await clock.locator("svg").innerHTML()).not.toBe(beforeWave);
});
