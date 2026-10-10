import { describe, expect, it } from "vitest";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { describeAIProposalCommands, scopeViolationForProposal, scopeViolationMessage } from "../../apps/editor/src/ai-operation-panel.js";
import { buildTypedProposal, deterministicMockAIProposalProvider } from "../../apps/editor/src/ai-proposal-provider.js";
import { canonicalFixture } from "../fixtures/canonical.js";

const command = (value: Record<string, unknown>): SemanticCommand => ({ id: "cmd_test", ...value }) as unknown as SemanticCommand;

/** The fixture with DATA hidden and one hidden Annotation whose anchor sits on CLK. */
const documentWithHiddenEntities = (): CanonicalDocument => {
  const base = canonicalFixture();
  const annotation = {
    id: "ann_hidden", type: "text", label: "Hidden note", visible: false,
    anchor: { signalId: "sig_clk", cycle: 2, point: "cycle-center" },
  };
  return {
    ...base,
    signals: base.signals.map((signal) => signal.id === "sig_data" ? { ...signal, display: { ...signal.display, visible: false } } : signal),
    annotations: [annotation],
  } as unknown as CanonicalDocument;
};

const currentView = (document: CanonicalDocument, value: Record<string, unknown>) =>
  scopeViolationMessage("current-view", document, command(value), undefined, undefined, undefined, undefined);

describe("Current View scope checks every Signal referenced by a command", () => {
  it("refuses a hidden Signal named inside a nested Annotation anchor", () => {
    const document = documentWithHiddenEntities();
    const message = currentView(document, { type: "annotation.create", annotation: { id: "ann_new", type: "text", label: "N", visible: true, anchor: { signalId: "sig_data", cycle: 1, point: "cycle-center" } } });
    expect(message).toContain("'sig_data' is hidden");
  });

  it("refuses a hidden Signal used as a semantic anchor on an existing Annotation", () => {
    const document = documentWithHiddenEntities();
    expect(currentView(document, { type: "annotation.setAnchor", annotationId: "ann_other", field: "anchor", anchor: { signalId: "sig_data", cycle: 1, point: "cycle-center" } })).toContain("'sig_data' is hidden");
  });

  it("refuses a hidden Ghost Trace source Signal", () => {
    const document = documentWithHiddenEntities();
    expect(currentView(document, { type: "annotation.updateProperties", annotationId: "ann_other", label: "G", visible: true, sourceSignalId: "sig_data", traceOffsetCycles: 1 })).toContain("'sig_data' is hidden");
  });

  it("refuses a hidden Signal used as a Marker vertical-span row", () => {
    const document = documentWithHiddenEntities();
    expect(currentView(document, { type: "annotation.updateVerticalSpan", annotationId: "ann_other", verticalSpan: { mode: "rows", startRowId: "sig_clk", endRowId: "sig_data" } })).toContain("'sig_data' is hidden");
  });

  it("refuses a bulk command that includes a hidden Signal", () => {
    const document = documentWithHiddenEntities();
    expect(currentView(document, { type: "signal.bulkDelete", signalIds: ["sig_clk", "sig_data"] })).toContain("'sig_data' is hidden");
    expect(currentView(document, { type: "signal.bulkRename", updates: [{ signalId: "sig_data", name: "X" }] })).toContain("'sig_data' is hidden");
  });

  it("refuses a hidden Signal referenced by a Transaction link", () => {
    const document = documentWithHiddenEntities();
    expect(currentView(document, { type: "transaction.linkSignal", transactionId: "txn_a", signalId: "sig_data" })).toContain("'sig_data' is hidden");
  });

  it("refuses a command that references a hidden Annotation inside a bulk list", () => {
    const document = documentWithHiddenEntities();
    expect(currentView(document, { type: "annotation.bulkDelete", annotationIds: ["ann_hidden"] })).toContain("'ann_hidden' is hidden");
  });

  it("still allows commands that touch only visible entities or no entity", () => {
    const document = documentWithHiddenEntities();
    expect(currentView(document, { type: "signal.rename", signalId: "sig_clk", name: "CLK2" })).toBeUndefined();
    expect(currentView(document, { type: "annotation.create", annotation: { id: "ann_new", type: "text", label: "N", visible: true, anchor: { signalId: "sig_clk", cycle: 1, point: "cycle-center" } } })).toBeUndefined();
    expect(currentView(document, { type: "timeline.insert", at: 4, count: 2 })).toBeUndefined();
  });

  it("leaves Document scope unrestricted for the same hidden references", () => {
    const document = documentWithHiddenEntities();
    expect(scopeViolationMessage("document", document, command({ type: "signal.bulkDelete", signalIds: ["sig_data"] }), undefined, undefined, undefined, undefined)).toBeUndefined();
  });
});

describe("Scope is enforced when a proposal is applied, not only when it is previewed", () => {
  it("refuses a proposal built for the whole document once Scope is narrowed to Current View", () => {
    const document = documentWithHiddenEntities();
    const commands = [command({ type: "signal.bulkRename", updates: [{ signalId: "sig_data", name: "X" }] })];
    expect(scopeViolationForProposal("document", document, commands, { selectedSignalId: undefined, selectedGroupId: undefined, selectedAnnotationId: undefined, selectedTransactionId: undefined })).toBeUndefined();
    expect(scopeViolationForProposal("current-view", document, commands, { selectedSignalId: undefined, selectedGroupId: undefined, selectedAnnotationId: undefined, selectedTransactionId: undefined })).toContain("'sig_data' is hidden");
  });

  it("refuses an edit to a non-selected Signal under Selection scope at Apply time", () => {
    const document = documentWithHiddenEntities();
    const commands = [command({ type: "signal.rename", signalId: "sig_clk", name: "CLK2" })];
    expect(scopeViolationForProposal("selection", document, commands, { selectedSignalId: "sig_data" as SignalId, selectedGroupId: undefined, selectedAnnotationId: undefined, selectedTransactionId: undefined })).toContain("outside the Selection scope");
  });
});

