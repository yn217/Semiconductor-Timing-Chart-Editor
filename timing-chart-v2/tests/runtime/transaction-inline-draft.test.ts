import { describe, expect, it } from "vitest";
import { validateTransactionDraft } from "../../apps/editor/src/transaction-editor.js";

describe("Transaction Bottom inline draft validation", () => {
  it("accepts integer timing and keeps phases inside the edited range", () => {
    expect(validateTransactionDraft(8, 64, [{ name: "Read", start: 8, end: 20 }], 160)).toBeUndefined();
  });

  it("rejects invalid timing without a phase mutation policy", () => {
    expect(validateTransactionDraft(64, 8, [], 160)).toContain("Start and End");
    expect(validateTransactionDraft(8, 161, [], 160)).toContain("Start and End");
    expect(validateTransactionDraft(8, 20, [{ name: "Read", start: 7, end: 20 }], 160)).toContain("Phases");
  });

  it("rejects unnamed or non-integer phase ranges", () => {
    expect(validateTransactionDraft(8, 20, [{ name: "", start: 8, end: 12 }], 160)).toContain("Phases");
    expect(validateTransactionDraft(8, 20, [{ name: "Read", start: 8.5, end: 12 }], 160)).toContain("Phases");
  });
});
