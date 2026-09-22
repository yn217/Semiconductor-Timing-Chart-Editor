import { describe, expect, it } from "vitest";
import { migrateDocument } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical";

describe("older v2 files without later additive collections still open", () => {
  it("defaults a missing annotationGroups to [] and keeps everything else", () => {
    const { annotationGroups: _dropped, ...older } = structuredClone(canonicalFixture()) as Record<string, unknown> & { annotationGroups?: unknown };
    expect("annotationGroups" in older).toBe(false);
    const migrated = migrateDocument(older);
    expect(migrated).toBeDefined();
    expect(migrated!.document.annotationGroups).toEqual([]);
    expect(migrated!.document.signals.length).toBeGreaterThan(0);
  });
  it("does not touch a document that already has annotationGroups", () => {
    const withGroups = { ...structuredClone(canonicalFixture()), annotationGroups: [{ id: "ag1", name: "G", annotationIds: [] }] } as never;
    expect(migrateDocument(withGroups)!.document.annotationGroups).toHaveLength(1);
  });
});
