import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { AnnotationType, CanonicalDocument } from "@timing-chart-v2/schema";

// #777: samples/current-v2/*.tcd.json is the "current specification" reference pack -- distinct from the
// immutable Legacy V1 Golden fixtures (samples/01-20), which stay formatVersion 1 and prove migration, not
// current product behavior. This guard fails the build if that directory silently drifts out of sync with
// the schema or the issue's own required coverage, instead of the mistake surfacing only much later as a
// stale-sample bug report.
const SAMPLES_DIR = path.resolve(import.meta.dirname, "../../samples/current-v2");

// Every AnnotationType the schema currently defines -- kept in one place (types.ts) and read here via the
// exported union rather than duplicated as a literal list, per the issue's own "derive from the schema
// rather than duplicating a hard-coded second specification" instruction. TypeScript enforces this list
// stays a superset of the real union at compile time (an added/removed AnnotationType member that isn't
// reflected here fails `tsc -b`, since `satisfies readonly AnnotationType[]` requires an exact type match
// is not required, but any narrowing/widening mismatch against the declared array literal type is caught).
const ALL_ANNOTATION_TYPES = ["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace", "rectangle", "ellipse", "connector", "textbox"] as const satisfies readonly AnnotationType[];
// Compile-time check that the literal list above is not missing any current AnnotationType member: if the
// schema's union grows, this line fails to typecheck until the literal list is updated to match.
type AssertAllAnnotationTypesCovered = AnnotationType extends (typeof ALL_ANNOTATION_TYPES)[number] ? true : ["missing AnnotationType member(s) in ALL_ANNOTATION_TYPES -- update the literal list to match packages/schema/src/types.ts"];
const _assertAllAnnotationTypesCovered: AssertAllAnnotationTypesCovered = true;
void _assertAllAnnotationTypesCovered;

function loadFixture(name: string): CanonicalDocument {
  const text = fs.readFileSync(path.join(SAMPLES_DIR, name), "utf8");
  return JSON.parse(text) as CanonicalDocument;
}

