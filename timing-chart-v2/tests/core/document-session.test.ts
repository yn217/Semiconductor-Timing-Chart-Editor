import { describe, expect, it } from "vitest";
import { DocumentSession } from "@timing-chart-v2/core";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("DocumentSession atomic Open/Save", () => {
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
    const first = session.save();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(session.open(first.text).ok).toBe(true);
    const second = session.save();
    expect(second).toEqual(first);
  });
});
