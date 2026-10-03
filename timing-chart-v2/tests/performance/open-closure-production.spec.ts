import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Open performance CLOSURE pass (#854 / #930 / #893 / #217): production File -> Open of the fixed engineering workloads, the current
 * realistic protocol sample and the #21/#24/#25 showcases, reading the app's own phase durations. Meant to run against a PRODUCTION build
 * (`vite build` + `vite preview`, see playwright.prod-closure.config.ts); the numbers are printed, and a generous ceiling guards regressions.
 */
const fixtures = [
  { file: "samples/performance/perf_100x500_full_span.tcd.json", label: "perf_100x500_full_span" },
  { file: "samples/performance/perf_1000x1000_virtualized.tcd.json", label: "perf_1000x1000_virtualized" },
  { file: "samples/performance/perf_100x100000_sparse_timeline.tcd.json", label: "perf_100x100000_sparse_timeline" },
  { file: "samples/current/05_combined_protocol.tcd.json", label: "current_05_combined_protocol" },
  { file: "samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json", label: "showcase_21" },
  { file: "samples/old/pre-reset-2026-10-02/showcase/24_protocol_transaction_showcase.tcd.json", label: "showcase_24" },
  { file: "samples/old/pre-reset-2026-10-02/showcase/25_long_timeline_stress_showcase.tcd.json", label: "showcase_25" },
] as const;

for (const fixture of fixtures) test(`production Open closure: ${fixture.label}`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const file = readFileSync(resolve(process.cwd(), fixture.file));
  const title = (JSON.parse(file.toString("utf8")) as { document: { title: string } }).document.title;
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: fixture.label, mimeType: "application/json", buffer: file });
  await expect(page.locator(".app-titlebar h1")).toHaveText(title);
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  const evidence = await host.evaluate((surface) => {
    const durations = JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
    const marks = JSON.parse(surface.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
    const start = marks["open-command-start"] ?? 0;
    const longTasks = performance.getEntriesByType("longtask").filter((entry) => entry.startTime >= start).map((entry) => entry.duration);
    const owners = Array.from(surface.querySelectorAll<HTMLElement>("[data-role='wave-owner']"), (owner) => ({ start: Number(owner.dataset.renderedSourceWindowStart), end: Number(owner.dataset.renderedSourceWindowEnd), state: owner.dataset.waveState }));
    return { durations, longTasks: { count: longTasks.length, maxDurationMs: Math.round(Math.max(0, ...longTasks)) }, owners: { count: owners.length, ready: owners.filter((owner) => owner.state === "ready").length, minStart: Math.min(...owners.map((owner) => owner.start)), maxEnd: Math.max(...owners.map((owner) => owner.end)) } };
  });
  const pick = (name: string) => Math.round(evidence.durations[name] ?? -1);
  console.log(`[open-closure-production] ${JSON.stringify({ fixture: fixture.label, presentationReadyMs: pick("presentation-ready"), visibleWaveformsReadyMs: pick("visible-waveforms-ready"), idleMs: pick("idle"), phases: Object.fromEntries(Object.entries(evidence.durations).map(([key, value]) => [key, Math.round(value)])), longTasks: evidence.longTasks, owners: evidence.owners })}`);
  expect(evidence.owners.count).toBeGreaterThan(0);
  expect(evidence.owners.ready).toBe(evidence.owners.count);
  expect(pick("visible-waveforms-ready")).toBeGreaterThan(0);
  expect(pick("visible-waveforms-ready"), "visible waveforms ready in a production build").toBeLessThan(2_000);
});
