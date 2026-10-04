import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalSchema,
  DOCUMENT_RESOURCE_BUDGET,
  MAX_MEASUREMENT_LANE,
  normalizeDocument,
  parseDocument,
  serializeCanonicalDocument,
  validateCanonicalDocument,
  validateDocumentResourceBudget,
  type AnnotationId,
  type BookmarkId,
  type CanonicalDocument,
  type GroupId,
  type SignalId,
  type TimeGroupId,
  type TransactionId,
} from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("canonical v2 schema and roundtrip", () => {
  it("persists an optional physical timebase without changing cycle coordinates", () => {
    const document = clone(canonicalFixture());
    document.timeline.physicalTimebase = { referenceFrequencyHz: 100_000_000, unit: "ns" };
    expect(validateCanonicalDocument(document)).toEqual([]);
    const reopened = parseDocument(serializeCanonicalDocument(document));
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.document.timeline).toMatchObject({ end: document.timeline.end, cycleCount: document.timeline.cycleCount, physicalTimebase: document.timeline.physicalTimebase });
    }
    const invalid = { ...document, timeline: { ...document.timeline, physicalTimebase: { referenceFrequencyHz: 0, unit: "ns" } } };
    expect(validateCanonicalDocument(invalid)).toContainEqual(expect.objectContaining({ code: "INVALID_PHYSICAL_TIMEBASE", path: "$.timeline.physicalTimebase" }));
  });
  it("round-trips every authoritative current sample without semantic drift", () => {
    const repoRoot = resolve(import.meta.dirname, "../..");
    const currentDirectory = resolve(repoRoot, "samples/current");
    const manifest = JSON.parse(readFileSync(resolve(currentDirectory, "manifest.json"), "utf8")) as {
      readonly samples: readonly { readonly file: string }[];
    };
    expect(manifest.samples.length).toBeGreaterThan(0);
    for (const { file } of manifest.samples) {
      const input = readFileSync(resolve(currentDirectory, file), "utf8");
      const opened = parseDocument(input);
      expect(opened.ok, `${file} should open: ${opened.ok ? "" : JSON.stringify(opened.problems)}`).toBe(true);
      if (!opened.ok) continue;
      const saved = serializeCanonicalDocument(opened.document);
      const reopened = parseDocument(saved);
      expect(reopened.ok, `${file} should reopen after Save: ${reopened.ok ? "" : JSON.stringify(reopened.problems)}`).toBe(true);
      if (reopened.ok) {
        expect(reopened.document, `${file} semantic document after Save/Open`).toEqual(opened.document);
        expect(serializeCanonicalDocument(reopened.document), `${file} deterministic serialized form`).toBe(saved);
      }
    }
  });

  it("round-trips Transaction Groups and semantic Transaction presentation fields", () => {
    const document = clone(canonicalFixture());
    const groupId = "txn_group_roundtrip";
    document.transactionGroups = [{ id: groupId as never, name: "Transfers", color: "#123456", order: 2 }];
    document.transactions = [{ id: "txn_roundtrip" as never, name: "Read", start: 1, end: 3, groupId: groupId as never, color: "#abcdef", description: "payload" }];
    expect(validateCanonicalDocument(document)).toEqual([]);
    expect(parseDocument(serializeCanonicalDocument(document)).document).toEqual(document);
  });
  it("round-trips a multi-feature Save/Open specimen with exact semantic equality", () => {
    const document = clone(canonicalFixture());
    const data = document.signals.find((signal) => signal.id === "sig_data");
    const clock = document.signals.find((signal) => signal.id === "sig_clk");
    if (!data || !clock) throw new Error("canonical fixture must contain sig_data and sig_clk");
    const auxiliary = { ...data, id: "sig_aux" as SignalId, name: "AUX", source: { ...data.source, signalName: "AUX" }, display: { ...data.display, name: "AUX" } };
    document.signals = [...document.signals, auxiliary];
    document.signalGroups = [...document.signalGroups, { id: "grp_aux" as GroupId, name: "Auxiliary", rows: [auxiliary.id] }];
    document.bookmarks = [{ id: "bookmark_phase" as BookmarkId, name: "Phase boundary", start: 3, comment: "round-trip specimen" }];
    document.timeGroups = [{ id: "time_wait" as TimeGroupId, name: "Wait", start: 2, end: 4, comment: "folded interval", presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "WAIT" } }];
    document.transactions = [{ id: "transaction_read" as TransactionId, name: "Read", source: "CPU", destination: "Memory", start: 1, end: 6, phases: [{ name: "Address", start: 1, end: 3 }, { name: "Data", start: 3, end: 6 }], linkedSignals: [data.id], color: "#335577", description: "multi-feature specimen", visible: true }];
    document.annotations = [
      { id: "annotation_marker" as AnnotationId, type: "marker", label: "Mark", visible: true, color: "#aa2200", anchor: { signalId: data.id, cycle: 3, point: "cycle-center" }, verticalSpan: { mode: "rows", startRowId: clock.id, endRowId: auxiliary.id } },
      { id: "annotation_bracket" as AnnotationId, type: "bracket", label: "Bracket", visible: true, color: "#004488", start: { signalId: data.id, cycle: 1, point: "cycle-start" }, end: { signalId: data.id, cycle: 5, point: "cycle-end" }, lineType: "orthogonal", style: { strokeWidth: 4, strokeStyle: "dashed" } },
    ];
    const groupedRows = document.signalGroups.flatMap((group) => group.rows);
    expect(new Set(groupedRows).size).toBe(groupedRows.length);
    expect(new Set(groupedRows)).toEqual(new Set(document.signals.map((signal) => signal.id)));
    expect(validateCanonicalDocument(document)).toEqual([]);
    const saved = serializeCanonicalDocument(document);
    const reopened = parseDocument(saved);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.document).toEqual(document);
    expect(serializeCanonicalDocument(reopened.document)).toBe(saved);
  });
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

  it("keeps caller-owned normalization immutable while string Open normalizes its owned tree", () => {
    const input = clone(canonicalFixture()) as unknown as Record<string, unknown>;
    const signals = input.signals as Array<{ display: Record<string, unknown> }>;
    signals[0]!.display.splitPane = "lower";
    delete input.annotationGroups;
    const before = JSON.stringify(input);

    const normalized = normalizeDocument(input);
    expect(normalized.ok).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    if (normalized.ok) {
      expect(normalized.document.signals[0]!.display).not.toHaveProperty("splitPane");
      expect(normalized.document.annotationGroups).toEqual([]);
    }

    const opened = parseDocument(before);
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.document.signals[0]!.display).not.toHaveProperty("splitPane");
      expect(opened.document.annotationGroups).toEqual([]);
    }
  });

  it("reports syntax locations", () => {
    const result = parseDocument("{\n  \"formatVersion\": 2,\n  ]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]?.code).toBe("JSON_SYNTAX");
  });

  it("migrates every retained v1 Golden sample without modifying it", () => {
    const repoRoot = resolve(import.meta.dirname, "../..");
    const manifests = [
      resolve(repoRoot, "samples/old/pre-reset-2026-10-02/golden-protocol/timing_chart_sample_pack/manifest.json"),
      resolve(repoRoot, "samples/old/pre-reset-2026-10-02/golden-feature-coverage/timing_chart_feature_coverage_pack/manifest.json"),
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

  it("validates and round-trips every non-Golden showcase sample", () => {
    const repoRoot = resolve(import.meta.dirname, "../..");
    const directory = resolve(repoRoot, "samples/old/pre-reset-2026-10-02/showcase");
    const files = [
      "21_large_feature_showcase.tcd.json",
      "22_clockless_annotation_showcase.tcd.json",
      "23_multiclock_cdc_showcase.tcd.json",
      "24_protocol_transaction_showcase.tcd.json",
      "25_long_timeline_stress_showcase.tcd.json",
    ];
    for (const file of files) {
      const result = parseDocument(readFileSync(resolve(directory, file), "utf8"));
      expect(result, `${file}: ${result.ok ? "" : JSON.stringify(result.problems)}`).toMatchObject({ ok: true });
      if (!result.ok) continue;
      expect(validateCanonicalDocument(result.document), file).toEqual([]);
      const saved = serializeCanonicalDocument(result.document);
      const reopened = parseDocument(saved);
      expect(reopened.ok, `${file}: reopen`).toBe(true);
      if (reopened.ok) expect(serializeCanonicalDocument(reopened.document)).toBe(saved);
    }
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
  it("bounds explicit Measurement lanes and preserves the maximum through Save/Open", () => {
    const base = clone(canonicalFixture());
    const signal = base.signals[1]!;
    const measurement = {
      id: "ann_lane_bound" as AnnotationId,
      type: "measurement" as const,
      label: "lane bound",
      visible: true,
      measurement: { profile: "cycle" as const, anchorKind: "threshold" as const },
      measurementLayout: { startMarker: "bar" as const, endMarker: "bar" as const, arrowLayout: "auto" as const, extensionLines: "both" as const, lane: MAX_MEASUREMENT_LANE },
      start: { signalId: signal.id, cycle: 1, point: "cycle-start" as const },
      end: { signalId: signal.id, cycle: 3, point: "cycle-end" as const },
    };
    const valid = { ...base, annotations: [measurement] };
    expect(validateCanonicalDocument(valid)).toEqual([]);
    const reopened = parseDocument(serializeCanonicalDocument(valid));
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.document.annotations[0]?.measurementLayout?.lane).toBe(MAX_MEASUREMENT_LANE);

    const invalid = { ...valid, annotations: [{ ...measurement, measurementLayout: { ...measurement.measurementLayout, lane: MAX_MEASUREMENT_LANE + 1 } }] };
    expect(validateCanonicalDocument(invalid).map((item) => item.code)).toContain("SCHEMA_MAXIMUM");
    expect(parseDocument(JSON.stringify(invalid)).ok).toBe(false);
    const laneSchema = (canonicalSchema as { $defs: { annotation: { properties: { measurementLayout: { properties: { lane: { maximum: number } } } } } } }).$defs.annotation.properties.measurementLayout.properties.lane;
    expect(laneSchema.maximum).toBe(MAX_MEASUREMENT_LANE);
  });

  it("enforces shared document resource budgets without truncation", () => {
    const base = canonicalFixture();
    expect(validateDocumentResourceBudget(base)).toEqual([]);
    const tooManySignals = { ...base, signals: new Array(DOCUMENT_RESOURCE_BUDGET.signalCount + 1).fill(base.signals[0]) } as unknown as CanonicalDocument;
    expect(validateDocumentResourceBudget(tooManySignals)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.signals", value: DOCUMENT_RESOURCE_BUDGET.signalCount + 1 })]));
    const tooManyCycles = { ...base, timeline: { ...base.timeline, cycleCount: DOCUMENT_RESOURCE_BUDGET.cycleCount + 1, end: DOCUMENT_RESOURCE_BUDGET.cycleCount + 1 } } as CanonicalDocument;
    expect(validateDocumentResourceBudget(tooManyCycles)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.timeline.cycleCount", value: DOCUMENT_RESOURCE_BUDGET.cycleCount + 1 })]));
    try {
      serializeCanonicalDocument(tooManyCycles);
      throw new Error("Expected over-budget serialization to be rejected.");
    } catch (error) {
      expect(error).toMatchObject({ problems: [expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.timeline.cycleCount" })] });
    }
  });

  it("budgets every persistent collection added to the Canonical model", () => {
    const base = canonicalFixture();
    expect(validateDocumentResourceBudget({ ...base, transactionGroups: new Array(DOCUMENT_RESOURCE_BUDGET.transactionGroupCount + 1).fill({}) } as unknown as CanonicalDocument)).toEqual(expect.arrayContaining([expect.objectContaining({ path: "$.transactionGroups", value: DOCUMENT_RESOURCE_BUDGET.transactionGroupCount + 1 })]));
    expect(validateDocumentResourceBudget({ ...base, enumDefinitions: [{ entries: new Array(DOCUMENT_RESOURCE_BUDGET.enumEntryCount + 1).fill({}) }] } as unknown as CanonicalDocument)).toEqual(expect.arrayContaining([expect.objectContaining({ path: "$.enumDefinitions[*].entries", value: DOCUMENT_RESOURCE_BUDGET.enumEntryCount + 1 })]));
    expect(validateDocumentResourceBudget({ ...base, timeline: { ...base.timeline, labelAnchors: new Array(DOCUMENT_RESOURCE_BUDGET.labelAnchorCount + 1).fill({}) } } as unknown as CanonicalDocument)).toEqual(expect.arrayContaining([expect.objectContaining({ path: "$.timeline.labelAnchors", value: DOCUMENT_RESOURCE_BUDGET.labelAnchorCount + 1 })]));
  });

  it("round-trips presentation displayLabel without changing the semantic value", () => {
    const original = canonicalFixture();
    const data = original.signals[1]!;
    const withLabel = { ...original, signals: [original.signals[0]!, { ...data, values: [{ start: 0, value: "0xA5", displayLabel: "READY" }] }] };
    const reopened = parseDocument(serializeCanonicalDocument(withLabel));
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.document.signals[1]).toMatchObject({ values: [{ start: 0, value: "0xA5", displayLabel: "READY" }] });
  });

  it("accepts linked Timing Region/Ghost Trace and rejects a missing Ghost source", () => {
    const document = clone(canonicalFixture());
    const annotations = document.annotations as unknown as Array<Record<string, unknown>>;
    annotations.push({ id: "annotation_timing_region", type: "timingRegion", label: "setup window", visible: true, start: { signalId: "sig_data", cycle: 1, point: "cycle-start" }, end: { signalId: "sig_data", cycle: 4, point: "cycle-end" }, opacity: 0.2 });
    annotations.push({ id: "annotation_ghost_trace", type: "ghostTrace", label: "previous data", visible: true, sourceSignalId: "sig_data", traceOffsetCycles: -1, opacity: 0.5, start: { signalId: "sig_data", cycle: 2, point: "cycle-start" }, end: { signalId: "sig_data", cycle: 5, point: "cycle-end" } });
    expect(validateCanonicalDocument(document)).toEqual([]);
    annotations[1]!.sourceSignalId = "sig_missing";
    expect(validateCanonicalDocument(document).some((item) => item.code === "MISSING_CROSS_REFERENCE")).toBe(true);
  });

  it("validates LegendEntry identity, labels and explicit order", () => {
    const document = clone(canonicalFixture());
    (document as unknown as { legend: { items: unknown[] } }).legend.items = [
      { id: "legend_input", role: "input", label: "Inputs", visible: true, order: 0 },
      { id: "legend_output", role: "output", label: "Outputs", visible: false, order: 1 },
    ];
    expect(validateCanonicalDocument(document)).toEqual([]);
    (document as unknown as { legend: { items: Array<{ id: string; order: number; label: string }> } }).legend.items[1]!.id = "legend_input";
    (document as unknown as { legend: { items: Array<{ id: string; order: number; label: string }> } }).legend.items[1]!.order = 0;
    (document as unknown as { legend: { items: Array<{ id: string; order: number; label: string }> } }).legend.items[1]!.label = " ";
    expect(validateCanonicalDocument(document).map((item) => item.code)).toEqual(expect.arrayContaining(["DUPLICATE_ID", "INVALID_LEGEND_ENTRY"]));
  });

  it.each([
    ["duplicate IDs", (doc: CanonicalDocument) => { (doc.signals as unknown as Array<{ id: string }>)[1]!.id = doc.signals[0]!.id; }, "DUPLICATE_ID"],
    ["duplicate membership", (doc: CanonicalDocument) => { (doc.signalGroups as unknown as Array<{ rows: string[] }>)[0]!.rows.push(doc.signals[0]!.id); }, "DUPLICATE_ROW_MEMBERSHIP"],
    ["orphan rows", (doc: CanonicalDocument) => { (doc.signalGroups as unknown as Array<{ rows: string[] }>)[0]!.rows.pop(); }, "ORPHAN_ROW"],
    ["timeline bounds", (doc: CanonicalDocument) => { (doc.signals[1] as unknown as { values: Array<{ start: number }> }).values[1]!.start = 8; }, "TIMELINE_OUT_OF_RANGE"],
    ["bus overflow", (doc: CanonicalDocument) => { (doc.signals[1] as unknown as { values: Array<{ value: string }> }).values[1]!.value = "1FF"; }, "BUS_WIDTH_OVERFLOW"],
    ["non-finite values", (doc: CanonicalDocument) => { (doc.layout as unknown as { rowHeight: number }).rowHeight = Number.NaN; }, "NON_FINITE_NUMBER"],
    ["invalid stable IDs", (doc: CanonicalDocument) => { (doc.signals as unknown as Array<{ id: string }>)[1]!.id = "1 invalid"; }, "INVALID_STABLE_ID"],
    ["fractional change points", (doc: CanonicalDocument) => { (doc.signals[1] as unknown as { values: Array<{ start: number }> }).values[1]!.start = 4.5; }, "TIMELINE_OUT_OF_RANGE"],
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

  it("accepts 30/70 semantic transition thresholds and rejects threshold misuse", () => {
    const document = clone(canonicalFixture());
    (document.annotations as unknown as unknown[]).push({ id: "ann_threshold", type: "measurement", label: "30-70", visible: true, start: { signalId: document.signals[1]!.id, cycle: 3, point: "transition-center", threshold: 0.3 }, end: { signalId: document.signals[1]!.id, cycle: 6, point: "transition-center", threshold: 0.7 } });
    expect(validateCanonicalDocument(document)).toEqual([]);
    (document.annotations as unknown as Array<{ end: { threshold: number } }>).at(-1)!.end.threshold = 1.2;
    expect(validateCanonicalDocument(document).map((item) => item.code)).toContain("SCHEMA_MAXIMUM");
  });

  it("round-trips explicit threshold and ratio measurement semantics", () => {
    const document = clone(canonicalFixture());
    (document.annotations as unknown as unknown[]).push({ id: "ann_profile", type: "measurement", label: "10-90", visible: true, measurement: { profile: "10-90", anchorKind: "ratio" }, start: { signalId: document.signals[1]!.id, cycle: 1, point: "transition-center", transition: { kind: "ratio", value: 0.1 } }, end: { signalId: document.signals[1]!.id, cycle: 4, point: "transition-center", transition: { kind: "ratio", value: 0.9 } } });
    expect(validateCanonicalDocument(document)).toEqual([]);
    const roundTrip = parseDocument(serializeCanonicalDocument(document));
    expect(roundTrip.document.annotations.at(-1)).toMatchObject({ measurement: { profile: "10-90", anchorKind: "ratio" }, start: { transition: { kind: "ratio", value: 0.1 } }, end: { transition: { kind: "ratio", value: 0.9 } } });
  });

  it.each([
    ["binary width", "binary", "width", 1],
    ["binary display format", "binary", "displayFormat", "binary"],
    ["binary generator", "binary", "generator", canonicalFixture().signals[0]!.type === "clock" ? canonicalFixture().signals[0]!.generator : undefined],
    ["clock values", "clock", "values", [{ start: 0, value: 0 }]],
    ["clock width", "clock", "width", 1],
    ["comment generator", "commentRow", "generator", canonicalFixture().signals[0]!.type === "clock" ? canonicalFixture().signals[0]!.generator : undefined],
    ["comment values", "commentRow", "values", [{ start: 0, value: 0 }]],
  ])("rejects signal foreign field: %s", (_name, type, key, value) => {
    const document = clone(canonicalFixture());
    const base = document.signals[1] as unknown as Record<string, unknown>;
    if (type === "clock") Object.assign(base, document.signals[0], { id: document.signals[1]!.id });
    else if (type === "commentRow") Object.assign(base, { type, role: "internal", title: "Note", body: "Body" });
    else Object.assign(base, { type });
    base[key] = value;
    expect(validateCanonicalDocument(document).map((item) => item.code)).toContain("SCHEMA_NOT");
  });

  it("rejects a spacer row placed in a group other than its owner", () => {
    const document = clone(canonicalFixture());
    const first = document.signalGroups[0]!;
    const second = { id: "grp_other", name: "Other", rows: ["spacer_owned"] };
    (document.signalGroups as unknown as Array<Record<string, unknown>>).splice(0, 1,
      { ...first, rows: first.rows, spacers: [{ id: "spacer_owned", height: 8 }] }, second);
    expect(validateCanonicalDocument(document).map((item) => item.code)).toContain("SPACER_OWNER_MISMATCH");
  });

  it("rejects duplicate ruler sources and non-reciprocal Time Group resume anchors", () => {
    const document = clone(canonicalFixture());
    (document.timeGroups as unknown as Array<Record<string, unknown>>).push({ id: "time_gap", name: "Gap", start: 2, end: 4, presentation: { resumeLabelAnchorId: "label_resume" } });
    (document.timeline.labelAnchors as unknown as Array<Record<string, unknown>>).push(
      { id: "label_resume", source: 3, display: 10, ownerTimeGroupId: "time_other" },
      { id: "label_duplicate", source: 3, display: 11 },
    );
    const codes = validateCanonicalDocument(document).map((item) => item.code);
    expect(codes).toContain("DUPLICATE_LABEL_ANCHOR_SOURCE");
    expect(codes).toContain("TIME_GROUP_RESUME_OWNER_MISMATCH");
  });

  it("rejects anchor points that are incompatible with their signal target", () => {
    const document = clone(canonicalFixture());
    (document.annotations as unknown as Array<Record<string, unknown>>).push({ id: "ann_bad_point", type: "text", label: "bad", visible: true, anchor: { signalId: "sig_clk", cycle: 1, point: "value-center" } });
    (document.annotations as unknown as Array<Record<string, unknown>>).push({ id: "ann_bad_edge", type: "text", label: "bad edge", visible: true, anchor: { signalId: "sig_data", cycle: 1, point: "rising-edge" } });
    expect(validateCanonicalDocument(document).map((item) => item.code)).toContain("INVALID_ANCHOR_POINT");
  });

  it("rejects event edge and clock transition anchors before they can become unresolved geometry", () => {
    const document = clone(canonicalFixture());
    const event = { id: "sig_event_anchor", name: "EVENT", type: "event", role: "internal", source: { instancePath: [], signalName: "event" }, display: { name: "EVENT" }, values: [{ start: 0, value: "NONE" }] };
    (document.signals as unknown as unknown[]).push(event);
    (document.signalGroups as unknown as Array<{ rows: string[] }>)[0]!.rows.push(event.id);
    (document.annotations as unknown as Array<Record<string, unknown>>).push({ id: "ann_event_edge", type: "text", label: "event edge", visible: true, anchor: { signalId: event.id, cycle: 1, point: "rising-edge" } });
    (document.annotations as unknown as Array<Record<string, unknown>>).push({ id: "ann_clock_transition", type: "text", label: "clock transition", visible: true, anchor: { signalId: "sig_clk", cycle: 1, point: "transition-center" } });
    const invalidPoints = validateCanonicalDocument(document).filter((item) => item.code === "INVALID_ANCHOR_POINT");
    expect(invalidPoints).toHaveLength(2);
    expect(invalidPoints.map((item) => item.path).every((path) => path.endsWith(".anchor.point"))).toBe(true);
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
