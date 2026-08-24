import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalSchema,
  normalizeDocument,
  parseDocument,
  serializeCanonicalDocument,
  validateCanonicalDocument,
  type CanonicalDocument,
} from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("canonical v2 schema and roundtrip", () => {
  it("exposes a compiled Draft 2020-12 schema and deterministic Save/Open/Save", () => {
    expect(canonicalSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    const original = canonicalFixture();
    expect(validateCanonicalDocument(original)).toEqual([]);
    const first = serializeCanonicalDocument(original);
    const reopened = parseDocument(first);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(serializeCanonicalDocument(reopened.document)).toBe(first);
  });

  it("rejects future versions without dropping the source", () => {
    const future = { ...canonicalFixture(), formatVersion: 999, futureFeature: { retained: true } };
    const result = normalizeDocument(future);
    expect(result).toMatchObject({ ok: false, kind: "unsupported-version", sourceFormatVersion: 999, raw: future });
  });

  it("reports syntax locations", () => {
    const result = parseDocument("{\n  \"formatVersion\": 2,\n  ]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]?.code).toBe("JSON_SYNTAX");
  });

  it("migrates every retained v1 Golden sample without modifying it", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const manifests = [
      resolve(repoRoot, "samples/golden-protocol/timing_chart_sample_pack/manifest.json"),
      resolve(repoRoot, "samples/golden-feature-coverage/timing_chart_feature_coverage_pack/manifest.json"),
    ];
    let count = 0;
    for (const manifestPath of manifests) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Array<{ file?: string }>;
      const directory = resolve(manifestPath, "..");
      for (const sample of manifest) {
        if (!sample.file) continue;
        const text = readFileSync(resolve(directory, "samples", sample.file), "utf8");
        const result = parseDocument(text);
        expect(result, `${sample.file}: ${result.ok ? "" : JSON.stringify(result.problems)}`).toMatchObject({ ok: true });
        if (result.ok) {
          expect(result.document.formatVersion).toBe(2);
          expect(validateCanonicalDocument(result.document), sample.file).toEqual([]);
        }
        count += 1;
      }
    }
    expect(count).toBe(20);
  });

  it("migrates a flat canonical v1 document and supplies v2-owned defaults", () => {
    const v1 = clone(canonicalFixture()) as unknown as Record<string, unknown>;
    v1.formatVersion = 1;
    delete v1.bookmarks;
    delete v1.timeGroups;
    delete v1.checkSettings;
    delete (v1.timeline as Record<string, unknown>).labelAnchors;
    const result = normalizeDocument(v1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toMatchObject({ formatVersion: 2, bookmarks: [], timeGroups: [], checkSettings: {}, timeline: { labelAnchors: [] } });
    expect(result.document.signals[1]).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 4, value: "A5" }] });
  });
});

describe("semantic validation", () => {
  it.each([
    ["duplicate IDs", (doc: CanonicalDocument) => { (doc.signals as unknown as Array<{ id: string }>)[1]!.id = doc.signals[0]!.id; }, "DUPLICATE_ID"],
    ["duplicate membership", (doc: CanonicalDocument) => { (doc.signalGroups as unknown as Array<{ rows: string[] }>)[0]!.rows.push(doc.signals[0]!.id); }, "DUPLICATE_ROW_MEMBERSHIP"],
    ["orphan rows", (doc: CanonicalDocument) => { (doc.signalGroups as unknown as Array<{ rows: string[] }>)[0]!.rows.pop(); }, "ORPHAN_ROW"],
    ["timeline bounds", (doc: CanonicalDocument) => { (doc.signals[1] as unknown as { values: Array<{ start: number }> }).values[1]!.start = 8; }, "TIMELINE_OUT_OF_RANGE"],
    ["bus overflow", (doc: CanonicalDocument) => { (doc.signals[1] as unknown as { values: Array<{ value: string }> }).values[1]!.value = "1FF"; }, "BUS_WIDTH_OVERFLOW"],
    ["non-finite values", (doc: CanonicalDocument) => { (doc.layout as unknown as { rowHeight: number }).rowHeight = Number.NaN; }, "NON_FINITE_NUMBER"],
    ["invalid stable IDs", (doc: CanonicalDocument) => { (doc.signals as unknown as Array<{ id: string }>)[1]!.id = "1 invalid"; }, "INVALID_STABLE_ID"],
  ])("rejects %s", (_name, mutate, code) => {
    const document = clone(canonicalFixture());
    mutate(document);
    expect(validateCanonicalDocument(document).map((item) => item.code)).toContain(code);
  });

  it("rejects missing annotation targets", () => {
    const document = clone(canonicalFixture());
    (document.annotations as unknown as unknown[]).push({ id: "ann_missing", type: "text", label: "bad", visible: true, anchor: { signalId: "missing", cycle: 1, point: "value-start" } });
    expect(validateCanonicalDocument(document).map((item) => item.code)).toContain("MISSING_CROSS_REFERENCE");
  });

  it("rejects non-timing annotation targets", () => {
    const document = clone(canonicalFixture());
    const comment = {
      id: "comment_note", type: "commentRow", name: "Note", role: "internal",
      source: { instancePath: [], signalName: "Note" }, display: { name: "Note" }, title: "Note", body: "Body",
    };
    (document.signals as unknown as unknown[]).push(comment);
    (document.signalGroups as unknown as Array<{ rows: string[] }>)[0]!.rows.push(comment.id);
    (document.annotations as unknown as unknown[]).push({ id: "ann_comment", type: "text", label: "bad", visible: true, anchor: { signalId: comment.id, cycle: 1, point: "value-start" } });
    expect(validateCanonicalDocument(document).map((item) => item.code)).toContain("NON_TIMING_ANCHOR_TARGET");
  });

  it("computes exact non-nibble bus widths and ignores numeric leading zeroes", () => {
    const document = clone(canonicalFixture());
    const bus = document.signals[1] as unknown as { width: number; values: Array<{ value: string }> };
    bus.width = 5;
    bus.values[1]!.value = "0x00_1F";
    expect(validateCanonicalDocument(document)).toEqual([]);
    bus.values[1]!.value = "0x20";
    expect(validateCanonicalDocument(document).map((item) => item.code)).toContain("BUS_WIDTH_OVERFLOW");
  });
});