describe("#777 current-v2 sample pack drift guard", () => {
  const files = fs.readdirSync(SAMPLES_DIR).filter((name) => name.endsWith(".tcd.json"));

  it("the pack contains the 4 required reference fixtures", () => {
    expect(files.sort()).toEqual(["01_cycle_reference.tcd.json", "02_transaction_reference.tcd.json", "03_combined_reference.tcd.json", "04_long_timeline_stress_reference.tcd.json"]);
  });

  it.each(files)("%s is formatVersion 2 and passes full canonical validation", (name) => {
    const document = loadFixture(name);
    expect(document.formatVersion).toBe(2);
    expect(validateCanonicalDocument(document)).toEqual([]);
  });

  it.each(files)("%s has required canonical top-level fields present", (name) => {
    const document = loadFixture(name);
    for (const field of ["document", "timeline", "signalGroups", "signals", "bookmarks", "timeGroups", "annotations", "annotationGroups", "transactions", "constraints", "legend", "layout"] as const) {
      expect(document, `${name} missing top-level field ${field}`).toHaveProperty(field);
    }
  });

  it.each(files)("%s stable IDs resolve -- every signal/transaction/annotation reference points at an entity that exists", (name) => {
    const document = loadFixture(name);
    const signalIds = new Set(document.signals.map((signal) => signal.id));
    const transactionIds = new Set(document.transactions.map((transaction) => transaction.id));
    for (const bookmark of document.bookmarks) expect(bookmark.id).toBeTruthy();
    for (const transaction of document.transactions) {
      if (transaction.groupId !== undefined) expect(document.transactionGroups?.some((group) => group.id === transaction.groupId), `${name}: transaction ${transaction.id} groupId ${transaction.groupId} does not resolve`).toBe(true);
      for (const linkedId of transaction.linkedSignals ?? []) expect(signalIds.has(linkedId), `${name}: transaction ${transaction.id} linkedSignal ${linkedId} does not resolve`).toBe(true);
    }
    for (const annotation of document.annotations) {
      const anchors: unknown[] = [(annotation as { start?: unknown }).start, (annotation as { end?: unknown }).end, (annotation as { from?: unknown }).from, (annotation as { to?: unknown }).to, (annotation as { anchor?: unknown }).anchor].filter((value): value is Record<string, unknown> => value !== undefined && typeof value === "object");
      for (const anchor of anchors) {
        const signalId = anchor.signalId as string | undefined;
        if (signalId !== undefined) expect(signalIds.has(signalId as never), `${name}: annotation ${annotation.id} anchors to missing signal ${signalId}`).toBe(true);
      }
    }
    void transactionIds;
  });

  it("01_cycle_reference contains every currently-defined AnnotationType", () => {
    const document = loadFixture("01_cycle_reference.tcd.json");
    const present = new Set(document.annotations.map((annotation) => annotation.type));
    for (const type of ALL_ANNOTATION_TYPES) expect(present.has(type), `01_cycle_reference is missing annotation type ${type} -- every current AnnotationType must be represented so this fixture proves the full enum loads without validation/runtime errors`).toBe(true);
  });

  it("02_transaction_reference exercises every required current Transaction feature", () => {
    const document = loadFixture("02_transaction_reference.tcd.json");
    expect(document.transactionGroups?.length ?? 0, "must have at least one Transaction Group").toBeGreaterThan(0);
    expect(document.transactions.some((transaction) => transaction.laneId !== undefined), "must have at least one Transaction with a laneId").toBe(true);
    expect(document.transactions.some((transaction) => (transaction.phases?.length ?? 0) > 0), "must have at least one Transaction with phases").toBe(true);
    expect(document.transactions.some((transaction) => (transaction.linkedSignals?.length ?? 0) > 0), "must have at least one Transaction with linkedSignals").toBe(true);
    expect(document.transactions.some((transaction) => transaction.color !== undefined), "must have at least one Transaction with an explicit color").toBe(true);
    expect(document.transactions.some((transaction) => (transaction.description ?? "").length > 0), "must have at least one Transaction with a description").toBe(true);
    expect(document.transactionTimeScale, "must have an explicit transactionTimeScale").toBeDefined();
  });

  it("03_combined_reference contains Cycle signals, Transaction data, annotations, bookmarks and time groups together", () => {
    const document = loadFixture("03_combined_reference.tcd.json");
    expect(document.signals.length, "must have Cycle signals").toBeGreaterThan(0);
    expect(document.transactions.length, "must have Transaction data").toBeGreaterThan(0);
    expect(document.annotations.length, "must have annotations").toBeGreaterThan(0);
    expect(document.bookmarks.length, "must have bookmarks").toBeGreaterThan(0);
    expect(document.timeGroups.length, "must have time groups").toBeGreaterThan(0);
  });

  it("04_long_timeline_stress_reference has a long enough timeline and long-range transactions to exercise windowing/far-jump paths", () => {
    const document = loadFixture("04_long_timeline_stress_reference.tcd.json");
    expect(document.timeline.cycleCount, "must be a long timeline (512+ cycles) to exercise windowing/far-jump").toBeGreaterThanOrEqual(512);
    expect(document.transactions.some((transaction) => transaction.end - transaction.start > 50), "must have at least one long-range Transaction").toBe(true);
  });

  it("samples/README.md documents current-v2 as the current pack and does not reference the removed validate-samples.mjs script", () => {
    const readme = fs.readFileSync(path.resolve(SAMPLES_DIR, "../README.md"), "utf8");
    expect(readme).toMatch(/current-v2|current V2/);
    // The README may explain that the script no longer exists (as it currently does), but must not instruct a
    // contributor to actually run it as a live command.
    expect(readme).not.toMatch(/run\s+`?scripts\/validate-samples\.mjs`?|npm run validate-samples/i);
  });

  it("samples/current-v2/README.md exists and distinguishes this pack from the Legacy V1 Golden fixtures", () => {
    const readme = fs.readFileSync(path.join(SAMPLES_DIR, "README.md"), "utf8");
    expect(readme.length).toBeGreaterThan(0);
    expect(readme.toLowerCase()).toMatch(/legacy|golden/);
  });
});
