import { expect, test } from "@playwright/test";

type StartupSample = Readonly<{ readyMs: number; canonicalRevision: number; projectionRevision: number; projectionDocumentEpoch: number; rendererDocumentEpoch: number; projectionCalls: number; projectionDurationMs: number; fullReplaceCalls: number; viewportOnlyCalls: number; changeCalls: number; idle: boolean; phaseMarks: Readonly<Record<string, number>>; phaseDurationsMs: Readonly<Record<string, number>> }>;

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1]!;
}

test("startup percentile reporting uses nearest-rank for small sample sets", () => {
  expect(percentile([1001, 737, 728], 0.5)).toBe(737);
  expect(percentile([1001, 737, 728], 0.95)).toBe(1001);
});

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) test(`Transaction reload startup exposes focused timing and projection metrics at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(viewport);
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const modeRoot = page.locator(".cycle-panel");
  if (await modeRoot.getAttribute("data-view-mode") !== "Transaction") {
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  }
  await expect(modeRoot).toHaveAttribute("data-view-mode", "Transaction");

  const samples: StartupSample[] = [];
  for (let trial = 0; trial < 3; trial += 1) {
    const navigationStartedAt = Date.now();
    await page.reload();
    const lanes = page.getByTestId("transaction-lanes");
    await expect(lanes).toBeVisible();
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Read_0");
    await expect(modeRoot).toHaveAttribute("data-view-mode", "Transaction");
    const sample = await surface.evaluate((surface, navigationStart) => {
      const counters = JSON.parse(surface.getAttribute("data-session-counters") ?? "{}") as { projectionCalls?: number; projectionDurationMs?: number; fullReplaceCalls?: number; viewportOnlyCalls?: number; changeCalls?: number; projectionDocumentEpoch?: number; documentEpoch?: number };
      const lane = surface.ownerDocument.querySelector<HTMLElement>("[data-testid='transaction-lanes']");
      const readyAt = Number(lane?.dataset.transactionFirstReadyAt ?? NaN);
      const projectionRoot = surface.querySelector<HTMLElement>("[data-revision]");
      const phaseMarks = JSON.parse(surface.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
      const publishedPhaseDurations = JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
      const phaseOrigin = phaseMarks["open-command-start"] ?? phaseMarks["open-start"] ?? 0;
      const phaseDurationsMs = Object.fromEntries(Object.entries(phaseMarks).map(([phase, timestamp]) => [phase, timestamp - phaseOrigin]));
      return { readyMs: readyAt - navigationStart, canonicalRevision: Number(surface.dataset.canonicalRevision), projectionRevision: Number(projectionRoot?.dataset.revision), projectionDocumentEpoch: Number(counters.projectionDocumentEpoch), rendererDocumentEpoch: Number(counters.documentEpoch), projectionCalls: counters.projectionCalls ?? 0, projectionDurationMs: counters.projectionDurationMs ?? 0, fullReplaceCalls: counters.fullReplaceCalls ?? 0, viewportOnlyCalls: counters.viewportOnlyCalls ?? 0, changeCalls: counters.changeCalls ?? 0, idle: surface.getAttribute("data-editor-idle") === "true", phaseMarks, phaseDurationsMs, publishedPhaseDurations };
    }, navigationStartedAt);
    expect(sample.readyMs).toBeGreaterThanOrEqual(0);
    expect(sample.projectionCalls).toBeGreaterThan(0);
    samples.push(sample);
  }
  const ready = samples.map((sample) => sample.readyMs);
  console.log(JSON.stringify({ samples, medianReadyMs: percentile(ready, 0.5), p95ReadyMs: percentile(ready, 0.95) }));
  expect(samples.every((sample) => sample.idle && sample.projectionCalls > 0)).toBe(true);
  expect(samples.every((sample) => sample.projectionCalls === 2 && sample.fullReplaceCalls === 1 && sample.viewportOnlyCalls === 1 && sample.changeCalls === 0)).toBe(true);
  expect(samples.every((sample) => sample.canonicalRevision === 0 && sample.projectionRevision === 0 && sample.projectionDocumentEpoch >= 1 && sample.rendererDocumentEpoch === sample.projectionDocumentEpoch)).toBe(true);
  const requiredPhases = ["open-command-start", "canonical-replaced", "renderer-updated", "reference-clock-painted", "reference-geometry-ready", "first-visible-wave-painted", "ruler-painted", "row-shell-painted", "first-correct-paint"];
  expect(samples.every((sample) => requiredPhases.every((phase) => Number.isFinite(sample.phaseMarks[phase])))).toBe(true);
  expect(samples.every((sample) => requiredPhases.every((phase, index) => index === 0 || sample.phaseMarks[requiredPhases[index - 1]!]! <= sample.phaseMarks[phase]!))).toBe(true);
  expect(samples.every((sample) => {
    const durations = requiredPhases.map((phase) => sample.phaseDurationsMs[phase]!);
    return durations.every((duration) => Number.isFinite(duration) && duration >= 0);
  })).toBe(true);
  expect(samples.every((sample) => requiredPhases.every((phase) => sample.publishedPhaseDurations[phase] === sample.phaseDurationsMs[phase]))).toBe(true);
});
