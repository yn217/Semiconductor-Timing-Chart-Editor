import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateCanonicalDocument, validateDocumentResourceBudget } from "@timing-chart-v2/schema";
import type { CanonicalDocument } from "@timing-chart-v2/schema";

const samplesDirectory = path.resolve(import.meta.dirname, "../../samples/performance");
const manifest = JSON.parse(fs.readFileSync(path.join(samplesDirectory, "manifest.json"), "utf8")) as {
  fixtures: readonly {
    id: string;
    file: string;
    signalCount: number;
    cycleCount: number;
    transactionCount: number;
    annotationCount: number;
    expectedWorkload: string;
    benchmarks: readonly string[];
  }[];
};

describe("performance sample workload contracts", () => {
  it("manifest names the three checked-in scale fixtures exactly", () => {
    expect(manifest.fixtures.map(({ file }) => file).sort()).toEqual([
      "perf_1000x1000_virtualized.tcd.json",
      "perf_100x100000_sparse_timeline.tcd.json",
      "perf_100x500_full_span.tcd.json",
    ]);
  });

  it.each(manifest.fixtures)('$id matches declared counts and current validation', (entry) => {
    const document = JSON.parse(fs.readFileSync(path.join(samplesDirectory, entry.file), "utf8")) as CanonicalDocument;
    expect(document.formatVersion).toBe(2);
    expect(document.signals).toHaveLength(entry.signalCount);
    expect(document.timeline.cycleCount).toBe(entry.cycleCount);
    expect(document.transactions).toHaveLength(entry.transactionCount);
    expect(document.annotations).toHaveLength(entry.annotationCount);
    expect(validateCanonicalDocument(document)).toEqual([]);
    expect(validateDocumentResourceBudget(document)).toEqual([]);
    expect(entry.expectedWorkload.length).toBeGreaterThan(0);
  });

  it("fixed 100x500 fixture remains full-span and is wired into the engineering benchmark", () => {
    const entry = manifest.fixtures.find(({ id }) => id === "100x500_full_span");
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ signalCount: 100, cycleCount: 500, benchmarks: ["tests/performance/fixed-full-span-open.spec.ts"] });
    const document = JSON.parse(fs.readFileSync(path.join(samplesDirectory, entry!.file), "utf8")) as CanonicalDocument;
    expect(document.timeline).toMatchObject({ start: 0, end: 500, cycleCount: 500 });
    expect(document.signals.filter((signal) => signal.type !== "commentRow")).toHaveLength(100);
    expect(document.signals.some((signal) => signal.type === "clock")).toBe(true);
    expect(document.signals.some((signal) => signal.type === "bus")).toBe(true);
    expect(document.signals.some((signal) => signal.type === "binary")).toBe(true);
  });
});
