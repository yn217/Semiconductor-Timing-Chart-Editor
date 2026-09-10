import { useEffect, useMemo, useState } from "react";
import type { CommandResult } from "@timing-chart-v2/commands";
import type { Annotation, CanonicalDocument, DocumentProblem, Signal, SignalGroup, Transaction } from "@timing-chart-v2/schema";
import { scanJsonSyntax, serializeCanonicalDocument, validateCanonicalDocument, validateDocumentResourceBudget } from "@timing-chart-v2/schema";
import { replaceSelectedJsonObject } from "./json-selection.js";
import { selectedJsonProblem } from "./json-problems.js";

export function AdvancedJsonPanel({ document, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction, onReplaceDocument, onDiagnostic }: { readonly document: CanonicalDocument; readonly selectedSignal: Signal | undefined; readonly selectedGroup: SignalGroup | undefined; readonly selectedAnnotation: Annotation | undefined; readonly selectedTransaction: Transaction | undefined; readonly onReplaceDocument: (document: CanonicalDocument) => CommandResult; readonly onDiagnostic: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void }) {
  const text = useMemo(() => serializeCanonicalDocument(document), [document]);
  const [advanced, setAdvanced] = useState(false);
  const [scope, setScope] = useState<"selected" | "document">("document");
  const [draft, setDraft] = useState(text);
  const [status, setStatus] = useState("Read only");
  const selected = selectedSignal ?? selectedGroup ?? selectedAnnotation ?? selectedTransaction;
  const sourceText = scope === "selected" ? JSON.stringify(selected ?? {}, null, 2) : text;
  const draftChanged = advanced && draft !== sourceText;
  useEffect(() => { setDraft(sourceText); }, [sourceText]);
  const cancel = () => { setDraft(sourceText); onDiagnostic(undefined); setStatus("Draft cancelled"); };
  const parseDraft = (): unknown => {
    try { const value = JSON.parse(draft); onDiagnostic(undefined); return value; } catch (error) {
      const diagnostic = scanJsonSyntax(draft);
      const detail = error instanceof Error ? error.message : "Invalid JSON.";
      const parserDetail = diagnostic ? `${detail}; excerpt: ${diagnostic.excerpt}; caret: ${diagnostic.caret}` : detail;
      onDiagnostic({ code: diagnostic?.code ?? "JSON_PARSE_ERROR", path: diagnostic ? `$@${diagnostic.line}:${diagnostic.column}` : "$", message: diagnostic?.message ?? detail, ...(diagnostic ? { line: diagnostic.line, column: diagnostic.column, offset: diagnostic.offset, excerpt: diagnostic.excerpt, caret: diagnostic.caret } : {}), severity: "error", operation: "document.json.parse", operationLabel: "Parse Advanced JSON", source: "parser", stage: "parse", recommendation: "Fix the JSON syntax in the indicated line and column, then retry.", detail: `advanced-json:parse;${parserDetail}` });
      setStatus(diagnostic ? `Invalid JSON · line ${diagnostic.line}, column ${diagnostic.column} · ${diagnostic.message} · ${diagnostic.excerpt}` : `Invalid JSON · ${detail}`);
      return undefined;
    }
  };
  const format = () => {
    const value = parseDraft();
    if (value !== undefined) { setDraft(JSON.stringify(value, null, 2)); setStatus("Formatted"); }
  };
  const validate = () => {
    const value = parseDraft();
    if (value === undefined) return;
    if (scope === "document") { const problems = validateCanonicalDocument(value as CanonicalDocument); if (problems.length === 0) { onDiagnostic(undefined); setStatus("Valid"); } else { const diagnostics = problems.map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported path and validate again.", detail: `advanced-json:validate:${index}` })); const problem = problems[0]!; onDiagnostic(diagnostics); setStatus(`Invalid: ${problem.code} · ${problem.path}`); } }
    else if (!selected) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_REQUIRED", "$", "Select an object before validating selected JSON.")); setStatus("No selected object"); }
    else if (typeof value !== "object" || value === null || Array.isArray(value)) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_SHAPE", "$", "Selected JSON must be an object.")); setStatus("Invalid selected object"); }
    else if ((value as { id?: unknown }).id !== selected.id) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_ID_MISMATCH", "$.id", "Selected object ID cannot change.")); setStatus("Invalid selected object ID"); }
    else { const problems = validateCanonicalDocument(replaceSelectedJsonObject(document, value, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction)); if (problems.length === 0) { onDiagnostic(undefined); setStatus("Valid"); } else { const diagnostics = problems.map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported path and validate again.", detail: `advanced-json:validate:${index}` })); const problem = problems[0]!; onDiagnostic(diagnostics); setStatus(`Invalid: ${problem.code} · ${problem.path}`); } }
  };
  const copy = async () => {
    const reportFailure = (reason: string) => {
      onDiagnostic({ code: "CLIPBOARD_FAILED", path: "$.clipboard", message: `Clipboard copy failed: ${reason}`, severity: "error", operation: "document.json.copy", operationLabel: "Copy JSON", source: "clipboard", stage: "clipboard-write", recommendation: "Allow clipboard access or retry the copy operation.", detail: "advanced-json:clipboard-failure" });
      setStatus(`Copy failed: ${reason}`);
    };
    if (!navigator.clipboard) { reportFailure("Clipboard API unavailable"); return; }
    try {
      await navigator.clipboard.writeText(draft);
      onDiagnostic(undefined);
      setStatus("Copied");
    } catch (error) {
      reportFailure(error instanceof Error ? error.message : "Clipboard permission denied");
    }
  };
  const apply = () => {
    if (!advanced) return;
    const value = parseDraft();
    if (value === undefined || typeof value !== "object" || value === null || Array.isArray(value)) { setStatus("JSON object required"); return; }
    let next = value as CanonicalDocument;
    if (scope === "selected") {
      if (!selected) { setStatus("No selected object"); return; }
      if ((value as { id?: unknown }).id !== selected.id) { setStatus("Selected object ID cannot change"); return; }
      next = replaceSelectedJsonObject(document, value, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction);
    }
    const problems = validateCanonicalDocument(next);
    const resourceProblems = problems.length === 0 ? validateDocumentResourceBudget(next) : [];
    if (problems.length > 0 || resourceProblems.length > 0) {
      const diagnostics = [...problems, ...resourceProblems].map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported document or resource limits, then apply again.", detail: `advanced-json:validate:${index}` }));
      const problem = diagnostics[0]!;
      onDiagnostic(diagnostics);
      setStatus(`Invalid: ${problem.code} · ${problem.path}`);
      return;
    }
    onDiagnostic(undefined);
    const result = onReplaceDocument(next);
    if (!result.ok) { setStatus(`Apply failed: ${result.reason}`); return; }
    setAdvanced(false);
    setStatus("Applied");
  };
  return <section className="json-panel" data-testid="json-panel"><div className="json-toolbar"><strong>JSON</strong><button type="button" data-testid="json-advanced-toggle" aria-pressed={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? "Read Only" : "Advanced Editable"}</button><span aria-label="JSON editing mode">{advanced ? "Advanced" : "Read only"}</span>{advanced && draftChanged && <span data-testid="json-unapplied-status">● Unapplied changes</span>}<select aria-label="JSON scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="selected">Selected Object</option><option value="document">Whole Document</option></select><button type="button" onClick={format}>Format</button><button type="button" onClick={validate}>Validate</button><button type="button" onClick={() => void copy()}>Copy</button>{advanced && <><button type="button" data-testid="cancel-advanced-json" onClick={cancel} disabled={!draftChanged}>Cancel</button><button type="button" data-testid="apply-advanced-json" onClick={apply} disabled={!draftChanged}>Apply JSON</button></>}<output>{status}</output></div>{advanced ? <textarea aria-label="Advanced JSON" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} /> : <pre>{text}</pre>}</section>;
}
