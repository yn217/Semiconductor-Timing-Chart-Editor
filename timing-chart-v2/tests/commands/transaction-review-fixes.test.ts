import { describe, expect, it } from "vitest";
import { planCommand, resizeTransactionEdge, transactionResizeRange, type SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, Transaction, TransactionId, TransactionPhase, TransactionPhaseId, CommandId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const CYCLES = 20;
const id = (value: string) => value as CommandId;
const txnId = (value: string) => value as TransactionId;
const phaseId = (value: string) => value as TransactionPhaseId;

function documentWith(transactions: readonly Transaction[]): CanonicalDocument {
  const base = canonicalFixture();
  return { ...base, timeline: { ...base.timeline, end: CYCLES, cycleCount: CYCLES }, transactions };
}

function txn(start: number, end: number, phases?: readonly TransactionPhase[]): Transaction {
  return { id: txnId("txn_t"), name: "T", start, end, ...(phases ? { phases } : {}) } as Transaction;
}

function phase(name: string, start: number, end: number): TransactionPhase {
  return { id: phaseId(`ph_${name}`), name, start, end } as TransactionPhase;
}

function resize(doc: CanonicalDocument, edge: "start" | "end", value: number) {
  return planCommand(doc, { id: id("resize"), type: "transaction.resize", transactionId: txnId("txn_t"), edge, value });
}

function transactionOf(doc: CanonicalDocument): Transaction {
  return doc.transactions.find((item) => item.id === txnId("txn_t"))!;
}

describe("Transaction edge resize: shared range matches the planner", () => {
  const cases: Array<{ label: string; transaction: Transaction }> = [
    { label: "no phases", transaction: txn(4, 12) },
    { label: "edge-attached start phase", transaction: txn(0, 10, [phase("A", 0, 3)]) },
    { label: "gap before first phase", transaction: txn(0, 10, [phase("A", 3, 6)]) },
    { label: "edge-attached end phase", transaction: txn(0, 10, [phase("A", 6, 10)]) },
    { label: "gap after last phase", transaction: txn(0, 10, [phase("A", 2, 5)]) },
    { label: "multiple sorted phases", transaction: txn(0, 12, [phase("A", 0, 3), phase("B", 5, 7), phase("C", 9, 12)]) },
    { label: "unsorted phases", transaction: txn(0, 12, [phase("C", 9, 12), phase("A", 0, 3), phase("B", 5, 7)]) },
  ];

  for (const { label, transaction } of cases) {
    it(`accepts exactly the values in the published range (${label})`, () => {
      const doc = documentWith([transaction]);
      for (const edge of ["start", "end"] as const) {
        const range = transactionResizeRange(transaction, edge, CYCLES);
        for (let value = -1; value <= CYCLES + 1; value += 1) {
          const result = resize(doc, edge, value);
          const inRange = value >= range.min && value <= range.max;
          const accepted = result.ok || result.reason === "no-op";
          expect(accepted, `${edge}=${value} in [${range.min},${range.max}]`).toBe(inRange);
        }
      }
    });
  }
});

describe("Transaction edge resize: start/end preview limits (finding A)", () => {
  it("clamps the start edge short of the first Phase boundary and carries the attached Phase with it", () => {
    const transaction = txn(0, 10, [phase("A", 0, 3)]);
    expect(transactionResizeRange(transaction, "start", CYCLES)).toEqual({ min: 0, max: 2 });
    expect(resizeTransactionEdge(transaction, "start", 4, CYCLES)).toMatchObject({ ok: false, code: "INVALID_TRANSACTION_PHASE" });
    const clamped = resizeTransactionEdge(transaction, "start", 2, CYCLES);
    expect(clamped).toMatchObject({ ok: true, start: 2, end: 10, phases: [{ name: "A", start: 2, end: 3 }] });
    const doc = documentWith([transaction]);
    expect(resize(doc, "start", 4).ok).toBe(false);
    const committed = resize(doc, "start", 2);
    expect(committed.ok).toBe(true);
    expect(transactionOf(committed.ok ? committed.document : doc)).toMatchObject({ start: 2, phases: [{ name: "A", start: 2, end: 3 }] });
  });

  it("clamps the end edge to the last Phase start and carries the attached Phase with it", () => {
    const transaction = txn(0, 10, [phase("A", 6, 10)]);
    expect(transactionResizeRange(transaction, "end", CYCLES)).toEqual({ min: 7, max: CYCLES });
    expect(resizeTransactionEdge(transaction, "end", 6, CYCLES)).toMatchObject({ ok: false, code: "INVALID_TRANSACTION_PHASE" });
    expect(resizeTransactionEdge(transaction, "end", 14, CYCLES)).toMatchObject({ ok: true, end: 14, phases: [{ name: "A", start: 6, end: 14 }] });
  });
});

describe("Transaction edge resize: unsorted phases (finding B)", () => {
  it("resizes the earliest-starting Phase on the start edge, not the first array entry", () => {
    const doc = documentWith([txn(0, 10, [phase("B", 5, 8), phase("A", 0, 3)])]);
    const result = resize(doc, "start", 2);
    expect(result.ok).toBe(true);
    const phases = transactionOf(result.ok ? result.document : doc).phases!;
    expect(phases.find((item) => item.name === "A")).toMatchObject({ start: 2, end: 3 });
    expect(phases.find((item) => item.name === "B")).toMatchObject({ start: 5, end: 8 });
    expect(resize(doc, "start", 3).ok).toBe(false);
  });

  it("resizes the latest-ending Phase on the end edge, not the last array entry", () => {
    const doc = documentWith([txn(0, 10, [phase("A", 6, 10), phase("B", 1, 4)])]);
    const result = resize(doc, "end", 8);
    expect(result.ok).toBe(true);
    const phases = transactionOf(result.ok ? result.document : doc).phases!;
    expect(phases.find((item) => item.name === "A")).toMatchObject({ start: 6, end: 8 });
    expect(phases.find((item) => item.name === "B")).toMatchObject({ start: 1, end: 4 });
  });
});

describe("transaction.setTimeScale ratio must be an integer (finding C)", () => {
  const scaleDoc = (): CanonicalDocument => ({ ...canonicalFixture(), transactionTimeScale: { clockCyclesPerTransactionCycle: 2, majorInterval: 5, minorInterval: 1 } });
  const setScale = (ratio: number): SemanticCommand => ({ id: id("scale"), type: "transaction.setTimeScale", scale: { clockCyclesPerTransactionCycle: ratio, majorInterval: 5, minorInterval: 1 } });

  it("rejects a fractional ratio that the validator would refuse on reopen", () => {
    expect(planCommand(scaleDoc(), setScale(2.5))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("still accepts an integer ratio change", () => {
    expect(planCommand(scaleDoc(), setScale(4)).ok).toBe(true);
  });
});

describe("transaction.update Start/End without explicit Phases (finding D)", () => {
  function update(doc: CanonicalDocument, start: number, end: number) {
    const current = transactionOf(doc);
    return planCommand(doc, { id: id("bottom"), type: "transaction.update", transactionId: txnId("txn_t"), name: current.name, start, end });
  }

  it("moves an edge-attached Phase with the start edge, matching transaction.resize", () => {
    const doc = documentWith([txn(0, 10, [phase("A", 0, 3)])]);
    const bottom = update(doc, 2, 10);
    const drag = resize(doc, "start", 2);
    expect(bottom.ok).toBe(true);
    expect(drag.ok).toBe(true);
    expect(transactionOf(bottom.ok ? bottom.document : doc).phases).toEqual(transactionOf(drag.ok ? drag.document : doc).phases);
  });

  it("moves an edge-attached Phase with the end edge, matching transaction.resize", () => {
    const doc = documentWith([txn(0, 10, [phase("A", 6, 10)])]);
    const bottom = update(doc, 0, 14);
    const drag = resize(doc, "end", 14);
    expect(bottom.ok).toBe(true);
    expect(transactionOf(bottom.ok ? bottom.document : doc).phases).toEqual(transactionOf(drag.ok ? drag.document : doc).phases);
  });

  it("shifts a whole-transaction Phase when both edges move outward", () => {
    const doc = documentWith([txn(0, 10, [phase("A", 0, 10)])]);
    const bottom = update(doc, 2, 12);
    expect(bottom.ok).toBe(true);
    expect(transactionOf(bottom.ok ? bottom.document : doc)).toMatchObject({ start: 2, end: 12, phases: [{ name: "A", start: 2, end: 12 }] });
  });

  it("still rejects a Start/End change that would leave a Phase outside the range", () => {
    const doc = documentWith([txn(0, 10, [phase("A", 2, 4)])]);
    expect(update(doc, 6, 12).ok).toBe(false);
  });

  it("keeps the explicit-Phases path unchanged and still validated", () => {
    const doc = documentWith([txn(0, 10, [phase("A", 2, 4)])]);
    const current = transactionOf(doc);
    const explicit = planCommand(doc, { id: id("explicit"), type: "transaction.update", transactionId: txnId("txn_t"), name: current.name, start: 1, end: 9, phases: [phase("A", 0, 4)] });
    expect(explicit).toMatchObject({ ok: false, reason: "invalid" });
  });
});
