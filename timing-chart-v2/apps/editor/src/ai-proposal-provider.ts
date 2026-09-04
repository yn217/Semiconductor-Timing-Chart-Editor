import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";

/** Proposal kinds reserved for future provider capabilities. Only the
 * semantic-command kind is currently executable. */
export type AIProposalKind = "semantic-command" | "sva-spec";

export type AIProposal = Readonly<{
  kind: AIProposalKind;
  baseRevision: number;
  commands: readonly SemanticCommand[];
  summary: string;
}>;

export type AIProposalRequest = Readonly<{
  document: CanonicalDocument;
  revision: number;
  query: string;
  selectedSignalId: SignalId | undefined;
}>;

export type AIProposalResult = Readonly<
  | { ok: true; proposal: AIProposal }
  | { ok: false; message: string }
>;

/** Provider-neutral boundary. Implementations may be backed by a mock, local
 * model, or remote service, but they return proposals only; Canonical changes
 * are always applied by the editor's SemanticCommand owner. */
export interface AIProposalProvider {
  propose(request: AIProposalRequest): AIProposalResult;
}

/** Deterministic CI-safe provider used by the production UI until a provider
 * adapter is configured. It deliberately supports only bounded intents. */
export const deterministicMockAIProposalProvider: AIProposalProvider = {
  propose: ({ document, revision, query, selectedSignalId }) => {
    const selected = document.signals.find((signal) => signal.id === selectedSignalId && signal.type !== "commentRow");
    if (!selected) return { ok: false, message: "Select a timing Signal first." };
    const text = query.trim();
    const rename = /^rename(?: selected)?(?: signal)? to (.+)$/i.exec(text);
    const command: SemanticCommand | undefined = rename
      ? { id: nextCommandId("ai_rename"), type: "signal.rename", signalId: selected.id, name: rename[1]!.trim() }
      : /^(hide|show)(?: selected)?(?: signal)?$/i.test(text)
        ? { id: nextCommandId("ai_visibility"), type: "signal.setVisibility", signalId: selected.id, visible: text.toLowerCase().startsWith("show") }
        : undefined;
    if (!command) return { ok: false, message: "Supported intents: rename selected signal to <name>, hide selected signal, show selected signal." };
    return {
      ok: true,
      proposal: {
        kind: "semantic-command",
        baseRevision: revision,
        commands: [command],
        summary: command.type === "signal.rename"
          ? `Rename ${selected.display.name} to ${(command as Extract<SemanticCommand, { type: "signal.rename" }>).name}`
          : `${(command as Extract<SemanticCommand, { type: "signal.setVisibility" }>).visible ? "Show" : "Hide"} ${selected.display.name}`,
      },
    };
  },
};
