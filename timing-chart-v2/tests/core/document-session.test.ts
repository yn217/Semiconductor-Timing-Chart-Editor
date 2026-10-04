import { describe, expect, it } from "vitest";
import { DocumentSession } from "@timing-chart-v2/core";
import { isTrustedParsedCanonicalDocument, parseDocument } from "@timing-chart-v2/schema";
import { DOCUMENT_RESOURCE_BUDGET } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("DocumentSession atomic Open/Save", () => {
  it("preserves structurally shared frozen branches on a local commit", () => {
    const session = new DocumentSession(canonicalFixture());
    const before = session.getSnapshot();
    const next = { ...before.document, document: { ...before.document.document, title: "Local edit" } };
    const after = session.commit(next, before.revision);
    expect(after.document.signals).toBe(before.document.signals);
    expect(after.document.signalGroups).toBe(before.document.signalGroups);
    expect(after.document.document).not.toBe(before.document.document);
    expect(Object.isFrozen(after.document.document)).toBe(true);
  });

  it("accepts only a structurally isolated signal rename through the incremental commit boundary", () => {
    const session = new DocumentSession(canonicalFixture());
    const before = session.getSnapshot();
    const beforeMetrics = session.metrics();
    const original = before.document.signals[1]!;
    const renamed = { ...original, name: "RENAMED", display: { ...original.display, name: "RENAMED" } };
    const signals = [...before.document.signals];
    signals[1] = renamed;
    const after = session.commitSignalRename({ ...before.document, signals }, before.revision, original.id);

    expect(after.document.signals[1]?.name).toBe("RENAMED");
    expect(after.document.signals[0]).toBe(before.document.signals[0]);
    expect(after.document.signalGroups).toBe(before.document.signalGroups);
    expect(session.metrics()).toEqual({ validationRuns: beforeMetrics.validationRuns + 1, commits: beforeMetrics.commits + 1 });
    expect(Object.isFrozen(renamed)).toBe(true);
    expect(Object.isFrozen(renamed.display)).toBe(true);
  });

  it("rejects incremental rename candidates that also alter canonical semantics", () => {
    const session = new DocumentSession(canonicalFixture());
    const before = session.getSnapshot();
    const beforeMetrics = session.metrics();
    const original = before.document.signals[1]!;
    const renamed = { ...original, name: "RENAMED", display: { ...original.display, name: "RENAMED" }, values: [] };
    const signals = [...before.document.signals];
    signals[1] = renamed;

    expect(() => session.commitSignalRename({ ...before.document, signals }, before.revision, original.id)).toThrow(/changed fields outside/);
    expect(session.getSnapshot()).toBe(before);
    expect(session.metrics()).toEqual({ validationRuns: beforeMetrics.validationRuns + 1, commits: beforeMetrics.commits });
  });

  it("accepts only a structurally isolated Signal role change through the incremental commit boundary", () => {
    const session = new DocumentSession(canonicalFixture());
    const before = session.getSnapshot();
    const beforeMetrics = session.metrics();
    const original = before.document.signals[1]!;
    const changed = { ...original, role: original.role === "input" ? "output" as const : "input" as const };
    const signals = [...before.document.signals];
    signals[1] = changed;
    const after = session.commitSignalRoleChange({ ...before.document, signals }, before.revision, original.id);

    expect(after.document.signals[1]?.role).toBe(changed.role);
    expect(after.document.signals[0]).toBe(before.document.signals[0]);
    expect(after.document.signalGroups).toBe(before.document.signalGroups);
    expect(session.metrics()).toEqual({ validationRuns: beforeMetrics.validationRuns + 1, commits: beforeMetrics.commits + 1 });
    expect(Object.isFrozen(changed)).toBe(true);
  });

  it("rejects incremental role candidates that also alter validation-sensitive semantics", () => {
    const session = new DocumentSession(canonicalFixture());
    const before = session.getSnapshot();
    const beforeMetrics = session.metrics();
    const original = before.document.signals[1]!;
    const changed = { ...original, role: "output" as const, values: [] };
    const signals = [...before.document.signals];
    signals[1] = changed;

    expect(() => session.commitSignalRoleChange({ ...before.document, signals }, before.revision, original.id)).toThrow(/changed fields outside/);
    expect(session.getSnapshot()).toBe(before);
    expect(session.metrics()).toEqual({ validationRuns: beforeMetrics.validationRuns + 1, commits: beforeMetrics.commits });
  });

  it("accepts a validated parse handoff without a second validation or deep clone", () => {
    const parsed = parseDocument(JSON.stringify(canonicalFixture()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const session = new DocumentSession(parsed);
    expect(session.metrics()).toEqual({ validationRuns: 0, commits: 0 });
    expect(session.getSnapshot().document).toBe(parsed.document);
    expect(Object.isFrozen(session.getSnapshot().document)).toBe(true);
    expect(Object.isFrozen(session.getSnapshot().document.signals)).toBe(true);
  });

  it("does not trust a forgeable validated boolean outside the parser", () => {
    const forged = { ok: true, document: canonicalFixture(), warnings: [], validated: true } as never;
    expect(isTrustedParsedCanonicalDocument(forged)).toBe(false);
    expect(() => new DocumentSession(forged)).toThrow();
  });

  it("replaces once on valid Open and returns a full-document render contract", () => {
    const session = new DocumentSession(canonicalFixture());
    const next = { ...canonicalFixture(), document: { ...canonicalFixture().document, title: "Opened" } };
    const result = session.open(next);
    expect(result).toMatchObject({ ok: true, fullDocumentReplace: true, resetDocumentTransientState: true });
    expect(session.getSnapshot()).toMatchObject({ revision: 1, document: { document: { title: "Opened" } } });
    expect(Object.isFrozen(session.getSnapshot().document)).toBe(true);
  });

  it.each([
    ["syntax", "{]"],
    ["future", { ...canonicalFixture(), formatVersion: 99 }],
    ["invalid", { ...canonicalFixture(), signalGroups: [] }],
  ])("preserves the current document on rejected %s Open", (_name, input) => {
    const session = new DocumentSession(canonicalFixture());
    const before = session.getSnapshot();
    const result = session.open(input);
    expect(result.ok).toBe(false);
    expect(session.getSnapshot()).toBe(before);
    expect(session.getSnapshot().revision).toBe(0);
  });

  it("saves deterministically and reopens without semantic change", () => {
    const session = new DocumentSession(canonicalFixture());
    const beforeMetrics = session.metrics();
    const first = session.save();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(session.metrics()).toEqual(beforeMetrics);
    expect(session.open(first.text).ok).toBe(true);
    const second = session.save();
    expect(second).toEqual(first);
  });

  it("rejects a product-budget overflow at the canonical commit boundary atomically", () => {
    const base = canonicalFixture();
    const session = new DocumentSession({
      ...base,
      timeline: { ...base.timeline, cycleCount: DOCUMENT_RESOURCE_BUDGET.cycleCount, end: DOCUMENT_RESOURCE_BUDGET.cycleCount },
    });
    const before = session.getSnapshot();
    expect(() => session.commit({
      ...before.document,
      timeline: { ...before.document.timeline, cycleCount: DOCUMENT_RESOURCE_BUDGET.cycleCount + 1, end: DOCUMENT_RESOURCE_BUDGET.cycleCount + 1 },
    }, before.revision)).toThrowError(/RESOURCE_LIMIT_EXCEEDED/);
    expect(session.getSnapshot()).toBe(before);
    expect(session.metrics()).toEqual({ validationRuns: 2, commits: 0 });
  });
});
