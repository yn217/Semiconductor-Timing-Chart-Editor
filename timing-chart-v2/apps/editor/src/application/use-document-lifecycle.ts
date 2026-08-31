import { useCallback, useRef, useState } from "react";
import type { CommandHistorySession } from "@timing-chart-v2/history";
import { validateDocumentResourceBudget, type CanonicalDocument, type DocumentProblem, type ParsedCanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import { canonicalDocumentOf, createNewDocumentFromProductTemplate, MAX_OPEN_FILE_BYTES, openFileByteBudgetProblem, parseOpenDocument, serializeSaveDocument } from "../file-document-controller.js";

export type PendingDocumentAction = Readonly<{ kind: "new" | "open"; requestId: number; text?: string }>;
export type CompatibilityPreview = Readonly<{ sourceFormatVersion: number; sourceText: string; readOnly: boolean }>;

export type DocumentReplacement = Readonly<{
  document: CanonicalDocument;
  session: CommandHistorySession;
  documentEpoch: number;
  migrationWarnings: readonly { code: string; path: string; message: string }[];
}>;

type LifecycleEffects = Readonly<{
  beginOpenMeasurement: (commandStartedAt?: number, fileReadStartedAt?: number) => void;
  markOpenPhase: (phase: string, phaseTimestamp?: number) => void;
  applyReplacement: (replacement: DocumentReplacement) => void;
}>;

type DocumentApplicationPort = Pick<EditorApplicationOwner,
  "history" | "runtime" | "replaceSession" | "publishHistory" | "setProblem" | "setRuntimeDiagnostics"
>;

function openProblems(problems: readonly DocumentProblem[]): readonly DocumentProblem[] {
  return problems.map((item) => ({
    ...item,
    severity: "error" as const,
    operation: "document.open",
    operationLabel: "Open document",
    source: "open" as const,
    stage: item.line !== undefined || item.column !== undefined ? "parse" as const : "validate" as const,
    detail: `open-failure:${item.code}${item.detail ? `;${item.detail}` : ""}`,
  }));
}

export function useDocumentLifecycle({
  application,
  productTemplate,
  persistText,
}: {
  readonly application: DocumentApplicationPort;
  readonly productTemplate: CanonicalDocument;
  readonly persistText: (text: string, filename: string) => void;
}) {
  const [pendingAction, setPendingAction] = useState<PendingDocumentAction | undefined>();
  const [compatibilityPreview, setCompatibilityPreview] = useState<CompatibilityPreview | undefined>();
  const requestIdRef = useRef(0);
  const fileReadStartedAtRef = useRef<number | undefined>(undefined);
  const effectsRef = useRef<LifecycleEffects | undefined>(undefined);

  const replaceDocument = useCallback((input: CanonicalDocument | ParsedCanonicalDocument, migrationWarnings: readonly { code: string; path: string; message: string }[] = []) => {
    const document = canonicalDocumentOf(input);
    const resourceProblems = validateDocumentResourceBudget(document);
    if (resourceProblems.length > 0) {
      const diagnostics = openProblems(resourceProblems).map((item) => ({ ...item, recommendation: "Reduce the document resource count, then retry Open." }));
      application.setProblem(diagnostics.map((item) => item.message).join(" "));
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), ...diagnostics]);
      return false;
    }
    const migrationDiagnostics = migrationWarnings.map((warning, index) => ({ code: warning.code, path: `${warning.path}[migration:${index}]`, message: warning.message }));
    const documentEpoch = application.runtime.documentEpoch.advance();
    const session = application.replaceSession(input, migrationDiagnostics);
    setCompatibilityPreview(undefined);
    effectsRef.current?.applyReplacement({ document, session, documentEpoch, migrationWarnings });
    return true;
  }, [application]);

  const openText = useCallback((text: string) => {
    const fileReadStartedAt = fileReadStartedAtRef.current;
    fileReadStartedAtRef.current = undefined;
    effectsRef.current?.beginOpenMeasurement(undefined, fileReadStartedAt);
    effectsRef.current?.markOpenPhase("file-read-complete");
    const parsed = parseOpenDocument(text);
    effectsRef.current?.markOpenPhase("parse-done");
    if (!parsed.ok) {
      if (parsed.kind === "unsupported-version") {
        setCompatibilityPreview({ sourceFormatVersion: parsed.sourceFormatVersion ?? -1, sourceText: text, readOnly: false });
        application.setProblem("");
        application.setRuntimeDiagnostics((current) => current.filter((item) => !item.detail?.startsWith("open-failure:")));
        return false;
      }
      const diagnostics = openProblems(parsed.problems);
      application.setProblem(diagnostics.map((item) => item.message).join(" "));
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), ...diagnostics]);
      return false;
    }
    effectsRef.current?.markOpenPhase("validate-done");
    return replaceDocument(parsed, parsed.warnings);
  }, [application, replaceDocument]);

  const performAction = useCallback((action: PendingDocumentAction) => {
    if (action.requestId !== requestIdRef.current) return false;
    if (action.kind === "new") {
      effectsRef.current?.beginOpenMeasurement();
      return replaceDocument(createNewDocumentFromProductTemplate(productTemplate, `document_${Date.now()}`));
    }
    return action.text === undefined ? false : openText(action.text);
  }, [openText, productTemplate, replaceDocument]);

  const requestAction = useCallback((action: Omit<PendingDocumentAction, "requestId">, requestId = ++requestIdRef.current) => {
    if (requestId !== requestIdRef.current) return;
    const pending: PendingDocumentAction = { ...action, requestId };
    if (application.history.dirty) setPendingAction(pending);
    else performAction(pending);
  }, [application.history.dirty, performAction]);

  const requestNew = useCallback(() => requestAction({ kind: "new" }), [requestAction]);
  const requestOpenText = useCallback((text: string, requestId?: number) => requestAction({ kind: "open", text }, requestId), [requestAction]);
  const readFile = useCallback(async (file: File) => {
    const requestId = ++requestIdRef.current;
    fileReadStartedAtRef.current = undefined;
    if (file.size > MAX_OPEN_FILE_BYTES) {
      const diagnostic = openFileByteBudgetProblem(file);
      application.setProblem(diagnostic.message);
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
      return;
    }
    fileReadStartedAtRef.current = globalThis.performance.now();
    try {
      const text = await file.text();
      if (requestId !== requestIdRef.current) return;
      requestOpenText(text, requestId);
    } catch {
      if (requestId !== requestIdRef.current) return;
      fileReadStartedAtRef.current = undefined;
      application.setProblem("Open failed.");
    }
  }, [application, requestOpenText]);

  const cancelPending = useCallback(() => setPendingAction(undefined), []);
  const discardPending = useCallback(() => {
    const action = pendingAction;
    setPendingAction(undefined);
    if (action) performAction(action);
  }, [pendingAction, performAction]);

  const reportSaveFailure = useCallback((error: unknown, stage: "serialize" | "storage") => {
    const candidate = error as { problems?: unknown };
    const problems = Array.isArray(candidate?.problems) ? candidate.problems.filter((item): item is DocumentProblem => item !== null && typeof item === "object" && typeof (item as { code?: unknown }).code === "string" && typeof (item as { path?: unknown }).path === "string" && typeof (item as { message?: unknown }).message === "string") : [];
    const reason = error instanceof Error ? error.message : "Save failed.";
    const diagnostics: readonly DocumentProblem[] = problems.length > 0
      ? problems.map((item) => ({ ...item, severity: "error" as const, operation: "document.save", operationLabel: "Save document", source: "save" as const, stage, recommendation: "Fix the reported field and retry Save.", detail: `save-failure:${stage}:${item.code}` }))
      : [{ code: stage === "storage" ? "SAVE_FAILED" : "SAVE_SERIALIZE_FAILED", path: "$.document", message: `Save document failed: ${reason}`, severity: "error" as const, operation: "document.save", operationLabel: "Save document", source: "save" as const, stage, recommendation: stage === "storage" ? "Retry the download or choose Save As; the document remains unchanged." : "Fix the reported document problem, then retry Save.", detail: `save-failure:${stage}` }];
    application.setProblem(diagnostics.map((item) => item.message).join(" "));
    application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("save-failure:")), ...diagnostics]);
  }, [application]);

  const save = useCallback((filename: string) => {
    const session = application.runtime.session.current();
    let text: string;
    try { text = serializeSaveDocument(session.getSnapshot().document); }
    catch (error) { reportSaveFailure(error, "serialize"); return false; }
    const persistedRevision = session.getSnapshot().revision;
    try { persistText(text, filename); }
    catch (error) { reportSaveFailure(error, "storage"); return false; }
    try { localStorage.setItem("timing-chart-v2.recent", text); }
    catch (error) { reportSaveFailure(error, "storage"); return false; }
    if (session.getSnapshot().revision === persistedRevision) session.markClean();
    application.publishHistory();
    application.setRuntimeDiagnostics((current) => current.filter((item) => !item.detail?.startsWith("save-failure:")));
    application.setProblem("");
    return true;
  }, [application, persistText, reportSaveFailure]);

  const saveAs = useCallback((name: string) => save(`${name}.tcd`), [save]);
  const savePendingAndContinue = useCallback((filename: string) => {
    if (!pendingAction || !save(filename)) return false;
    const action = pendingAction;
    setPendingAction(undefined);
    performAction(action);
    return true;
  }, [pendingAction, performAction, save]);
  const openRecent = useCallback(() => {
    const text = localStorage.getItem("timing-chart-v2.recent");
    if (text) requestOpenText(text);
    else application.setProblem("No recent document is available.");
  }, [application, requestOpenText]);
  const attachEffects = useCallback((effects: LifecycleEffects) => {
    effectsRef.current = effects;
    return () => { if (effectsRef.current === effects) effectsRef.current = undefined; };
  }, []);

  return {
    pendingAction,
    compatibilityPreview,
    requestNew,
    requestOpenText,
    readFile,
    cancelPending,
    discardPending,
    save,
    saveAs,
    savePendingAndContinue,
    openRecent,
    enterCompatibilityReadOnly: () => setCompatibilityPreview((current) => current ? { ...current, readOnly: true } : current),
    closeCompatibility: () => setCompatibilityPreview(undefined),
    attachEffects,
  } as const;
}

export type DocumentLifecycleOwner = ReturnType<typeof useDocumentLifecycle>;
