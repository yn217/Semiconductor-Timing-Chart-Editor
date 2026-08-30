import { describe, expect, it } from "vitest";

describe("mechanical visual diagnostics", async () => {
  const { browserHealthFindings, collectDomMetrics, runMechanicalDiagnostics } = await import("../../harness/gui/mechanical-diagnostics.mjs");
  it("emits stable findings for clipping, overlap, duplicate text, and icon alignment", () => {
    const result = runMechanicalDiagnostics({ scenario: "fixture", evidence: ["fixture.png"], elements: [
      { target: "clipped", text: "Long", clientWidth: 10, scrollWidth: 20, rect: { left: 0, right: 20, top: 0, bottom: 10 } },
      { target: "overlap", text: "Same", rect: { left: 5, right: 15, top: 2, bottom: 12 }, iconRect: { left: 0, right: 2 }, buttonRect: { left: 10, right: 20 } },
      { target: "duplicate", text: "Same", rect: { left: 30, right: 40, top: 2, bottom: 12 } },
    ] });
    expect(result.findings.map((finding) => finding.category)).toEqual(expect.arrayContaining(["TEXT_CLIPPING", "OVERLAP", "DUPLICATION", "ICON_ALIGNMENT"]));
    expect(result.findings.every((finding) => finding.scenario === "fixture" && finding.evidence.length === 1)).toBe(true);
  });
  it("does not report allowed overlap or healthy controls", () => {
    const result = runMechanicalDiagnostics({ scenario: "healthy", elements: [
      { target: "icon", text: "OK", clientWidth: 20, scrollWidth: 20, rect: { left: 0, right: 10, top: 0, bottom: 10 }, allowOverlap: true, iconRect: { left: 4, right: 6 }, buttonRect: { left: 0, right: 10 } },
    ] });
    expect(result.findings).toEqual([]);
  });
  it("collects declarative metrics from a browser-like document", () => {
    const node = { textContent: "Workspace", clientWidth: 10, scrollWidth: 20, clientHeight: 10, scrollHeight: 10, getBoundingClientRect: () => ({ left: 1, right: 21, top: 2, bottom: 12, width: 20, height: 10 }), querySelector: () => null };
    const document = { querySelectorAll: () => [node] };
    const metrics = collectDomMetrics(document, [{ selector: ".workspace", target: "Workspace" }]);
    expect(metrics[0]).toMatchObject({ target: "Workspace", clientWidth: 10, scrollWidth: 20, rect: { left: 1, right: 21 } });
  });
  it("reports viewport, baseline, and alignment drift", async () => {
    const { runMechanicalDiagnostics } = await import("../../harness/gui/mechanical-diagnostics.mjs");
    const result = runMechanicalDiagnostics({ scenario: "layout", elements: [
      { target: "outside", rect: { left: -1, right: 10, top: 0, bottom: 10 }, viewport: { width: 10, height: 10 } },
      { target: "baseline-drift", baselineGroup: "labels", baselineY: 8 }, { target: "baseline-ok", baselineGroup: "labels", baselineY: 4 },
      { target: "alignment-drift", alignmentGroup: "icons", alignX: 10 }, { target: "alignment-ok", alignmentGroup: "icons", alignX: 0 },
    ] });
    expect(result.findings.map((finding) => finding.category)).toEqual(expect.arrayContaining(["VIEWPORT_OVERFLOW", "BASELINE", "ALIGNMENT"]));
  });
  it("normalizes browser health errors into findings", async () => {
    const { browserHealthFindings } = await import("../../harness/gui/mechanical-diagnostics.mjs");
    expect(browserHealthFindings({ scenario: "health", consoleErrors: ["boom"], pageErrors: ["crash"], failedResources: ["/asset.js"], evidence: ["health.json"] }).map((finding) => finding.category)).toEqual(["CONSOLE_ERROR", "PAGE_ERROR", "RESOURCE_FAILURE"]);
  });
  it("reports inconsistent icon dimensions within a declared class", async () => {
    const { runMechanicalDiagnostics } = await import("../../harness/gui/mechanical-diagnostics.mjs");
    const result = runMechanicalDiagnostics({ scenario: "icons", elements: [
      { target: "a", iconGroup: "command", iconRect: { left: 0, right: 16, top: 0, bottom: 16 } },
      { target: "b", iconGroup: "command", iconRect: { left: 0, right: 20, top: 0, bottom: 16 } },
    ] });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.category).toBe("ICON_ALIGNMENT");
  });
  it("reports changed regions outside the declared interaction scope", async () => {
    const { unexpectedRegionFindings } = await import("../../harness/gui/mechanical-diagnostics.mjs");
    const findings = unexpectedRegionFindings({ scenario: "undo", changedRegions: ["target", "ribbon"], expectedChange: ["target"], expectedStable: ["ribbon"], evidence: ["after.png"] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ category: "LAYOUT_SHIFT", target: "ribbon", severity: "MAJOR" });
  });
  it("checks visual reversibility as A~=C and B~=D", async () => {
    const { reversibleRegionCheck } = await import("../../harness/gui/mechanical-diagnostics.mjs");
    expect(reversibleRegionCheck({ before: 0.01, after: 0.40, undo: 0.02, redo: 0.41 })).toMatchObject({ beforeUndo: true, afterRedo: true });
    expect(reversibleRegionCheck({ before: 0.01, after: 0.40, undo: 0.20, redo: 0.41 }).beforeUndo).toBe(false);
  });
});
