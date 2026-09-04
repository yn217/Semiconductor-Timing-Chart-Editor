import { describe, expect, it } from "vitest";
import { deterministicMockAIProposalProvider } from "../../apps/editor/src/ai-proposal-provider.js";
import { canonicalFixture } from "../fixtures/canonical.js";

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
});
