import type { DocumentProblem } from "@timing-chart-v2/schema";

export function selectedJsonProblem(code: string, path: string, message: string): DocumentProblem {
  return { code, path, message, severity: "error", operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation", stage: "validate", recommendation: "Correct the selected object and validate again.", detail: "advanced-json:validate:selected" };
}
