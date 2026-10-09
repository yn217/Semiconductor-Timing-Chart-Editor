import { describe, expect, it } from "vitest";
import { newPhaseUid, startOrder, stripPhaseUid, toDraftPhases, validatePhases } from "../../apps/editor/src/transaction-phase-model.js";
import type { TransactionPhaseId } from "@timing-chart-v2/schema";
const phaseA = "phase_a" as TransactionPhaseId;
const phaseB = "phase_b" as TransactionPhaseId;

describe("#751 Phase draft model", () => {
  it("keeps preserved source identity for committed rows and fresh uids for new rows", () => {
    const draft = toDraftPhases([{ id: phaseA, name: "A", start: 0, end: 2 }, { id: phaseB, name: "B", start: 2, end: 4 }]);
    expect(draft.map((phase) => phase.uid)).toEqual([phaseA, phaseB]);
    expect(newPhaseUid()).not.toBe(newPhaseUid());
    expect(stripPhaseUid(draft[0]!)).toEqual({ id: phaseA, name: "A", start: 0, end: 2 });
  });

  it("orders by Start time (then End, then uid) regardless of edit order, while uids stay attached to their row", () => {
    const draft = toDraftPhases([{ id: phaseA, name: "A", start: 0, end: 2 }, { id: phaseB, name: "B", start: 2, end: 4 }]);
    const edited = draft.map((phase) => (phase.uid === phaseB ? { ...phase, start: 0, end: 1 } : phase)); // B now starts before A
    const ordered = [...edited].sort(startOrder);
    expect(ordered.map((phase) => phase.uid)).toEqual([phaseB, phaseA]);
    // Deleting the displayed-first row removes B (by uid), not "index 0 of the original array".
    expect(edited.filter((phase) => phase.uid !== ordered[0]!.uid).map((phase) => phase.name)).toEqual(["A"]);
  });

  it("validates once over source cycles with structured codes and no misleading integer-cycle wording", () => {
    const range = { start: 0, end: 8 };
    const ok = validatePhases([{ name: "A", start: 0, end: 4, uid: "c0" }, { name: "B", start: 4, end: 8, uid: "c1" }], range, 1);
    expect(ok.problems).toEqual([]);
    const bad = validatePhases([{ name: " ", start: 0, end: 4, uid: "c0" }, { name: "B", start: 6, end: 6, uid: "c1" }, { name: "C", start: 7, end: 12, uid: "c2" }], range, 4);
    expect(bad.problems.map((problem) => problem.code)).toEqual(expect.arrayContaining(["PHASE_NAME_REQUIRED", "PHASE_EMPTY_RANGE", "PHASE_OUT_OF_RANGE"]));
    expect(bad.blocking?.severity).toBe("error");
    for (const problem of bad.problems) expect(problem.message).not.toMatch(/integer-cycle/i);
    // TC presentation (4 cycles per TC): messages speak TC, not raw cycles.
    expect(bad.problems.find((problem) => problem.code === "PHASE_OUT_OF_RANGE")?.message).toContain("TC");
    expect(validatePhases([], range, 1).status?.code).toBe("PHASES_NONE");
    expect(validatePhases([{ name: "A", start: 0, end: 4 }, { name: "B", start: 3, end: 8 }], range, 1).problems.map((problem) => problem.code)).toContain("PHASE_OVERLAP");
    expect(validatePhases([{ name: "A", start: 0, end: 3 }], range, 1).status?.message).toBe("Uncovered time: 5 cycles");
  });
});
