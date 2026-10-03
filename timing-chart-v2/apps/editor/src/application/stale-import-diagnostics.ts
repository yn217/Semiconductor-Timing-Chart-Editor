import type { DocumentProblem } from "@timing-chart-v2/schema";

export function withStaleImportDiagnostic(current: readonly DocumentProblem[], domain: "annotation" | "event", message: string): readonly DocumentProblem[] {
  const detail = `stale-import:${domain}`;
  return [...current.filter((item) => item.detail !== detail), {
    code: domain === "annotation" ? "ANNOTATION_IMPORT_STALE" : "EVENT_IMPORT_STALE",
    path: "$.import",
    message,
    severity: "warning",
    operation: `${domain}.import`,
    operationLabel: domain === "annotation" ? "Import annotations" : "Import Signal events",
    source: "parser",
    stage: "commit",
    recommendation: "Retry the import after the current document and target are stable.",
    detail,
  }];
}
