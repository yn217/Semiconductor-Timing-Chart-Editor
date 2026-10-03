import { expect, test } from "@playwright/test";

type StartupSample = Readonly<{ readyMs: number; canonicalRevision: number; projectionRevision: number; projectionDocumentEpoch: number; rendererDocumentEpoch: number; projectionCalls: number; projectionDurationMs: number; fullReplaceCalls: number; viewportOnlyCalls: number; changeCalls: number; idle: boolean; phaseMarks: Readonly<Record<string, number>>; phaseDurationsMs: Readonly<Record<string, number>> }>;

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]!;
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) test(`Transaction reload startup exposes focused timing and projection metrics at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(viewport);
  const samples: StartupSample[] = [];
  for (let trial = 0; trial < 3; trial += 1) {
    const navigationStartedAt = Date.now();
    if (trial === 0) await page.goto("/"); else await page.reload();
    const lanes = page.getByTestId("transaction-lanes");
    await expect(lanes).toBeVisible();
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Read_0");
    const sample = await page.getByTestId("cycle-surface").evaluate((surface, navigationStart) => {
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
  expect(samples.every((sample) => sample.canonicalRevision === 0 && sample.projectionRevision === 0 && sample.projectionDocumentEpoch >= 1 && sample.rendererDocumentEpoch === sample.projectionDocumentEpoch)).toBe(true);
  // Current Open phase vocabulary (the old reference-clock-painted / first-visible-wave-painted marks were replaced by presentation-ready / visible-waveforms-ready).
  const requiredPhases = ["open-command-start", "canonical-replaced", "renderer-updated", "reference-geometry-ready", "ruler-painted", "row-shell-painted", "first-correct-paint", "presentation-ready", "visible-waveforms-ready"];
  expect(samples.every((sample) => requiredPhases.every((phase) => Number.isFinite(sample.phaseMarks[phase])))).toBe(true);
  expect(samples.every((sample) => requiredPhases.every((phase, index) => index === 0 || sample.phaseMarks[requiredPhases[index - 1]!]! <= sample.phaseMarks[phase]!))).toBe(true);
  expect(samples.every((sample) => {
    const durations = requiredPhases.map((phase) => sample.phaseDurationsMs[phase]!);
    return durations.every((duration) => Number.isFinite(duration) && duration >= 0);
  })).toBe(true);
  expect(samples.every((sample) => requiredPhases.every((phase) => sample.publishedPhaseDurations[phase] === sample.phaseDurationsMs[phase]))).toBe(true);
});
