import type { ChangeSet } from "./types.js";

const ARRAY_KEYS = [
  "rowOrder", "rowPresentation", "edgeCounter", "addedSignals", "removedSignals", "addedGroups", "removedGroups",
  "waveSemantics", "geometryLocal", "geometryScreenY", "annotationPosition", "annotationStyle",
  "bookmarkPosition", "timeGroupSemantics", "transactionSemantics",
] as const;

export function mergeChangeSets(changeSets: readonly ChangeSet[]): ChangeSet {
  const result: Record<string, unknown> = {};
  for (const key of ARRAY_KEYS) {
    const values: unknown[] = [];
    for (const changeSet of changeSets) values.push(...((changeSet[key] ?? []) as readonly unknown[]));
    if (values.length > 0) result[key] = [...new Set(values)];
  }
  for (const key of ["fullDocumentReplace", "timelineSemantics", "geometryScreenX", "minimapOverview"] as const) {
    if (changeSets.some((changeSet) => changeSet[key] === true)) result[key] = true;
  }
  return result as ChangeSet;
}
