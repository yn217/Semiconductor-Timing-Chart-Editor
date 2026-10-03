import { describe, expect, it } from "vitest";
import { buildDisplayTimeMapping, DisplayTimeMappingCache, remapValueChangesToDisplay } from "@timing-chart-v2/projection";
import type { LabelAnchor, TimeGroup } from "@timing-chart-v2/schema";

/**
 * #862 scale evidence at the product limits (100,000 cycles, 20,000 LabelAnchors, 2,000 collapsed Time Groups): construction visits
 * fold ranges (not cycles), labelFor does not copy/sort anchors per call, a cache hit is identity-based, identity conversion needs no
 * cycleCount table, and sparse value remap scales with value changes. Wall-clock bounds are deliberately loose (>=10x headroom).
 */
const cycleCount = 100_000;
const labelAnchors = Array.from({ length: 20_000 }, (_, index) => ({ id: `la_${index}`, source: index * 5, display: index * 5 + 1000, label: `T${index}` })) as unknown as LabelAnchor[];
const folds = Array.from({ length: 2_000 }, (_, index) => ({ id: `tg_${index}`, name: `F${index}`, start: index * 50 + 10, end: index * 50 + 40, presentation: { collapsed: true } })) as unknown as TimeGroup[];
const time = <T>(run: () => T): { value: T; ms: number } => { const started = performance.now(); const value = run(); return { value, ms: performance.now() - started }; };

describe("DisplayTimeMapping scale (#862)", () => {
  it("builds from fold ranges without visiting every source cycle", () => {
    const cache = new DisplayTimeMappingCache();
    const built = time(() => cache.get({ cycleCount, labelAnchors }, folds));
    const metrics = cache.metrics();
    console.log(`[#862] build 100k cycles / 2k folds / 20k anchors: ${built.ms.toFixed(1)} ms; sourceCyclesVisited=${metrics.sourceCyclesVisited}, foldRangesVisited=${metrics.foldRangesVisited}`);
    expect(metrics.sourceCyclesVisited).toBe(0);
    expect(metrics.foldRangesVisited).toBe(2_000);
    expect(built.value.displayCycleCount).toBe(cycleCount - 2_000 * 30);
    expect(built.ms).toBeLessThan(500);
  });

  it("answers 512 ruler labels + 10k conversions without per-call anchor sorting, and cache hits build no key", () => {
    const cache = new DisplayTimeMappingCache();
    const mapping = cache.get({ cycleCount, labelAnchors }, folds);
    const labels = time(() => { let total = 0; for (let display = 0; display < 512; display += 1) total += mapping.labelFor(display * 7) as number; return total; });
    const conversions = time(() => { let hits = 0; for (let source = 0; source < 10_000; source += 1) if (mapping.sourceToDisplay(source * 9) !== undefined) hits += 1; return hits; });
    const hit = time(() => { for (let index = 0; index < 10_000; index += 1) cache.get({ cycleCount, labelAnchors }, folds); });
    console.log(`[#862] 512 labelFor: ${labels.ms.toFixed(1)} ms; 10k sourceToDisplay: ${conversions.ms.toFixed(1)} ms; 10k cache hits: ${hit.ms.toFixed(1)} ms; metrics=${JSON.stringify(cache.metrics())}`);
    expect(cache.metrics().builds).toBe(1);
    expect(cache.metrics().hits).toBe(10_000);
    expect(cache.metrics().mappingKeyBuilds).toBe(0);
    expect(labels.ms).toBeLessThan(250);
    expect(conversions.ms).toBeLessThan(250);
    expect(hit.ms).toBeLessThan(250);
  });

  it("identity mapping converts arithmetically and sparse remap scales with value changes, not display cycles", () => {
    const identity = buildDisplayTimeMapping({ cycleCount, labelAnchors: [] }, []);
    expect(identity.isIdentity).toBe(true);
    expect(identity.sourceToDisplay(99_999)).toBe(99_999);
    expect(identity.displayToSource(5)).toBe(5);
    const mapping = buildDisplayTimeMapping({ cycleCount, labelAnchors }, folds);
    const sparse = Array.from({ length: 50 }, (_, index) => ({ start: index * 1_900, value: index % 2 })) as never;
    const remap = time(() => remapValueChangesToDisplay(sparse, mapping));
    const dense = Array.from({ length: 5_000 }, (_, index) => ({ start: index * 19, value: index % 2 })) as never;
    const denseRemap = time(() => remapValueChangesToDisplay(dense, mapping));
    console.log(`[#862] sparse remap 50 changes over ${mapping.displayCycleCount} display cycles: ${remap.ms.toFixed(2)} ms; 5,000 changes: ${denseRemap.ms.toFixed(2)} ms`);
    expect(remap.value.length).toBeLessThanOrEqual(50);
    expect(remap.ms).toBeLessThan(50);
    expect(denseRemap.ms).toBeLessThan(250);
  });
});
