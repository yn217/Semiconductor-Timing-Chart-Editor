import { cycleDocument, transactionDemoDocument, v1ReferenceDocument } from "../fixtures-cycle-reference-documents.js";
import { readStartupDocumentPreference } from "./startup-document-preference.js";
import { readPreferredViewMode } from "./use-workspace-ui-state.js";

export function resolveEditorStartupDocument(search: string | undefined) {
  const params = search === undefined ? undefined : new URLSearchParams(search);
  const visualReference = params?.has("visual-reference") === true;
  const cycleSample = params?.has("cycle-sample") === true || readStartupDocumentPreference() === "cycle";
  return {
    visualReference,
    initialDocument: visualReference ? v1ReferenceDocument : cycleSample ? cycleDocument : transactionDemoDocument,
    productTemplate: cycleDocument,
    initialViewMode: visualReference ? "Cycle" as const : readPreferredViewMode("Transaction"),
  };
}
