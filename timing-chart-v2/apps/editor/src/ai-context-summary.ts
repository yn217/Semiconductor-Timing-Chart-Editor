import type { CanonicalDocument, GroupId, SignalId } from "@timing-chart-v2/schema";

export type AIContextScope = "selection" | "current-view" | "document";

export function resolveAIContextSelection(document: CanonicalDocument, selection: {
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly selectedAnnotationId: string | undefined;
  readonly selectedTransactionId: string | undefined;
}): Readonly<{ selectedSignalId: SignalId | undefined; selectedGroupId: GroupId | undefined; selectedAnnotationId: string | undefined; selectedTransactionId: string | undefined }> {
  return {
    selectedSignalId: document.signals.some((item) => item.id === selection.selectedSignalId) ? selection.selectedSignalId : undefined,
    selectedGroupId: document.signalGroups.some((item) => item.id === selection.selectedGroupId) ? selection.selectedGroupId : undefined,
    selectedAnnotationId: document.annotations.some((item) => item.id === selection.selectedAnnotationId) ? selection.selectedAnnotationId : undefined,
    selectedTransactionId: document.transactions.some((item) => item.id === selection.selectedTransactionId) ? selection.selectedTransactionId : undefined,
  };
}

export function buildAIContextSummary(input: {
  readonly document: CanonicalDocument;
  readonly mode: "Cycle" | "Transaction" | "Combined";
  readonly scope: AIContextScope;
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly selectedAnnotationId: string | undefined;
  readonly selectedTransactionId: string | undefined;
  readonly range: Readonly<{ start: number; end: number }> | undefined;
}): Readonly<{ document: string; view: string; selection: string; range: string; scope: string }> {
  const { document } = input;
  const selection = resolveAIContextSelection(document, input);
  const selected: string[] = [];
  const signal = document.signals.find((item) => item.id === selection.selectedSignalId);
  if (signal) selected.push(`Signal: ${signal.display.name || signal.name}${signal.display.visible === false ? " (hidden)" : ""}`);
  const group = document.signalGroups.find((item) => item.id === selection.selectedGroupId);
  if (group) selected.push(`Group: ${group.name}`);
  const annotation = document.annotations.find((item) => item.id === selection.selectedAnnotationId);
  if (annotation) selected.push(`Annotation: ${annotation.label || annotation.id}${annotation.visible === false ? " (hidden)" : ""}`);
  const transaction = document.transactions.find((item) => item.id === selection.selectedTransactionId);
  if (transaction) selected.push(`Transaction: ${transaction.name}`);

  return {
    document: document.document.title || "Untitled",
    view: input.mode,
    selection: selected.join(" · ") || "None",
    range: input.range ? `${input.range.start}–${input.range.end} cycles` : "None",
    scope: input.scope === "selection" ? "Selection" : input.scope === "current-view" ? "Current View" : "Document",
  };
}
