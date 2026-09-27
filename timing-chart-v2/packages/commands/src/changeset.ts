import type { ChangeSet } from "./types.js";

const ARRAY_KEYS = [
  "rowOrder", "rowPresentation", "edgeCounter", "addedSignals", "removedSignals", "addedGroups", "removedGroups",
  "waveSemantics", "geometryLocal", "geometryScreenY", "annotationPosition", "annotationStyle", "annotationOrder", "annotationGroups",
  "bookmarkPosition", "timeGroupSemantics", "transactionSemantics", "transactionGroupSemantics",
] as const;

export function mergeChangeSets(changeSets: readonly ChangeSet[]): ChangeSet {
  const result: Record<string, unknown> = {};
  for (const key of ARRAY_KEYS) {
    const values: unknown[] = [];
    for (const changeSet of changeSets) values.push(...((changeSet[key] ?? []) as readonly unknown[]));
    if (values.length > 0) result[key] = [...new Set(values)];
  }
  for (const key of ["fullDocumentReplace", "timelineSemantics", "transactionTimeScale", "geometryScreenX", "minimapOverview"] as const) {
    if (changeSets.some((changeSet) => changeSet[key] === true)) result[key] = true;
  }
  if (changeSets.length > 0 && changeSets.every((changeSet) => changeSet.timingDiagnosticsUnchanged === true)) {
    result.timingDiagnosticsUnchanged = true;
  }
  return result as ChangeSet;
}
