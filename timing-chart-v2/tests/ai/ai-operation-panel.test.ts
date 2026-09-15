import { describe, expect, it } from "vitest";
import { isAIPreviewFresh } from "../../apps/editor/src/ai-operation-panel.js";

describe("AI document-scoped freshness", () => {
  it("rejects same-revision proposals from an older document epoch synchronously", () => {
    expect(isAIPreviewFresh({ proposalEpoch: 4, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(false);
    expect(isAIPreviewFresh({ proposalEpoch: 5, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(true);
  });

  it("requires both the shared epoch and revision for a validated Apply", () => {
    expect(isAIPreviewFresh({ proposalEpoch: undefined, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(false);
    expect(isAIPreviewFresh({ proposalEpoch: 5, currentEpoch: 5, proposalRevision: 6, currentRevision: 7 })).toBe(false);
  });
});