describe("Out-of-range magnitudes are refused before a preview exists", () => {
  const document = canonicalFixture();
  const revision = 1;

  it("refuses a typed insert that would grow the timeline past the document cycle budget", () => {
    const result = buildTypedProposal(document, revision, "propose_insert_cycles", { at: 0, count: 1_000_000_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("document limit");
  });

  it("refuses a typed duplicate whose copy would exceed the cycle budget", () => {
    const result = buildTypedProposal(document, revision, "propose_duplicate_range", { start: 0, end: 8, at: 8 });
    expect(result.ok).toBe(true);
    const large = buildTypedProposal({ ...document, timeline: { ...document.timeline, cycleCount: 99_999 } } as CanonicalDocument, revision, "propose_duplicate_range", { start: 0, end: 8, at: 8 });
    expect(large.ok).toBe(false);
  });

  it("refuses a natural-language insert of 99999999999 cycles", () => {
    const result = deterministicMockAIProposalProvider.propose({ document, revision, query: "insert 99999999999 cycles at 0", selectedSignalId: undefined });
    expect(result.ok).toBe(false);
  });

  it("still accepts an in-budget natural-language insert", () => {
    const result = deterministicMockAIProposalProvider.propose({ document, revision, query: "insert 4 cycles at 0", selectedSignalId: undefined });
    expect(result.ok).toBe(true);
  });
});

describe("Natural-language names are not taken from the keyword", () => {
  const document = canonicalFixture();
  const request = (query: string) => ({ document, revision: 1, query, selectedSignalId: undefined, selectedGroupId: "grp_main" as never });

  it("refuses 'create signal named' with no name instead of creating a Signal called 'named'", () => {
    const result = deterministicMockAIProposalProvider.propose(request("create signal named    "));
    expect(result.ok).toBe(false);
  });

  it("refuses 'create group named' with no name", () => {
    const result = deterministicMockAIProposalProvider.propose({ document, revision: 1, query: "create group named    ", selectedSignalId: undefined });
    expect(result.ok).toBe(false);
  });

  it("uses the text after the keyword as the Signal name", () => {
    const result = deterministicMockAIProposalProvider.propose(request("create signal named REQ"));
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.proposal.commands[0] as { signal: { name: string } }).signal.name).toBe("REQ");
  });

  it("uses the text after the keyword as the Group name", () => {
    const result = deterministicMockAIProposalProvider.propose({ document, revision: 1, query: "create group called Control", selectedSignalId: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.proposal.commands[0] as { group: { name: string } }).group.name).toBe("Control");
  });
});

describe("Proposal review titles cover the common command families", () => {
  const document = canonicalFixture();
  const describe1 = (value: Record<string, unknown>) => describeAIProposalCommands(document, [command(value)])[0]!;

  it("names a created Signal and its stable ID", () => {
    const item = describe1({ type: "signal.create", signal: { id: "sig_req", name: "REQ", display: { name: "REQ" } }, targetGroupId: "grp_main", index: 0 });
    expect(item.title).toBe("Create Signal REQ");
    expect(item.detail).toContain("Signal ID sig_req");
  });

  it("lists the changed properties of a Signal update", () => {
    const item = describe1({ type: "signal.updateProperties", signalId: "sig_data", name: "DATA", role: "output", visible: false });
    expect(item.title).toBe("Update Signal DATA");
    expect(item.detail).toContain("role");
    expect(item.detail).toContain("hide");
    expect(item.detail).toContain("Signal ID sig_data");
  });

  it("keeps the existing Signal rename wording", () => {
    expect(describe1({ type: "signal.rename", signalId: "sig_data", name: "REQ" }).title).toBe("Rename Signal DATA to REQ");
  });

  it("names Annotation create, update and delete with their IDs", () => {
    expect(describe1({ type: "annotation.create", annotation: { id: "ann_1", type: "text", label: "Note", visible: true } }).title).toBe("Create text Annotation Note");
    expect(describe1({ type: "annotation.updateProperties", annotationId: "ann_1", label: "Renamed", visible: true }).detail).toContain("Annotation ID ann_1");
    expect(describe1({ type: "annotation.delete", annotationId: "ann_1" }).detail).toContain("Annotation ID ann_1");
  });

  it("names Bookmark, Time Group and Transaction Group commands with their IDs", () => {
    expect(describe1({ type: "bookmark.move", bookmarkId: "bm_1", start: 4 }).detail).toContain("Bookmark ID bm_1");
    expect(describe1({ type: "bookmark.update", bookmarkId: "bm_1", name: "B", start: 4 }).title).toBe("Update Bookmark B");
    expect(describe1({ type: "bookmark.delete", bookmarkId: "bm_1" }).detail).toContain("Bookmark ID bm_1");
    expect(describe1({ type: "timeGroup.create", timeGroup: { id: "tg_1", name: "Reset", start: 0, end: 4 } }).title).toBe("Create Time Group Reset");
    expect(describe1({ type: "timeGroup.update", timeGroupId: "tg_1", name: "Reset", start: 1, end: 5 }).detail).toContain("Time Group ID tg_1");
    expect(describe1({ type: "timeGroup.delete", timeGroupId: "tg_1" }).detail).toContain("Time Group ID tg_1");
    expect(describe1({ type: "transactionGroup.create", group: { id: "tgr_1", name: "Bus", order: 0 } }).title).toBe("Create Transaction Group Bus");
    expect(describe1({ type: "transactionGroup.delete", groupId: "tgr_1" }).detail).toContain("Transaction Group ID tgr_1");
  });
});
