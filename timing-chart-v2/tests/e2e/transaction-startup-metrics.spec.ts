import { expect, test } from "@playwright/test";

type StartupSample = Readonly<{ readyMs: number; projectionCalls: number; projectionDurationMs: number; fullReplaceCalls: number; viewportOnlyCalls: number; changeCalls: number; idle: boolean; phaseMarks: Readonly<Record<string, number>> }>;

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
      const counters = JSON.parse(surface.getAttribute("data-session-counters") ?? "{}") as { projectionCalls?: number; projectionDurationMs?: number; fullReplaceCalls?: number; viewportOnlyCalls?: number; changeCalls?: number };
      const lane = surface.ownerDocument.querySelector<HTMLElement>("[data-testid='transaction-lanes']");
      const readyAt = Number(lane?.dataset.transactionFirstReadyAt ?? NaN);
      const phaseMarks = JSON.parse(surface.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
      return { readyMs: readyAt - navigationStart, projectionCalls: counters.projectionCalls ?? 0, projectionDurationMs: counters.projectionDurationMs ?? 0, fullReplaceCalls: counters.fullReplaceCalls ?? 0, viewportOnlyCalls: counters.viewportOnlyCalls ?? 0, changeCalls: counters.changeCalls ?? 0, idle: surface.getAttribute("data-editor-idle") === "true", phaseMarks };
    }, navigationStartedAt);
    expect(sample.readyMs).toBeGreaterThanOrEqual(0);
    expect(sample.projectionCalls).toBeGreaterThan(0);
    samples.push(sample);
  }
  const ready = samples.map((sample) => sample.readyMs);
  console.log(JSON.stringify({ samples, medianReadyMs: percentile(ready, 0.5), p95ReadyMs: percentile(ready, 0.95) }));
  expect(samples.every((sample) => sample.idle && sample.projectionCalls > 0)).toBe(true);
  const requiredPhases = ["open-command-start", "canonical-replaced", "renderer-updated", "row-shell-painted", "ruler-painted", "reference-geometry-ready", "first-correct-paint"];
  expect(samples.every((sample) => requiredPhases.every((phase) => Number.isFinite(sample.phaseMarks[phase])))).toBe(true);
});
