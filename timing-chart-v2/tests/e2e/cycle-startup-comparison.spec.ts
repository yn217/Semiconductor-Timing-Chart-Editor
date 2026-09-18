import { expect, test } from "@playwright/test";

type CycleStartupSample = Readonly<{
  readyMs: number;
  firstCorrectPaintMs: number;
  mode: string;
  projectionCalls: number;
  fullReplaceCalls: number;
  viewportOnlyCalls: number;
  changeCalls: number;
  idle: boolean;
  phaseMarks: Readonly<Record<string, number>>;
}>;

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1]!;
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) test(`Cycle reload startup comparison exposes matching first-correct-paint metrics at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(viewport);
  await page.goto("/?visual-reference");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const modeRoot = page.locator(".cycle-panel");
  if (await modeRoot.getAttribute("data-view-mode") !== "Cycle") {
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  }
  await expect(modeRoot).toHaveAttribute("data-view-mode", "Cycle");

  const samples: CycleStartupSample[] = [];
  for (let trial = 0; trial < 3; trial += 1) {
    const navigationStartedAt = Date.now();
    await page.reload();
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await expect(modeRoot).toHaveAttribute("data-view-mode", "Cycle");
    const sample = await surface.evaluate((element, navigationStart) => {
      const phaseMarks = JSON.parse(element.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
      const counters = JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
      const firstCorrectPaint = phaseMarks["first-correct-paint"];
      return {
        readyMs: performance.timeOrigin + firstCorrectPaint - navigationStart,
        firstCorrectPaintMs: firstCorrectPaint - (phaseMarks["open-command-start"] ?? phaseMarks["open-start"] ?? firstCorrectPaint),
        mode: element.ownerDocument.querySelector<HTMLElement>(".cycle-panel")?.dataset.viewMode ?? "",
        projectionCalls: counters.projectionCalls ?? 0,
        fullReplaceCalls: counters.fullReplaceCalls ?? 0,
        viewportOnlyCalls: counters.viewportOnlyCalls ?? 0,
        changeCalls: counters.changeCalls ?? 0,
        idle: element.getAttribute("data-editor-idle") === "true",
        phaseMarks,
      };
    }, navigationStartedAt);
    expect(Number.isFinite(sample.readyMs) && sample.readyMs >= 0).toBe(true);
    expect(sample.firstCorrectPaintMs).toBeGreaterThanOrEqual(0);
    expect(sample.mode).toBe("Cycle");
    expect(sample.projectionCalls).toBeGreaterThan(0);
    samples.push(sample);
  }

  const requiredPhases = ["open-command-start", "canonical-replaced", "renderer-updated", "reference-clock-painted", "reference-geometry-ready", "first-visible-wave-painted", "ruler-painted", "row-shell-painted", "first-correct-paint"];
  expect(samples.every((sample) => sample.idle && requiredPhases.every((phase) => Number.isFinite(sample.phaseMarks[phase])))).toBe(true);
  const ready = samples.map((sample) => sample.readyMs);
  console.log(JSON.stringify({ mode: "Cycle", viewport, samples, medianReadyMs: percentile(ready, 0.5), p95ReadyMs: percentile(ready, 0.95) }));
});
