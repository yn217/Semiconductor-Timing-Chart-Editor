import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type EpochOwner = { readonly owner: string; readonly file: string; readonly markers: readonly RegExp[] };

const workspace = resolve(import.meta.dirname, "../..");
const owners: readonly EpochOwner[] = [
  {
    owner: "document replacement lifecycle",
    file: "apps/editor/src/application/use-document-lifecycle.ts",
    markers: [/documentEpoch\.advance\(\)/, /applyReplacement/],
  },
  {
    owner: "timeline presentation reset owner",
    file: "apps/editor/src/workspace/use-timeline-presentation-state.ts",
    markers: [/resetForDocument = useCallback/, /setCollapsedGroupIds\(empty\)/],
  },
  {
    owner: "entity editor and inspector drafts",
    file: "apps/editor/src/editor-secondary-surfaces.tsx",
    markers: [/input\.documentEpoch/, /key=\{`\$\{input\.documentEpoch\}/],
  },
  {
    owner: "transaction group and drag state",
    file: "apps/editor/src/runtime/transaction-lanes.tsx",
    markers: [/documentEpoch/, /drag.documentEpoch/],
  },
  {
    // #759: Group disclosure moved out of TransactionLanes/TransactionTree into one workspace-level owner.
    owner: "transaction group disclosure",
    file: "apps/editor/src/workspace/use-transaction-disclosure.ts",
    markers: [/documentEpoch/, /setCollapsed\(new Set\(\)\)/],
  },
  {
    // #763: unapplied Phase drafts are document-relative; a DocumentEpoch change drops them all.
    owner: "retained transaction phase drafts",
    file: "apps/editor/src/editor-secondary-surfaces.tsx",
    markers: [/clearAllPhaseDrafts\(\)/, /\[input\.documentEpoch\]/],
  },
  {
    owner: "bookmark selection state",
    file: "apps/editor/src/application/use-editor-actions.ts",
    markers: [/input\.documentEpoch/, /selectedBookmarkId/],
  },
  {
    // #772: unapplied Bookmark drafts are document-relative; a DocumentEpoch change drops them all (same owner as #763's Phase drafts).
    owner: "retained bookmark drafts",
    file: "apps/editor/src/editor-secondary-surfaces.tsx",
    markers: [/clearAllBookmarkDrafts\(\)/, /\[input\.documentEpoch\]/],
  },
  {
    owner: "document-relative UI reset",
    file: "apps/editor/src/minimal-cycle-view.tsx",
    markers: [/runtime\.documentEpoch\.current\(\)/, /setContextMenu\(undefined\)/, /setPinnedBottomSelection\(undefined\)/],
  },
];

describe("document-relative transient state ownership", () => {
  it("keeps every inventoried owner connected to the shared DocumentEpoch contract", () => {
    for (const entry of owners) {
      const source = readFileSync(resolve(workspace, entry.file), "utf8");
      for (const marker of entry.markers) expect(source, `${entry.owner}: ${entry.file}`).toMatch(marker);
    }
    expect(owners.map((entry) => entry.owner)).toEqual(expect.arrayContaining([
      "document replacement lifecycle",
      "timeline presentation reset owner",
      "entity editor and inspector drafts",
      "transaction group and drag state",
      "transaction group disclosure",
      "retained transaction phase drafts",
      "bookmark selection state",
      "retained bookmark drafts",
      "document-relative UI reset",
    ]));
  });
  it("resets timeline presentation once at document replacement without duplicate publication", () => {
    const source = readFileSync(resolve(workspace, "apps/editor/src/workspace/use-timeline-presentation-state.ts"), "utf8");
    const reset = source.slice(source.indexOf("resetForDocument = useCallback"), source.indexOf("const toggleCollapsedGroup"));
    expect(reset).not.toContain("applyCollapsedGroupsRef.current");
    expect(reset).toMatch(/collapsedGroupIdsRef\.current\.size\s*>\s*0/);
    expect(reset).toMatch(/timelineRangeRef\.current\.start\s*!==\s*nextRange\.start/);
    expect(reset).toMatch(/if \(rangeSelectionActiveRef\.current\)/);
    expect(reset).toMatch(/selectedCycleRef\.current\s*!==\s*0/);
    expect(source).not.toContain("input.documentEpoch");
    expect(source).toMatch(/resetCollapsedGroups = useCallback\(\(\) => \{\s*if \(collapsedGroupIdsRef\.current\.size === 0\) return;/);
    expect(source).toContain("applyCollapsedGroupsRef.current(stable)");
    const controller = readFileSync(resolve(workspace, "apps/editor/src/runtime/timeline-surface-controller.ts"), "utf8");
    const replacement = controller.slice(controller.indexOf("applyReplacement: ({ document: canonicalDocument"), controller.indexOf("const onViewportKeyDown", controller.indexOf("applyReplacement: ({ document: canonicalDocument")));
    expect(replacement).toContain("resetForDocument(canonicalDocument.timeline.cycleCount)");
    expect(replacement).not.toContain("setTimelineRange(replacementRange)");
    expect(replacement).not.toContain("setSelectedCycle(0)");
    expect(replacement).not.toContain("resetCollapsedGroups()");
  });
  it("does not invalidate Transaction presentation from Cycle-only reference geometry readiness", () => {
    const source = readFileSync(resolve(workspace, "apps/editor/src/runtime/timeline-surface-controller.ts"), "utf8");
    const callback = source.slice(source.indexOf("onReferenceGeometryReady: () => {"), source.indexOf("invalidateSnapIndex:", source.indexOf("onReferenceGeometryReady: () => {")));
    expect(callback).toContain("requestTransactionPresentationRefresh()");
    const refreshPolicy = readFileSync(resolve(workspace, "apps/editor/src/runtime/transaction-presentation-refresh.ts"), "utf8");
    expect(refreshPolicy).toMatch(/if \(input\.getViewMode\(\) === "Cycle"\) return;/);
    expect(callback).toContain("referenceGeometryReconciled = true");
    expect(callback).toContain("renderer.update(projection)");
  });
  // #743: the failure boundary is commitDocumentReplacement (behaviour tested in tests/editor/document-replacement.test.ts); here we pin that the
  // Canonical and Scenario documents have distinct session replacement APIs; both advance once after replacement succeeds.
  it("advances once after successful canonical or Scenario session replacement", () => {
    const lifecycle = readFileSync(resolve(workspace, "apps/editor/src/application/use-document-lifecycle.ts"), "utf8");
    const boundary = readFileSync(resolve(workspace, "apps/editor/src/application/document-replacement.ts"), "utf8");
    expect(lifecycle).toContain("commitDocumentReplacement(");
    const scenarioStart = lifecycle.indexOf("const replaceScenarioDocument =");
    const scenarioEnd = lifecycle.indexOf("const openText =", scenarioStart);
    expect(scenarioStart).toBeGreaterThan(-1);
    expect(scenarioEnd).toBeGreaterThan(scenarioStart);
    const scenario = lifecycle.slice(scenarioStart, scenarioEnd);
    const canonical = lifecycle.slice(0, scenarioStart) + lifecycle.slice(scenarioEnd);
    expect(canonical.split("documentEpoch.advance()")).toHaveLength(2);
    expect(scenario.split("documentEpoch.advance()")).toHaveLength(2);
    expect(scenario.indexOf("application.replaceScenarioSession(model)")).toBeGreaterThan(-1);
    expect(scenario.indexOf("application.runtime.documentEpoch.advance()")).toBeGreaterThan(scenario.indexOf("application.replaceScenarioSession(model)"));
    expect(scenario.indexOf("applyReplacement({")).toBeGreaterThan(scenario.indexOf("application.runtime.documentEpoch.advance()"));
    expect(lifecycle.indexOf("commitDocumentReplacement(")).toBeLessThan(lifecycle.indexOf("applyReplacement({"));
    const replace = boundary.indexOf("port.replaceSession(");
    const advance = boundary.indexOf("port.advanceEpoch()");
    expect(replace).toBeGreaterThan(-1);
    expect(advance).toBeGreaterThan(replace);
    expect(boundary.split("port.advanceEpoch()")).toHaveLength(2);
  });
});
