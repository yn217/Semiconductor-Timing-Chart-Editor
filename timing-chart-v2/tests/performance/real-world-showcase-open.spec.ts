import { expect, test, type CDPSession } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startInCycleSample } from "../e2e/cycle-startup.js";

startInCycleSample(test);

const showcaseFixtures = [
  { id: 21, file: "21_large_feature_showcase.tcd.json", cycles: 128 },
  { id: 24, file: "24_protocol_transaction_showcase.tcd.json", cycles: 192 },
] as const;

for (const fixture of showcaseFixtures) test(`real-world #${fixture.id} showcase reaches visible-waveform readiness within the 1s budget`, async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = await browserMetrics(cdp);
  const file = readFileSync(resolve(process.cwd(), `samples/showcase/${fixture.file}`));
  const document = JSON.parse(file.toString("utf8")) as { document?: { title?: string }; timeline?: { cycleCount?: number } };
  const openStartedAt = await page.evaluate(() => performance.now());
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: fixture.file,
    mimeType: "application/json",
    buffer: file,
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 45_000 });
  await expect.poll(() => host.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.filter((owner) => (owner as HTMLElement).dataset.waveState === "ready").length), { timeout: 45_000 }).toBeGreaterThan(0);
  if (document.document?.title) await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title);
  const after = await browserMetrics(cdp);
  const evidence = await host.evaluate((surface, start) => {
    const durations = JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
    const counters = JSON.parse(surface.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
    const waveBatch = JSON.parse(surface.getAttribute("data-open-wave-batch-metrics") ?? "{}") as Record<string, number>;
    const owners = Array.from(surface.querySelectorAll<HTMLElement>("[data-role='wave-owner']"), (owner) => ({
      signalId: owner.dataset.signalId ?? owner.dataset.waveOwner,
      start: owner.dataset.renderedSourceWindowStart,
      end: owner.dataset.renderedSourceWindowEnd,
      state: owner.dataset.waveState,
      imageBacked: owner.querySelector("image[data-wave-svg-image]") !== null,
    }));
    return {
      elapsedMs: performance.now() - start,
      durations,
      mountedWaveOwners: counters.mountedWaveOwners,
      waveBatch,
      owners,
    };
  }, openStartedAt);
  const browserDelta = Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "PaintDuration"].map((name) => [name, ((after[name] ?? 0) - (before[name] ?? 0)) * 1_000]));

  expect(evidence.owners.length).toBeGreaterThan(0);
  expect(document.timeline?.cycleCount).toBe(fixture.cycles);
  expect(evidence.owners.every((owner) => Number.isFinite(Number(owner.start)) && Number.isFinite(Number(owner.end)) && Number(owner.start) >= 0 && Number(owner.end) <= fixture.cycles && Number(owner.end) > Number(owner.start))).toBe(true);
  if (fixture.id === 24) expect(evidence.owners.every((owner) => owner.start === "0" && owner.end === String(fixture.cycles))).toBe(true);
  expect(evidence.waveBatch.renderCount).toBeGreaterThan(0);
  expect(evidence.durations["visible-waveforms-ready"]).toBeGreaterThan(0);
  expect(evidence.durations["visible-waveforms-ready"]).toBeLessThan(1_000);
  await testInfo.attach(`showcase-${fixture.id}-open.json`, { body: Buffer.from(JSON.stringify({ fixture: fixture.file, viewport: "1672x941", trace: "off", ...evidence, browserDelta }, null, 2)), contentType: "application/json" });
  console.log(`[real-world-showcase-open] ${JSON.stringify({ fixture: fixture.file, ...evidence, browserDelta, trace: "off" })}`);
});

async function browserMetrics(cdp: CDPSession) {
  const result = await cdp.send("Performance.getMetrics") as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}
