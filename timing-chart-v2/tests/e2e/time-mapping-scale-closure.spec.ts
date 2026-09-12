import { expect, test, type Page } from "@playwright/test";

const signal = {
  id: "sig_scale",
  name: "SCALE",
  type: "binary",
  role: "internal",
  source: { instancePath: [], signalName: "scale" },
  display: { name: "SCALE" },
  values: [{ start: 0, value: 0 }, { start: 99_999, value: 1 }],
};

function scaleDocument(trial: number, foldCount: 0 | 1_000) {
  return {
    formatVersion: 2,
    document: { id: `mapping-scale-${foldCount}-${trial}`, title: "Mapping Scale", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
    timeline: { start: 0, end: 100_000, cycleCount: 100_000, timeBase: "cycle", edge: "rising", labelAnchors: [{ id: `label-${trial}`, source: 100_000, display: 100_000 }] },
    signalGroups: [{ id: "grp_scale", name: "Scale", rows: [signal.id] }],
    signals: [signal],
    bookmarks: [],
    timeGroups: Array.from({ length: foldCount }, (_, index) => ({ id: `fold-${foldCount}-${trial}-${index}`, name: "Fold", start: index * 100, end: index * 100 + 1, presentation: { collapsed: true } })),
    annotations: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
  };
}

async function openScaleDocument(page: Page, value: unknown) {
  const host = page.getByTestId("cycle-surface");
  const previousEpoch = Number((JSON.parse(await host.getAttribute("data-session-counters") ?? "{}")).projectionDocumentEpoch ?? 0);
  const started = await page.evaluate(() => performance.now());
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "mapping-scale.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect.poll(async () => Number((JSON.parse(await host.getAttribute("data-session-counters") ?? "{}")).projectionDocumentEpoch ?? 0), { timeout: 120_000 }).toBeGreaterThan(previousEpoch);
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  return {
    durationMs: await page.evaluate((value) => performance.now() - value, started),
    counters: JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as Record<string, number>,
  };
}

function percentile(values: readonly number[], fraction: number) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)] ?? 0;
}

test("production browser mapping path records 100k-cycle 0-fold and 1k-fold scale evidence", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const results = [];
  for (const foldCount of [0, 1_000] as const) {
    const samples = [];
    let previousCounters = JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
    // A second 100k-cycle replacement in one Chromium process exceeds the
    // available browser-session memory; repeated trials are covered by the
    // projection unit benchmark, while this remains the production-path smoke.
    for (let trial = 0; trial < 1; trial += 1) {
      const result = await openScaleDocument(page, scaleDocument(trial, foldCount));
      const delta = Object.fromEntries(Object.keys(result.counters).map((key) => [key, (result.counters[key] ?? 0) - (previousCounters[key] ?? 0)]));
      samples.push({ durationMs: result.durationMs, counters: delta });
      previousCounters = result.counters;
    }
    const durations = samples.map((item) => item.durationMs);
    const first = samples[0]!.counters;
    expect(first.sourceCyclesVisited).toBe(100_000);
    expect(first.foldRangesVisited).toBe(foldCount);
    expect(first.builds).toBeGreaterThanOrEqual(1);
    expect(first.builds).toBeLessThanOrEqual(2);
    expect(first.hits).toBeGreaterThanOrEqual(0);
    results.push({ foldCount, trials: samples.length, samples, medianMs: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95) });
  }
  await testInfo.attach("display-time-mapping-scale.json", { body: Buffer.from(JSON.stringify(results, null, 2)), contentType: "application/json" });
  console.log(`[display-time-mapping-scale] ${JSON.stringify(results)}`);
});
