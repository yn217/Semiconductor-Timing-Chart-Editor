import { describe, expect, it } from "vitest";
import { planCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { parseDocument, serializeValidatedCanonicalDocument, resolveEnumValue, type CommandId, type SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const id = (value: string) => value as CommandId;

function enumDocument() {
  const source = canonicalFixture();
  const enumDefinition = { id: "enum.main", name: "Main State", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "WAIT" }] } as const;
  return { ...source, enumDefinitions: [enumDefinition], signals: source.signals.map((signal) => signal.id === "sig_data" ? { ...signal, enumId: enumDefinition.id } : signal) };
}

describe("Enum lifecycle", () => {
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
});
