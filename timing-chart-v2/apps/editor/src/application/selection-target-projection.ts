import type { AnnotationId, CanonicalDocument, Signal, SignalId } from "@timing-chart-v2/schema";

export interface SelectionTargetProjection {
  readonly selectedSignal: Signal | undefined;
  readonly selectedAnnotationTarget: CanonicalDocument["annotations"][number] | undefined;
  readonly referenceClockSignal: Signal | undefined;
  readonly annotationTargetSignalId: SignalId | undefined;
  readonly contextSignalId: SignalId | undefined;
}

export function deriveSelectionTargetProjection(input: {
  readonly document: CanonicalDocument;
  readonly signalById: ReadonlyMap<SignalId, Signal>;
  readonly annotationById: ReadonlyMap<AnnotationId, CanonicalDocument["annotations"][number]>;
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedAnnotationId: AnnotationId | undefined;
}): SelectionTargetProjection {
  const { document, signalById, annotationById, selectedSignalId, selectedAnnotationId } = input;
  const selectedSignal = selectedSignalId === undefined ? undefined : signalById.get(selectedSignalId);
  const selectedAnnotationTarget = selectedAnnotationId === undefined ? undefined : annotationById.get(selectedAnnotationId);
  const referenceClockSignal = document.timeline.referenceClock === undefined
    ? undefined
    : signalById.get(document.timeline.referenceClock);
  const annotationSignalId = selectedAnnotationTarget?.anchor?.signalId
    ?? selectedAnnotationTarget?.start?.signalId
    ?? selectedAnnotationTarget?.from?.signalId;
  const annotationSignal = annotationSignalId === undefined ? undefined : signalById.get(annotationSignalId);
  const isVisibleTarget = (signal: Signal | undefined): signal is Signal =>
    signal !== undefined && signal.type !== "commentRow" && signal.display.visible !== false;
  const isUsableContext = (signal: Signal | undefined): signal is Signal =>
    signal !== undefined && signal.type !== "commentRow";

  const annotationTargetSignalId = isVisibleTarget(selectedSignal)
    ? selectedSignal.id
    : isVisibleTarget(annotationSignal)
      ? annotationSignal.id
      : isVisibleTarget(referenceClockSignal)
        ? referenceClockSignal.id
        : document.signals.find(isVisibleTarget)?.id;
  const contextSignalId = isUsableContext(selectedSignal)
    ? selectedSignal.id
    : annotationSignalId !== undefined && signalById.get(annotationSignalId)?.type !== "commentRow"
      ? annotationSignalId
      : isUsableContext(referenceClockSignal)
        ? referenceClockSignal.id
        : document.signals.find(isUsableContext)?.id;

  return { selectedSignal, selectedAnnotationTarget, referenceClockSignal, annotationTargetSignalId, contextSignalId };
}
