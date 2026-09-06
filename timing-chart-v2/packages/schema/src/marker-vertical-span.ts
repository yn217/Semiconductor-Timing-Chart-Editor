import type { Annotation, CanonicalDocument, SignalId } from "./types.js";

export interface ResolvedMarkerVerticalSpan {
  readonly startRowId?: SignalId;
  readonly endRowId?: SignalId;
  readonly rowIds: readonly SignalId[];
}

/** Resolves semantic Marker boundaries against current group row order. */
export function resolveMarkerVerticalSpan(document: CanonicalDocument, annotation: Annotation): ResolvedMarkerVerticalSpan {
  const span = annotation.verticalSpan;
  if (annotation.type !== "marker" || span === undefined || span.mode === "auto") return { rowIds: [] };
  const rowIds = document.signalGroups.flatMap((group) => group.rows).filter((id): id is SignalId => document.signals.some((signal) => signal.id === id));
  if (span.mode === "custom") return { rowIds, ...(span.startRowId ? { startRowId: span.startRowId } : {}), ...(span.endRowId ? { endRowId: span.endRowId } : {}) };
  const start = rowIds.indexOf(span.startRowId!);
  const end = rowIds.indexOf(span.endRowId!);
  if (start < 0 || end < 0) return { rowIds: [] };
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return { ...(rowIds[lo] ? { startRowId: rowIds[lo] } : {}), ...(rowIds[hi] ? { endRowId: rowIds[hi] } : {}), rowIds: rowIds.slice(lo, hi + 1) };
}
