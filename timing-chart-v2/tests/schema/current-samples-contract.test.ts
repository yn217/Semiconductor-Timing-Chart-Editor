import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateCanonicalDocument, validateDocumentResourceBudget } from "@timing-chart-v2/schema";
import type { CanonicalDocument } from "@timing-chart-v2/schema";

const root = path.resolve(import.meta.dirname, "../../samples");
const currentDirectory = path.join(root, "current");
type SchemaNode = { required?: readonly string[]; enum?: readonly (string | number)[]; properties?: Record<string, SchemaNode> };
const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../packages/schema/src/canonical-document.schema.json"), "utf8")) as SchemaNode & {
  required?: readonly string[];
  $defs?: Record<string, SchemaNode>;
};
const manifest = JSON.parse(fs.readFileSync(path.join(currentDirectory, "manifest.json"), "utf8")) as { samples: readonly { file: string; coverage: readonly string[] }[] };
const matrix = JSON.parse(fs.readFileSync(path.join(currentDirectory, "coverage-matrix.json"), "utf8")) as Record<string, Record<string, readonly string[]>>;
const fixtures = new Map(manifest.samples.map(({ file }) => [file, JSON.parse(fs.readFileSync(path.join(currentDirectory, file), "utf8")) as CanonicalDocument]));

function assertSchemaCoverage(matrixKey: string, enumValues: readonly (string | number)[] | undefined): void {
  expect(enumValues, `published schema enum for ${matrixKey}`).toBeDefined();
  const declared = matrix[matrixKey] ?? {};
  for (const value of enumValues ?? []) {
    expect(declared[String(value)]?.length ?? 0, `${matrixKey}.${value} needs at least one current sample`).toBeGreaterThan(0);
    for (const file of declared[String(value)] ?? []) expect(fixtures.has(file), `${matrixKey}.${value} references an unknown fixture ${file}`).toBe(true);
  }
}

