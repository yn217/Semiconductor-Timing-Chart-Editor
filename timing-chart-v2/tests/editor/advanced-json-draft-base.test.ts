import { describe, expect, it } from "vitest";
import { advancedJsonDraftStaleReason, captureAdvancedJsonDraftBase } from "../../apps/editor/src/advanced-json-draft-base.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Advanced JSON draft base identity", () => {
  const makeContext = (document = canonicalFixture(), revision = 4, documentEpoch = 2, projectionGeneration = 3) => ({ document, revision, documentEpoch, projectionGeneration });

  it("rejects a whole-document draft after any canonical revision or document/projection replacement", () => {
    const base = makeContext();
    const draft = captureAdvancedJsonDraftBase("document", base, undefined);
    expect(advancedJsonDraftStaleReason(draft, makeContext(base.document, 5))).toContain("document changed");
    expect(advancedJsonDraftStaleReason(draft, makeContext(base.document, 4, 3))).toContain("document was replaced");
    expect(advancedJsonDraftStaleReason(draft, makeContext(base.document, 4, 2, 4))).toContain("Scenario changed");
    expect(advancedJsonDraftStaleReason(draft, base)).toBeUndefined();
  });

  it("allows unrelated canonical edits for Selected Object while targeting its stable ID", () => {
    const base = makeContext();
    const selected = base.document.signals[0]!;
    const draft = captureAdvancedJsonDraftBase("selected", base, { kind: "signal", id: selected.id, value: selected });
    const changedOtherSignal = { ...base.document.signals[1]!, name: "unrelated entity change" };
    const currentDocument = { ...base.document, signals: [selected, changedOtherSignal] };
    expect(advancedJsonDraftStaleReason(draft, makeContext(currentDocument, 5))).toBeUndefined();
  });

  it("rejects same-object edits and deletion even when the view selection has moved elsewhere", () => {
    const base = makeContext();
    const selected = base.document.signals[1]!;
    const draft = captureAdvancedJsonDraftBase("selected", base, { kind: "signal", id: selected.id, value: selected });
    const edited = { ...selected, name: "newer edit" };
    const changedDocument = { ...base.document, signals: [base.document.signals[0]!, edited] };
    expect(advancedJsonDraftStaleReason(draft, makeContext(changedDocument, 5))).toContain("selected object was edited");
    const deletedDocument = { ...base.document, signals: [base.document.signals[0]!] };
    expect(advancedJsonDraftStaleReason(draft, makeContext(deletedDocument, 5))).toContain("no longer exists");
  });
});
