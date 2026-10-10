import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandResult } from "@timing-chart-v2/commands";
import type { Annotation, CanonicalDocument, DocumentProblem, Signal, SignalGroup, Transaction } from "@timing-chart-v2/schema";
import { normalizeDocument, parseJsonInput, scanJsonSyntax, serializeCanonicalDocument } from "@timing-chart-v2/schema";
import { replaceSelectedJsonObject } from "./json-selection.js";
import { selectedJsonProblem } from "./json-problems.js";
import { advancedJsonDraftStaleReason, captureAdvancedJsonDraftBase, resolveAdvancedJsonEntityTarget } from "./advanced-json-draft-base.js";
import { MAX_OPEN_FILE_BYTES } from "./file-document-controller.js";

export function AdvancedJsonPanel({ document, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction, documentEpoch, projectionGeneration, revision, onReplaceDocument, onDiagnostic }: { readonly document: CanonicalDocument; readonly selectedSignal: Signal | undefined; readonly selectedGroup: SignalGroup | undefined; readonly selectedAnnotation: Annotation | undefined; readonly selectedTransaction: Transaction | undefined; readonly documentEpoch: number; readonly projectionGeneration: number; readonly revision: number; readonly onReplaceDocument: (document: CanonicalDocument) => CommandResult; readonly onDiagnostic: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void }) {
  const [scope, setScope] = useState<"selected" | "document">("document");
  const selected = selectedSignal ?? selectedGroup ?? selectedAnnotation ?? selectedTransaction;
  const selectedTarget = useMemo(() => selected === undefined ? undefined : selectedSignal !== undefined
    ? { kind: "signal" as const, id: selected.id, value: selected }
    : selectedGroup !== undefined ? { kind: "group" as const, id: selected.id, value: selected }
      : selectedAnnotation !== undefined ? { kind: "annotation" as const, id: selected.id, value: selected }
        : { kind: "transaction" as const, id: selected.id, value: selected }, [selected, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction]);
  const text = useMemo(() => scope === "document" ? serializeCanonicalDocument(document) : "", [document, scope]);
  const selectedText = JSON.stringify(selected ?? {}, null, 2);
  const sourceText = scope === "selected" ? selectedText : text;
  const draftContext = { document, documentEpoch, projectionGeneration, revision } as const;
  const draftBaseRef = useRef(captureAdvancedJsonDraftBase(scope, draftContext, selectedTarget));
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState(sourceText);
  const [userEdited, setUserEdited] = useState(false);
  const [staleDraft, setStaleDraft] = useState(false);
  const [status, setStatus] = useState("Read only");
  const draftChanged = advanced && userEdited && draft !== sourceText;
  const changeScope = (nextScope: "selected" | "document") => {
    setScope(nextScope);
    // Scope changes are explicit user navigation, so load that scope's
    // source rather than treating it as an unsolicited live refresh.
    setDraft(nextScope === "selected" ? selectedText : serializeCanonicalDocument(document));
    setUserEdited(false);
    setStaleDraft(false);
    draftBaseRef.current = captureAdvancedJsonDraftBase(nextScope, draftContext, selectedTarget);
    onDiagnostic(undefined);
    setStatus(nextScope === "selected" ? "Selected Object" : "Read only");
  };
  useEffect(() => {
    // Never replace an unapplied user draft when the live selection/document
    // changes. The draft remains visible until the user explicitly Cancels,
    // validates/applies it, or returns to the current source object.
    if (userEdited && draftChanged) {
      setStatus("Unapplied changes — review or cancel before switching source");
      return;
    }
    draftBaseRef.current = captureAdvancedJsonDraftBase(scope, draftContext, selectedTarget);
    setStaleDraft(false);
    setDraft(sourceText);
    setUserEdited(false);
  }, [sourceText, draftChanged, userEdited, scope, document, documentEpoch, projectionGeneration, revision, selectedTarget]);
  const reloadLatest = () => {
    draftBaseRef.current = captureAdvancedJsonDraftBase(scope, draftContext, selectedTarget);
    setDraft(sourceText);
    setUserEdited(false);
    setStaleDraft(false);
    onDiagnostic(undefined);
    setStatus("Latest source loaded");
  };
  const cancel = () => { reloadLatest(); setStatus("Draft cancelled"); };
  const parseDraft = (): unknown => {
    try {
      const parsed = parseJsonInput(draft);
      const budgetProblem = parsed.ok ? undefined : parsed.problems[0];
      if (budgetProblem?.line !== undefined || budgetProblem?.code === "JSON_SYNTAX") throw new Error(budgetProblem.message);
      if (budgetProblem) {
        onDiagnostic({ ...budgetProblem, severity: "error", operation: "document.json.parse", operationLabel: "Parse Advanced JSON", source: "validation", stage: "parse", recommendation: "Reduce the JSON input size or nesting/complexity, then retry.", detail: "advanced-json:resource-budget" });
        setStatus(`Invalid: ${budgetProblem.code} · ${budgetProblem.path}`);
        return undefined;
      }
      onDiagnostic(undefined); return parsed.ok ? parsed.value : undefined;
    } catch (error) {
      const diagnostic = scanJsonSyntax(draft);
      const detail = error instanceof Error ? error.message : "Invalid JSON.";
      const parserDetail = diagnostic ? `${detail}; excerpt: ${diagnostic.excerpt}; caret: ${diagnostic.caret}` : detail;
      onDiagnostic({ code: diagnostic?.code ?? "JSON_PARSE_ERROR", path: diagnostic ? `$@${diagnostic.line}:${diagnostic.column}` : "$", message: diagnostic?.message ?? detail, ...(diagnostic ? { line: diagnostic.line, column: diagnostic.column, offset: diagnostic.offset, excerpt: diagnostic.excerpt, caret: diagnostic.caret } : {}), severity: "error", operation: "document.json.parse", operationLabel: "Parse Advanced JSON", source: "parser", stage: "parse", recommendation: "Fix the JSON syntax in the indicated line and column, then retry.", detail: `advanced-json:parse;${parserDetail}` });
      setStatus(diagnostic ? `Invalid JSON · line ${diagnostic.line}, column ${diagnostic.column} · ${diagnostic.message} · ${diagnostic.excerpt}` : `Invalid JSON · ${detail}`);
      return undefined;
    }
  };
  const validateDocumentValue = (value: CanonicalDocument): readonly DocumentProblem[] => {
    const normalized = normalizeDocument(value);
    return normalized.ok ? [] : normalized.problems;
  };
  const format = () => {
    const value = parseDraft();
    if (value !== undefined) { setDraft(JSON.stringify(value, null, 2)); setStatus("Formatted"); }
  };
  const validate = () => {
    const value = parseDraft();
    if (value === undefined) return;
    if (scope === "document") { const problems = validateDocumentValue(value as CanonicalDocument); if (problems.length === 0) { onDiagnostic(undefined); setStatus("Valid"); } else { const diagnostics = problems.map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported path and validate again.", detail: `advanced-json:validate:${index}` })); const problem = problems[0]!; onDiagnostic(diagnostics); setStatus(`Invalid: ${problem.code} · ${problem.path}`); } }
    else if (!draftBaseRef.current.selectedTarget) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_REQUIRED", "$", "Select an object before validating selected JSON.")); setStatus("No selected object"); }
    else if (typeof value !== "object" || value === null || Array.isArray(value)) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_SHAPE", "$", "Selected JSON must be an object.")); setStatus("Invalid selected object"); }
    else if ((value as { id?: unknown }).id !== draftBaseRef.current.selectedTarget.id) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_ID_MISMATCH", "$.id", "Selected object ID cannot change.")); setStatus("Invalid selected object ID"); }
    else {
      const target = resolveAdvancedJsonEntityTarget(document, draftBaseRef.current.selectedTarget);
      if (!target) { setStatus("Stale draft — selected object no longer exists"); return; }
      const next = replaceSelectedJsonObject(document, value, target.kind === "signal" ? target.value as Signal : undefined, target.kind === "group" ? target.value as SignalGroup : undefined, target.kind === "annotation" ? target.value as Annotation : undefined, target.kind === "transaction" ? target.value as Transaction : undefined);
      const problems = validateDocumentValue(next);
      if (problems.length === 0) { onDiagnostic(undefined); setStatus("Valid"); }
      else { const diagnostics = problems.map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported path and validate again.", detail: `advanced-json:validate:${index}` })); const problem = problems[0]!; onDiagnostic(diagnostics); setStatus(`Invalid: ${problem.code} · ${problem.path}`); }
    }
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
    const staleReason = advancedJsonDraftStaleReason(draftBaseRef.current, draftContext);
    if (staleReason) {
      setStaleDraft(true);
      const message = `${staleReason} Reload latest or cancel before applying.`;
      onDiagnostic({ code: "STALE_JSON_DRAFT", path: "$", message, severity: "error", operation: "document.json.apply", operationLabel: "Apply Advanced JSON", source: "validation", stage: "validate", recommendation: "Reload the latest JSON or cancel this draft, then reapply the intended edit.", detail: "advanced-json:stale-base" });
      setStatus(`Stale draft — ${staleReason}`);
      return;
    }
    // Same byte ceiling as File Open, so a document applied here can always be saved and reopened.
    const draftBytes = new Blob([draft]).size;
    if (draftBytes > MAX_OPEN_FILE_BYTES) {
      onDiagnostic({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$", message: `Apply rejected: the JSON draft is ${draftBytes.toLocaleString()} bytes; the limit is ${MAX_OPEN_FILE_BYTES.toLocaleString()} bytes, the same as Open.`, expected: String(MAX_OPEN_FILE_BYTES), value: draftBytes, severity: "error", operation: "document.json.apply", operationLabel: "Apply Advanced JSON", source: "validation", stage: "parse", recommendation: "Reduce the document size to within the Open limit, then Apply again.", detail: `advanced-json:apply-byte-budget;actualBytes=${draftBytes};allowedBytes=${MAX_OPEN_FILE_BYTES}` });
      setStatus(`Apply rejected: draft is ${draftBytes.toLocaleString()} bytes; the limit is ${MAX_OPEN_FILE_BYTES.toLocaleString()}`);
      return;
    }
    const value = parseDraft();
    if (value === undefined) return; // Preserve parse/resource diagnostics, including line and column.
    if (typeof value !== "object" || value === null || Array.isArray(value)) { setStatus("JSON object required"); return; }
    let next = value as CanonicalDocument;
    if (scope === "selected") {
      const target = resolveAdvancedJsonEntityTarget(document, draftBaseRef.current.selectedTarget);
      if (!target) { setStatus("Stale draft — selected object no longer exists"); return; }
      if ((value as { id?: unknown }).id !== target.id) { setStatus("Selected object ID cannot change"); return; }
      next = replaceSelectedJsonObject(document, value, target.kind === "signal" ? target.value as Signal : undefined, target.kind === "group" ? target.value as SignalGroup : undefined, target.kind === "annotation" ? target.value as Annotation : undefined, target.kind === "transaction" ? target.value as Transaction : undefined);
    }
    const normalized = normalizeDocument(next);
    const problems = normalized.ok ? [] : normalized.problems;
    if (problems.length > 0) {
      const diagnostics = problems.map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported document or resource limits, then apply again.", detail: `advanced-json:validate:${index}` }));
      const problem = diagnostics[0]!;
      onDiagnostic(diagnostics);
      setStatus(`Invalid: ${problem.code} · ${problem.path}`);
      return;
    }
    onDiagnostic(undefined);
    if (!normalized.ok) return;
    const result = onReplaceDocument(normalized.document);
    if (!result.ok) { setStatus(`Apply failed: ${result.reason}`); return; }
    // Report the same migration notices Open shows (information, not problems) so repaired or rounded values are never silent.
    const notices = normalized.warnings.map((warning, index) => ({ code: warning.code, path: `${warning.path}[migration:${index}]`, message: warning.message, severity: "info" as const, operation: "document.json.apply", operationLabel: "Apply Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Review the migrated value, then save the document.", detail: `advanced-json:apply-notice:${index}` }));
    if (notices.length > 0) onDiagnostic(notices);
    setAdvanced(false);
    setUserEdited(false);
    setStaleDraft(false);
    setStatus(notices.length === 0 ? "Applied" : `Applied with ${notices.length} notice${notices.length === 1 ? "" : "s"} · ${notices[0]!.code} · ${notices[0]!.message}`);
  };
  return <section className="json-panel" data-testid="json-panel"><div className="json-toolbar"><strong>JSON</strong><button type="button" data-testid="json-advanced-toggle" aria-pressed={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? "Read Only" : "Advanced Editable"}</button><span aria-label="JSON editing mode">{advanced ? "Advanced" : "Read only"}</span>{advanced && draftChanged && <span data-testid="json-unapplied-status">● Unapplied changes</span>}<select aria-label="JSON scope" value={scope} onChange={(event) => changeScope(event.target.value as typeof scope)}><option value="selected">Selected Object</option><option value="document">Whole Document</option></select><button type="button" onClick={format}>Format</button><button type="button" onClick={validate}>Validate</button><button type="button" onClick={() => void copy()}>Copy</button>{advanced && draftChanged && <button type="button" data-testid="cancel-advanced-json" onClick={cancel}>Cancel</button>}{advanced && staleDraft && <button type="button" data-testid="reload-latest-advanced-json" onClick={reloadLatest}>Reload latest</button>}{advanced && draftChanged && <button type="button" data-testid="apply-advanced-json" onClick={apply}>Apply JSON</button>}<output>{status}</output></div>{advanced ? <textarea aria-label="Advanced JSON" value={draft} onChange={(event) => { if (!userEdited || !draftChanged) draftBaseRef.current = captureAdvancedJsonDraftBase(scope, draftContext, selectedTarget); setUserEdited(true); setDraft(event.target.value); }} spellCheck={false} /> : <pre>{scope === "selected" ? selectedText : text}</pre>}</section>;
}