describe("#777 authoritative current sample suite", () => {
  it("has exactly the six newly authored current documents", () => {
    expect([...fixtures.keys()].sort()).toEqual([
      "01_cycle_signals.tcd.json", "02_annotations.tcd.json", "03_transactions.tcd.json",
      "04_timegroups_bookmarks.tcd.json", "05_combined_protocol.tcd.json", "06_layout_export.tcd.json",
    ]);
    expect(fs.readdirSync(currentDirectory).filter((name) => name.endsWith(".tcd.json")).sort()).toEqual([...fixtures.keys()].sort());
    expect(Object.keys(matrix.topLevelFields ?? {}).sort()).toEqual([...(schema.required ?? [])].sort());
    for (const file of fs.readdirSync(currentDirectory).filter((name) => name.endsWith(".tcd.json"))) {
      const document = fixtures.get(file)! as unknown as Record<string, unknown>;
      for (const field of schema.required ?? []) expect(Object.hasOwn(document, field), `${file} root field ${field}`).toBe(true);
    }
  });

  it.each([...fixtures])("%s is formatVersion 2 and passes structural, semantic and resource validation", (_file, document) => {
    expect(document.formatVersion).toBe(2);
    expect(validateCanonicalDocument(document)).toEqual([]);
    expect(validateDocumentResourceBudget(document)).toEqual([]);
    for (const key of schema.required ?? []) expect(document, `missing schema-required root field ${key}`).toHaveProperty(key);
  });

  it("schema SignalType, SignalRole, DisplayFormat, AnnotationType and anchor-point enums are represented", () => {
    const annotation = schema.$defs?.annotation?.properties;
    assertSchemaCoverage("signalTypes", schema.$defs?.signal?.properties?.type?.enum);
    assertSchemaCoverage("signalRoles", schema.$defs?.signal?.properties?.role?.enum);
    assertSchemaCoverage("displayFormats", schema.$defs?.signal?.properties?.displayFormat?.enum);
    assertSchemaCoverage("annotationTypes", annotation?.type?.enum);
    assertSchemaCoverage("anchorPoints", schema.$defs?.anchor?.properties?.point?.enum);
    assertSchemaCoverage("anchorTransitionKinds", schema.$defs?.anchor?.properties?.transition?.properties?.kind?.enum);
    assertSchemaCoverage("signalNameAlign", schema.$defs?.layout?.properties?.signalNameAlign?.enum);
    assertSchemaCoverage("signalNameOverflow", schema.$defs?.layout?.properties?.overflow?.enum);
    assertSchemaCoverage("annotationLineTypes", annotation?.lineType?.enum);
    assertSchemaCoverage("annotationArrowheads", annotation?.arrowhead?.enum);
    assertSchemaCoverage("annotationLabelPlacements", annotation?.labelPlacement?.enum);
    assertSchemaCoverage("annotationAlignments", annotation?.align?.enum);
    assertSchemaCoverage("measurementProfiles", annotation?.measurement?.properties?.profile?.enum);
    assertSchemaCoverage("markerSpanModes", annotation?.verticalSpan?.properties?.mode?.enum);
    assertSchemaCoverage("highlightPositionModes", annotation?.positionMode?.enum);
    assertSchemaCoverage("measurementLayoutStartMarkers", annotation?.measurementLayout?.properties?.startMarker?.enum);
    assertSchemaCoverage("measurementLayoutEndMarkers", annotation?.measurementLayout?.properties?.endMarker?.enum);
    assertSchemaCoverage("measurementLayoutArrowLayouts", annotation?.measurementLayout?.properties?.arrowLayout?.enum);
    assertSchemaCoverage("measurementLayoutExtensions", annotation?.measurementLayout?.properties?.extensionLines?.enum);
    assertSchemaCoverage("resetPolarities", schema.$defs?.resetSemantics?.properties?.polarity?.enum);
    assertSchemaCoverage("resetSynchronizations", schema.$defs?.resetSemantics?.properties?.synchronization?.enum);
  });

  it("manifest feature declarations agree with each document and historical samples are not named current", () => {
    for (const entry of manifest.samples) {
      const document = fixtures.get(entry.file)!;
      expect(entry.coverage.length, entry.file).toBeGreaterThan(0);
      expect(document.document.id).not.toMatch(/legacy|golden|pre-reset/i);
    }
    const readme = fs.readFileSync(path.join(currentDirectory, "README.md"), "utf8");
    expect(readme).toMatch(/only authoritative current-spec/i);
    expect(readme).toMatch(/historical fixtures live under.*old/i);
  });

  it("resolves all declared stable references used by the six examples", () => {
    for (const [file, document] of fixtures) {
      const signalIds = new Set(document.signals.map(({ id }) => id));
      const groupIds = new Set((document.transactionGroups ?? []).map(({ id }) => id));
      const timeGroupIds = new Set(document.timeGroups.map(({ id }) => id));
      const labelAnchorIds = new Set(document.timeline.labelAnchors.map(({ id }) => id));
      if (document.timeline.referenceClock) expect(signalIds.has(document.timeline.referenceClock as never), file).toBe(true);
      for (const group of document.signalGroups) for (const row of group.rows) expect(signalIds.has(row as never) || group.spacers?.some(({ id }) => id === row), `${file} row ${row}`).toBe(true);
      for (const transaction of document.transactions) {
        if (transaction.groupId) expect(groupIds.has(transaction.groupId), `${file} transaction group ${transaction.groupId}`).toBe(true);
        for (const linked of transaction.linkedSignals ?? []) expect(signalIds.has(linked as never), `${file} linked signal ${linked}`).toBe(true);
      }
      for (const timeGroup of document.timeGroups) {
        if (timeGroup.parentId) expect(timeGroupIds.has(timeGroup.parentId), `${file} time-group parent`).toBe(true);
        const anchorId = timeGroup.presentation?.resumeLabelAnchorId;
        if (anchorId) expect(labelAnchorIds.has(anchorId), `${file} resume label anchor`).toBe(true);
      }
    }
  });

  it("keeps Transaction and TimeGroup coverage claims backed by actual semantics", () => {
    const transactionDoc = fixtures.get("03_transactions.tcd.json")!;
    const richTransaction = transactionDoc.transactions.find(({ id }) => id === "txn.read")!;
    expect(richTransaction).toMatchObject({ category: "memory-read", style: { emphasis: "primary" }, metadata: { protocol: "example-bus" }, links: { documentation: expect.any(String) } });
    expect(richTransaction.phases).toHaveLength(3);
    expect(richTransaction.linkedSignals).toContain("sig.addr");
    expect(transactionDoc.transactions.some(({ groupId }) => !groupId)).toBe(true);
    expect(transactionDoc.transactions.some(({ groupId }) => groupId === "ungrouped")).toBe(true);
    for (const feature of ["category", "style", "metadata"]) expect(matrix.transactionFeatures?.[feature]).toContain("03_transactions.tcd.json");

    const timeGroupDoc = fixtures.get("04_timegroups_bookmarks.tcd.json")!;
    const axisBreak = timeGroupDoc.timeGroups.find(({ id }) => id === "timegroup.fold")!;
    const compactFold = timeGroupDoc.timeGroups.find(({ id }) => id === "timegroup.compact")!;
    expect(axisBreak.presentation).toMatchObject({ collapsed: true, foldStyle: "axis-break", resumeLabelAnchorId: "label.resume" });
    expect(compactFold.presentation).toMatchObject({ collapsed: true, foldStyle: "compact" });
    expect(timeGroupDoc.timeGroups.find(({ id }) => id === "timegroup.parent")?.id).toBe(axisBreak.parentId);
    expect(timeGroupDoc.timeline.labelAnchors).toContainEqual(expect.objectContaining({ id: "label.resume", source: axisBreak.end, ownerTimeGroupId: axisBreak.id }));
    expect(timeGroupDoc.transactions.some(({ start, end }) => start < axisBreak.end && end > axisBreak.start)).toBe(true);
    expect(timeGroupDoc.bookmarks.some(({ start }) => start === timeGroupDoc.timeline.cycleCount - 1)).toBe(true);
    const clock = timeGroupDoc.signals.find(({ id }) => id === timeGroupDoc.timeline.referenceClock)!;
    expect(clock.type).toBe("clock");
    expect(clock.generator.suppressedPeriods).toContain(12);
    expect(clock.enable?.some(({ start }) => start < axisBreak.end && start > axisBreak.start)).toBe(true);
    for (const feature of ["nestedParent", "axisBreak", "compactFold", "resumeLabelAnchor", "terminalBoundary"]) expect(matrix.timeGroupFeatures?.[feature]).toContain("04_timegroups_bookmarks.tcd.json");
  });

  it("keeps the reset-era active packs intact under old/ and forbids active JSON elsewhere", () => {
    const archive = path.join(root, "old/pre-reset-2026-10-02");
    expect(fs.readdirSync(archive).sort()).toEqual(["acceptance-397", "acceptance-429", "current-v2", "golden-feature-coverage", "golden-protocol", "showcase"]);
    const jsonFiles: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".tcd.json")) jsonFiles.push(path.relative(root, full).replaceAll("\\", "/"));
      }
    };
    walk(root);
    for (const file of jsonFiles) expect(file, "active sample JSON must live only in current/ or performance/; all others must be under old/").toMatch(/^(current|performance|old)\//);
    expect(jsonFiles.filter((file) => file.startsWith("current/")).sort()).toEqual([...fixtures.keys()].sort().map((file) => `current/${file}`));
  });
});
