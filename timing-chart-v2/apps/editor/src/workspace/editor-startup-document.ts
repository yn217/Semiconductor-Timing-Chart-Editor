import { cycleDocument, transactionDemoDocument, v1ReferenceDocument } from "../fixtures-cycle-reference-documents.js";
import { readStartupDocumentPreference } from "./startup-document-preference.js";
import { readPreferredViewMode } from "./use-workspace-ui-state.js";
import { normalizeDocument, type CanonicalDocument } from "@timing-chart-v2/schema";

// Built-in documents enter the same normalization boundary as File -> Open.
// In particular, legacy changes without IDs must not reach EventTable's
// compatibility fallback as normal runtime identity.
function normalizedTemplate(document: CanonicalDocument): CanonicalDocument {
  const result = normalizeDocument(document);
  if (!result.ok) throw new Error("Built-in editor document failed normalization.");
  return result.document;
}

export function resolveEditorStartupDocument(search: string | undefined) {
  const params = search === undefined ? undefined : new URLSearchParams(search);
  const visualReference = params?.has("visual-reference") === true;
  const cycleSample = params?.has("cycle-sample") === true || readStartupDocumentPreference() === "cycle";
  return {
    visualReference,
    initialDocument: normalizedTemplate(visualReference ? v1ReferenceDocument : cycleSample ? cycleDocument : transactionDemoDocument),
    productTemplate: normalizedTemplate(cycleDocument),
    initialViewMode: visualReference ? "Cycle" as const : readPreferredViewMode("Transaction"),
  };
}
