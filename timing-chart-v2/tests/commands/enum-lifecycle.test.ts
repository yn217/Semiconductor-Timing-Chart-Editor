import { describe, expect, it } from "vitest";
import { planCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { parseDocument, serializeValidatedCanonicalDocument, resolveEnumValue, validateCanonicalDocument, type CommandId, type SignalId, type ValueSignal } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const id = (value: string) => value as CommandId;

function enumDocument() {
  const source = canonicalFixture();
  const enumDefinition = { id: "enum.main", name: "Main State", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "WAIT" }] } as const;
  return { ...source, enumDefinitions: [enumDefinition], signals: source.signals.map((signal) => signal.id === "sig_data" ? { ...signal, enumId: enumDefinition.id } : signal) };
}

describe("Enum lifecycle", () => {
  it("creates, edits, assigns, unassigns, and history-round-trips enum definitions through semantic commands", () => {
    const source = canonicalFixture();
    const { width: _width, displayFormat: _displayFormat, ...dataSignal } = source.signals[1] as ValueSignal;
    const stateSignal = { ...dataSignal, type: "state", values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] } as const;
    const document = { ...source, signals: [source.signals[0]!, stateSignal] };
    const session = new CommandHistorySession(document);
    const definition = { id: "enum.mode", name: "Mode", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "RUN" }] } as const;
    expect(session.execute({ id: id("enum_create"), type: "enum.create", definition }).ok).toBe(true);
    const assignment = session.execute({ id: id("enum_assign"), type: "signal.updateProperties", signalId: stateSignal.id, name: stateSignal.name, role: stateSignal.role, enumId: definition.id });
    expect(assignment).toMatchObject({ ok: true, changeSet: { waveSemantics: [stateSignal.id], geometryLocal: [stateSignal.id] } });
    const enumEdit = session.execute({ id: id("enum_edit"), type: "enum.update", enumId: definition.id, name: "Operating Mode", entries: [{ value: 0, label: "STOP" }, { value: 1, label: "ACTIVE" }] });
    expect(enumEdit).toMatchObject({ ok: true, changeSet: { waveSemantics: [stateSignal.id], geometryLocal: [stateSignal.id] } });
    expect(session.getSnapshot().document.signals[1]).toMatchObject({ enumId: "enum.mode", values: stateSignal.values });
    const saved = serializeValidatedCanonicalDocument(session.getSnapshot().document);
    const reopened = parseDocument(saved);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.document.signals[1]).toMatchObject({ enumId: "enum.mode", values: stateSignal.values });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.enumDefinitions?.[0]?.name).toBe("Mode");
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.enumDefinitions?.[0]?.entries[1]).toEqual({ value: 1, label: "ACTIVE" });
    expect(session.execute({ id: id("enum_unassign"), type: "signal.updateProperties", signalId: stateSignal.id, name: stateSignal.name, role: stateSignal.role, clearEnumId: true }).ok).toBe(true);
    expect(session.execute({ id: id("enum_delete"), type: "enum.delete", enumId: definition.id }).ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals[1]).not.toHaveProperty("enumId");
    expect(session.getSnapshot().document.enumDefinitions?.[0]?.id).toBe(definition.id);
  });

  it("rejects invalid enum assignments and definitions without mutating Canonical or History", () => {
    const source = canonicalFixture(); const session = new CommandHistorySession(source); const before = session.getSnapshot();
    const wrongType = session.execute({ id: id("enum_bus_assign"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA", role: "internal", enumId: "enum.missing" });
    expect(wrongType).toMatchObject({ ok: false, reason: "invalid" });
    const malformed = session.execute({ id: id("enum_bad_create"), type: "enum.create", definition: { id: "enum.bad", name: "Bad", entries: [{ value: 1, label: "ONE" }, { value: "1", label: "TWO" }] } });
    expect(malformed).toMatchObject({ ok: false, reason: "invalid" });
    const existingEnum = { ...source, enumDefinitions: [{ id: "enum.exists", name: "Exists", entries: [{ value: 0, label: "ZERO" }] }] } as const;
    const wrongSignalTypeSession = new CommandHistorySession(existingEnum);
    const wrongSignalType = wrongSignalTypeSession.execute({ id: id("enum_wrong_type"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA", role: "internal", enumId: "enum.exists" });
    expect(wrongSignalType).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "INVALID_ENUM_ASSIGNMENT" })] });
    expect(session.getSnapshot().document).toEqual(before.document);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });

  it("renames through history while preserving stable references and round-trips through parser", () => {
    const source = enumDocument(); const session = new CommandHistorySession(source);
    expect(session.execute({ id: id("enum_rename"), type: "enum.rename", enumId: "enum.main", name: "Renamed" }).ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data" as SignalId)).toHaveProperty("enumId", "enum.main");
    expect(session.undo().ok).toBe(true); expect(session.getSnapshot().document.enumDefinitions![0]!.name).toBe("Main State");
    expect(session.redo().ok).toBe(true); expect(session.getSnapshot().document.enumDefinitions![0]!.name).toBe("Renamed");
    const reopened = parseDocument(serializeValidatedCanonicalDocument(session.getSnapshot().document));
    expect(reopened.ok).toBe(true); if (reopened.ok) expect(resolveEnumValue(reopened.document.enumDefinitions![0], 1)).toBe("WAIT");
  });
  it("rejects deletion while referenced without changing history or document", () => {
    const source = enumDocument(); const session = new CommandHistorySession(source); const before = session.getSnapshot();
    const result = session.execute({ id: id("enum_delete"), type: "enum.delete", enumId: "enum.main" });
    expect(result).toMatchObject({ ok: false, reason: "invalid" }); expect(session.getSnapshot().document).toEqual(before.document); expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });

  it("makes enum semantic uniqueness part of authoritative canonical validation", () => {
    const source = enumDocument();
    const invalid = { ...source, enumDefinitions: [{ ...source.enumDefinitions![0]!, entries: [{ value: 1, label: "ONE" }, { value: "1", label: "STRING_ONE" }] }] };
    expect(validateCanonicalDocument(invalid)).toContainEqual(expect.objectContaining({ code: "INVALID_ENUM_DEFINITION", path: "$.enumDefinitions[0]", entityId: "enum.main" }));
  });
});
