import type { CommandResult } from "@timing-chart-v2/commands";
import type { DocumentProblem } from "@timing-chart-v2/schema";

type RejectionContext = Readonly<{
  result: Extract<CommandResult, { readonly ok: false }>;
  operation: string;
  commandId?: string;
  target?: Pick<DocumentProblem, "objectType" | "objectId">;
}>;

/** Preserve atomic operation identity while keeping each validation problem intact. */
export function buildCommandRejectionDiagnostics({ result, operation, commandId, target }: RejectionContext): readonly DocumentProblem[] {
  const context = `${operation} rejected (${result.reason})`;
  return result.problems.map((item) => ({
    ...item,
    message: `[${context}] ${item.message}`,
    severity: "error" as const,
    operation,
    operationLabel: operation,
    source: "command" as const,
    stage: "commit" as const,
    ...(commandId === undefined ? {} : { commandId }),
    ...(target ?? {}),
    ...(result.reason === "stale" ? { recommendation: "Refresh the editor state and retry the operation." } : result.reason === "invalid" ? { recommendation: "Review the field and value shown in this diagnostic." } : {}),
    detail: `command-rejection:${operation}:${result.reason}${item.detail ? `;${item.detail}` : ""}`,
  }));
}
