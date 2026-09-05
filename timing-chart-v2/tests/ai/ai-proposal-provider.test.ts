import { describe, expect, it } from "vitest";
import { deterministicMockAIProposalProvider } from "../../apps/editor/src/ai-proposal-provider.js";
import { canonicalFixture } from "../fixtures/canonical.js";
import type { AnnotationId, GroupId, SignalId, TimeGroupId, TransactionId } from "@timing-chart-v2/schema";

describe("deterministic AI proposal provider", () => {
  it("returns a revisioned semantic proposal without mutating the source document", () => {
    const document = canonicalFixture();
    const result = deterministicMockAIProposalProvider.propose({ document, revision: 7, query: "rename selected signal to DATA_RENAMED", selectedSignalId: "sig_data" as never });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal).toMatchObject({ kind: "semantic-command", baseRevision: 7, summary: "Rename DATA to DATA_RENAMED" });
    expect(result.proposal.commands[0]).toMatchObject({ type: "signal.rename", signalId: "sig_data", name: "DATA_RENAMED" });
    expect(document.signals[1]).toMatchObject({ id: "sig_data", name: "DATA" });
  });

  it("rejects unsupported provider intents and missing scope deterministically", () => {
    const document = canonicalFixture();
    expect(deterministicMockAIProposalProvider.propose({ document, revision: 0, query: "make it faster", selectedSignalId: "sig_data" as never })).toEqual({ ok: false, message: expect.stringContaining("Supported intents") });
    expect(deterministicMockAIProposalProvider.propose({ document, revision: 0, query: "hide selected signal", selectedSignalId: undefined })).toEqual({ ok: false, message: "Select a timing Signal first." });
  });

  it("maps each supported operation domain to a typed SemanticCommand", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      signalGroups: [...base.signalGroups, { id: "grp_aux" as GroupId, name: "Aux", rows: [] }],
      bookmarks: [{ id: "bookmark_1" as never, name: "B", start: 2 }],
      timeGroups: [{ id: "time_1" as TimeGroupId, name: "TG", start: 1, end: 3 }],
      annotations: [{ id: "annotation_1" as AnnotationId, type: "text" as const, label: "Note", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" as const } }],
      transactions: [{ id: "transaction_1" as TransactionId, name: "Read", start: 1, end: 3 }],
    };
    const request = (query: string, extra: Record<string, unknown> = {}) => deterministicMockAIProposalProvider.propose({
      document,
      revision: 4,
      query,
      selectedSignalId: "sig_data" as SignalId,
      selectedGroupId: "grp_main" as GroupId,
      selectedAnnotationId: "annotation_1",
      selectedTransactionId: "transaction_1",
      range: { start: 1, end: 3 },
      ...extra,
    });
    const typed = (query: string, type: string, extra?: Record<string, unknown>) => {
      const result = request(query, extra);
      expect(result.ok, query).toBe(true);
      if (result.ok) expect(result.proposal.commands[0]?.type, query).toBe(type);
    };

    typed("create binary signal named READY", "signal.create");
    typed("set selected signal role to output", "signal.updateProperties");
    typed("set selected signal color to #112233", "signal.updateProperties");
    typed("move selected signal to group Aux", "signal.move");
    typed("create group named Status", "group.create");
    typed("move selected group to position 1", "group.move");
    typed("insert 1 cycle at 2", "timeline.insert");
    typed("delete cycles 2 to 3", "timeline.delete");
    typed("duplicate cycles 1 to 2 at 4", "timeline.duplicateRange");
    typed("move cycles 1 to 2 to 4", "timeline.moveRange");
    typed("add bookmark at 4", "bookmark.create");
    typed("move bookmark B to 4", "bookmark.move");
    typed("rename bookmark B to Release", "bookmark.update");
    typed("create time group Window from 1 to 3", "timeGroup.create");
    typed("update time group TG from 2 to 4", "timeGroup.update");
    typed("create text annotation", "annotation.create");
    typed("rename selected annotation to Updated Note", "annotation.updateProperties");
    typed("create transaction Write from 2 to 4", "transaction.create");
    typed("rename selected transaction to Updated Read", "transaction.rename");
    const view = request("fit all");
    expect(view).toMatchObject({ ok: true, proposal: { kind: "view-only", viewIntent: "fit-all", commands: [] } });
  });

  it("requires explicit group scope for AI signal creation", () => {
    const document = canonicalFixture();
    const result = deterministicMockAIProposalProvider.propose({ document, revision: 0, query: "create signal named ORPHAN", selectedSignalId: undefined });
    expect(result).toEqual({ ok: false, message: "A Signal Group is required." });
  });
});
