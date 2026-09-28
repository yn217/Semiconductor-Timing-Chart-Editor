import type { CommandHistorySession } from "@timing-chart-v2/history";
import type { CanonicalDocument, DocumentProblem, ParsedCanonicalDocument } from "@timing-chart-v2/schema";
import { isTrustedParsedCanonicalDocument, validateDocumentResourceBudget } from "@timing-chart-v2/schema";
import { canonicalDocumentOf } from "../file-document-controller.js";

export type MigrationWarning = Readonly<{ code: string; path: string; message: string }>;
export type ReplacementDiagnostic = Readonly<{ code: string; path: string; message: string }>;

/**
 * The failure boundary of "replace the current document" (#743), separated from React so the real production path can be exercised with an
 * injected failing port. Order is the contract: validate -> replaceSession (authoritative) -> advance the DocumentEpoch ONCE -> caller publishes
 * effects. Any failure before the epoch advance leaves session, epoch and effects untouched.
 */
export type DocumentReplacementPort = Readonly<{
  replaceSession: (input: CanonicalDocument | ParsedCanonicalDocument, diagnostics: readonly ReplacementDiagnostic[]) => CommandHistorySession;
  advanceEpoch: () => number;
}>;

export type DocumentReplacementOutcome =
  | Readonly<{ ok: true; document: CanonicalDocument; session: CommandHistorySession; documentEpoch: number }>
  | Readonly<{ ok: false; reason: "resource-budget"; problems: readonly DocumentProblem[] }>
  | Readonly<{ ok: false; reason: "session-replacement-failed"; error: unknown }>;

export function commitDocumentReplacement(port: DocumentReplacementPort, input: CanonicalDocument | ParsedCanonicalDocument, migrationWarnings: readonly MigrationWarning[] = []): DocumentReplacementOutcome {
  const document = canonicalDocumentOf(input);
  // parseDocument already checked canonical structure and the same resource
  // budget. Preserve that trusted handoff through the replacement boundary;
  // raw New/other canonical inputs still receive the required budget check.
  if (!isTrustedParsedCanonicalDocument(input)) {
    const problems = validateDocumentResourceBudget(document);
    if (problems.length > 0) return { ok: false, reason: "resource-budget", problems };
  }
  const diagnostics = migrationWarnings.map((warning, index) => ({ code: warning.code, path: `${warning.path}[migration:${index}]`, message: warning.message }));
  let session: CommandHistorySession;
  try {
    session = port.replaceSession(input, diagnostics);
  } catch (error) {
    // Nothing was committed: the epoch has not moved and no renderer/lifecycle effect may be published for a replacement that did not happen.
    return { ok: false, reason: "session-replacement-failed", error };
  }
  const documentEpoch = port.advanceEpoch();
  return { ok: true, document, session, documentEpoch };
}
