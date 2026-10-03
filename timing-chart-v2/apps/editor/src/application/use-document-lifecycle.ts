import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { CommandHistorySession } from "@timing-chart-v2/history";
import { validateDocumentResourceBudget, type CanonicalDocument, type DocumentProblem, type ParsedCanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import { commitDocumentReplacement } from "./document-replacement.js";
import { documentIdFromRecentText, isLegacyRecentDocument, loadRecentDocument, recentRecordMatches, saveRecentDocument, type RecentDocumentIdentity, type RecentDocumentMetadata, type RecentDocumentRecord } from "./recent-document-storage.js";
import { canonicalDocumentOf, createNewDocumentFromProductTemplate, decodeOpenDocumentBytes, MAX_OPEN_FILE_BYTES, openFileByteBudgetProblem, parseOpenDocument, serializeSaveDocument } from "../file-document-controller.js";

const RECENT_KEY = "timing-chart-v2.recent";
const RECENT_META_KEY = "timing-chart-v2.recent-meta";
let recentGenerationSequence = 0;

type RecentMetadata = {
  contentKept?: boolean;
  filename?: string;
  title?: string;
  documentId?: string;
  generation?: string;
  savedAt?: number;
  size?: number;
  storageVersion?: number;
  [key: string]: unknown;
};

function createRecentIdentity(filename: string, documentId: string, size: number): RecentDocumentIdentity {
  const savedAt = Date.now();
  const generation = globalThis.crypto?.randomUUID?.() ?? `${savedAt}-${++recentGenerationSequence}`;
  return { filename, documentId, generation, savedAt, size };
}

function publishRecentMetadata(identity: RecentDocumentIdentity, title: string): void {
  let previousStorageVersion: unknown;
  try {
    const previous: unknown = JSON.parse(localStorage.getItem(RECENT_META_KEY) ?? "null");
    if (typeof previous === "object" && previous !== null) previousStorageVersion = (previous as { storageVersion?: unknown }).storageVersion;
  } catch { /* Missing/corrupt metadata requires one-time legacy cleanup. */ }
  localStorage.setItem(RECENT_META_KEY, JSON.stringify({ ...identity, title, contentKept: true, storageVersion: 2 }));
  if (previousStorageVersion !== 2) localStorage.removeItem(RECENT_KEY);
}

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

function isSaveDiagnostic(item: DocumentProblem): boolean {
  return item.detail?.startsWith("save-failure:") === true || item.detail?.startsWith("save-warning:") === true;
}

function errorReason(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function recordSaveMeasure(name: string, start: number, detail?: Readonly<Record<string, number>>): void {
  try {
    const end = performance.now();
    performance.clearMeasures(name);
    performance.measure(name, { start, end, ...(detail ? { detail } : {}) });
  } catch { /* Measurement must never affect Save correctness. */ }
}

function recentSaveWarning(error: unknown): DocumentProblem {
  const reason = errorReason(error, "Recent-document history could not be updated.");
  return {
    code: "SAVE_RECENT_FAILED",
    path: "$.recentDocument",
    message: `Recent-document history could not be updated: ${reason}`,
    severity: "warning",
    operation: "document.save.recent",
    operationLabel: "Update recent-document history",
    source: "save",
    stage: "storage",
    recommendation: "The file was saved successfully. Retry Save or choose Save As to update recent-document history.",
    detail: "save-warning:recent-storage",
  };
}

function recentOpenFailure(error: unknown): DocumentProblem {
  const reason = errorReason(error, "Recent-document history is unavailable.");
  return {
    code: "OPEN_RECENT_FAILED",
    path: "$.recentDocument",
    message: `Open recent document failed: ${reason}`,
    severity: "error",
    operation: "document.open.recent",
    operationLabel: "Open recent document",
    source: "open",
    stage: "storage",
    recommendation: "Allow browser storage access or use File > Open instead.",
    detail: "open-failure:recent-storage",
  };
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
  const recentWriteRef = useRef<Promise<void>>(Promise.resolve());
  const fileReadStartedAtRef = useRef<number | undefined>(undefined);
  const effectsRef = useRef<LifecycleEffects | undefined>(undefined);

  const replaceDocument = useCallback((input: CanonicalDocument | ParsedCanonicalDocument, migrationWarnings: readonly { code: string; path: string; message: string }[] = []) => {
    // #743: the failure boundary lives in commitDocumentReplacement (validate -> replaceSession -> epoch advance once); effects are published only on success.
    // #208: the session replacement queues the React publication of the new document (title, status, Inspector, Bottom). Commit it
    // synchronously so it lands in the same task as the imperative Timeline replacement below; otherwise a frame can paint the new
    // Signal Tree / rows next to the previous document's title, status and context.
    let outcome!: ReturnType<typeof commitDocumentReplacement>;
    flushSync(() => { outcome = commitDocumentReplacement({ replaceSession: (value, diagnostics) => application.replaceSession(value, diagnostics), advanceEpoch: () => application.runtime.documentEpoch.advance() }, input, migrationWarnings); });
    if (!outcome.ok) {
      if (outcome.reason === "resource-budget") {
        const diagnostics = openProblems(outcome.problems).map((item) => ({ ...item, recommendation: "Reduce the document resource count, then retry Open." }));
        application.setProblem(diagnostics.map((item) => item.message).join(" "));
        application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), ...diagnostics]);
      } else {
        application.setProblem(`The document could not be opened: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`);
      }
      return false;
    }
    setCompatibilityPreview(undefined);
    effectsRef.current?.applyReplacement({ document: outcome.document, session: outcome.session, documentEpoch: outcome.documentEpoch, migrationWarnings });
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
    // This decision can run after an async File.text() boundary. Read the
    // replaceable session at decision time so edits made while the file was
    // loading cannot be lost because a stale React history snapshot said the
    // document was clean.
    if (application.runtime.session.current().historyState().dirty) setPendingAction(pending);
    else performAction(pending);
  }, [application.runtime, performAction]);

  const requestNew = useCallback(() => requestAction({ kind: "new" }), [requestAction]);
  const requestOpenText = useCallback((text: string, requestId?: number) => requestAction({ kind: "open", text }, requestId), [requestAction]);
  const requestOpenBytes = useCallback((bytes: ArrayBuffer | Uint8Array, sourceName = "selected document", requestId = ++requestIdRef.current) => {
    if (requestId !== requestIdRef.current) return;
    const byteLength = bytes.byteLength;
    if (byteLength > MAX_OPEN_FILE_BYTES) {
      fileReadStartedAtRef.current = undefined;
      const diagnostic = openFileByteBudgetProblem({ name: sourceName, size: byteLength });
      application.setProblem(diagnostic.message);
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
      return;
    }
    try {
      requestOpenText(decodeOpenDocumentBytes(bytes), requestId);
    } catch {
      if (requestId !== requestIdRef.current) return;
      fileReadStartedAtRef.current = undefined;
      application.setProblem("Open failed.");
    }
  }, [application, requestOpenText]);
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
      const bytes = await file.arrayBuffer();
      if (requestId !== requestIdRef.current) return;
      requestOpenBytes(bytes, file.name, requestId);
    } catch {
      if (requestId !== requestIdRef.current) return;
      fileReadStartedAtRef.current = undefined;
      application.setProblem("Open failed.");
    }
  }, [application, requestOpenBytes]);

  const cancelPending = useCallback(() => setPendingAction(undefined), []);
  const discardPending = useCallback(() => {
    const action = pendingAction;
    setPendingAction(undefined);
    if (action) performAction(action);
  }, [pendingAction, performAction]);

  const reportSaveFailure = useCallback((error: unknown, stage: "serialize" | "storage") => {
    const candidate = error as { problems?: unknown };
    const problems = Array.isArray(candidate?.problems) ? candidate.problems.filter((item): item is DocumentProblem => item !== null && typeof item === "object" && typeof (item as { code?: unknown }).code === "string" && typeof (item as { path?: unknown }).path === "string" && typeof (item as { message?: unknown }).message === "string") : [];
    const reason = errorReason(error, "Save failed.");
    const diagnostics: readonly DocumentProblem[] = problems.length > 0
      ? problems.map((item) => ({ ...item, severity: "error" as const, operation: "document.save", operationLabel: "Save document", source: "save" as const, stage, recommendation: "Fix the reported field and retry Save.", detail: `save-failure:${stage}:${item.code}` }))
      : [{ code: stage === "storage" ? "SAVE_FAILED" : "SAVE_SERIALIZE_FAILED", path: "$.document", message: `Save document failed: ${reason}`, severity: "error" as const, operation: "document.save", operationLabel: "Save document", source: "save" as const, stage, recommendation: stage === "storage" ? "Retry the download or choose Save As; the document remains unchanged." : "Fix the reported document problem, then retry Save.", detail: `save-failure:${stage}` }];
    application.setProblem(diagnostics.map((item) => item.message).join(" "));
    application.setRuntimeDiagnostics((current) => [...current.filter((item) => !isSaveDiagnostic(item)), ...diagnostics]);
  }, [application]);

  const save = useCallback((filename: string) => {
    const session = application.runtime.session.current();
    const saveSnapshot = session.getSnapshot();
    const savedDocument = saveSnapshot.document;
    let text: string;
    const serializeStartedAt = performance.now();
    try {
      text = serializeSaveDocument(savedDocument);
      recordSaveMeasure("timing-chart-v2.save.serialize", serializeStartedAt, { characters: text.length });
    } catch (error) {
      recordSaveMeasure("timing-chart-v2.save.serialize", serializeStartedAt);
      reportSaveFailure(error, "serialize");
      return false;
    }
    const persistedRevision = saveSnapshot.revision;
    const downloadStartedAt = performance.now();
    try { persistText(text, filename); }
    catch (error) {
      recordSaveMeasure("timing-chart-v2.save.download", downloadStartedAt, { characters: text.length });
      reportSaveFailure(error, "storage");
      return false;
    }
    recordSaveMeasure("timing-chart-v2.save.download", downloadStartedAt, { characters: text.length });
    if (session.getSnapshot().revision === persistedRevision) session.markClean();
    application.publishHistory();
    application.setRuntimeDiagnostics((current) => current.filter((item) => !isSaveDiagnostic(item)));
    const recentWriteStartedAt = performance.now();
    const identity = createRecentIdentity(filename, savedDocument.document.id, text.length);
    const recentWrite = recentWriteRef.current.catch(() => undefined).then(async () => {
      await saveRecentDocument(text, identity);
      const recentMetadataStartedAt = performance.now();
      try {
        publishRecentMetadata(identity, savedDocument.document.title);
        application.setProblem("");
      } finally {
        recordSaveMeasure("timing-chart-v2.save.recent-metadata", recentMetadataStartedAt, { characters: text.length });
      }
    });
    recentWriteRef.current = recentWrite.catch((error: unknown) => {
      const diagnostic = recentSaveWarning(error);
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => item.code !== "SAVE_RECENT_FAILED"), diagnostic]);
      application.setProblem(`Saved successfully. ${diagnostic.message}`);
    }).finally(() => {
      recordSaveMeasure("timing-chart-v2.save.recent-write", recentWriteStartedAt, { characters: text.length });
    });
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
  const openRecent = useCallback(async () => {
    // Claim the request BEFORE the async reads (same contract as readFile): a newer Open/New/Recent supersedes this one, and this one
    // must never publish after it.
    const requestId = ++requestIdRef.current;
    const stale = () => requestId !== requestIdRef.current;
    const queueRecentMigration = (text: string, metadata: RecentMetadata | null) => {
      const documentId = documentIdFromRecentText(text);
      if (!documentId) return;
      const filename = typeof metadata?.filename === "string" ? metadata.filename : "Recent document";
      const title = typeof metadata?.title === "string" ? metadata.title : "Recent document";
      const identity = createRecentIdentity(filename, documentId, text.length);
      recentWriteRef.current = recentWriteRef.current.catch(() => undefined).then(async () => {
        await saveRecentDocument(text, identity);
        publishRecentMetadata(identity, title);
      }).catch(() => undefined);
    };
    try {
      // A Save publishes metadata only after its IndexedDB transaction commits.
      // Wait first so this read observes the matching committed generation.
      await recentWriteRef.current;
      if (stale()) return false;
      const storedText = localStorage.getItem(RECENT_KEY);
      let metadata: (RecentMetadata & RecentDocumentMetadata) | null = null;
      const parsedMetadata: unknown = JSON.parse(localStorage.getItem(RECENT_META_KEY) ?? "null");
      if (typeof parsedMetadata === "object" && parsedMetadata !== null && !Array.isArray(parsedMetadata)) {
        metadata = parsedMetadata as RecentMetadata;
      }
      let legacyText: string | undefined;
      if (metadata?.storageVersion !== 2 && storedText) {
        try { if (isLegacyRecentDocument(JSON.parse(storedText))) legacyText = storedText; }
        catch { /* Invalid legacy storage is not a recoverable document. */ }
      }
      let record: RecentDocumentRecord | undefined;
      try { record = await loadRecentDocument(); }
      catch (error) {
        if (stale()) return false;
        if (!legacyText) throw error;
        requestOpenText(legacyText, requestId);
        queueRecentMigration(legacyText, metadata);
        return true;
      }
      if (stale()) return false;

      if (metadata?.storageVersion === 2) {
        if (!recentRecordMatches(record, metadata)) {
          const diagnostic = recentOpenFailure(new Error("The stored Recent content does not match its committed metadata."));
          application.setProblem("The latest Recent copy is unavailable or does not match its saved metadata. Use Open to reload the saved file.");
          application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
          return false;
        }
        requestOpenText(record.text, requestId);
        return true;
      }

      if (legacyText) {
        requestOpenText(legacyText, requestId);
        queueRecentMigration(legacyText, metadata);
        return true;
      }

      // Older IDB records can be reopened only when their old metadata proves
      // the same filename, timestamp, size, and canonical document identity.
      if (recentRecordMatches(record, metadata ?? {})) {
        requestOpenText(record.text, requestId);
        if (!record.generation || !record.documentId) queueRecentMigration(record.text, metadata);
        return true;
      }

      if (record && metadata?.contentKept === true) {
        const diagnostic = recentOpenFailure(new Error("The stored Recent content does not match its committed metadata."));
        application.setProblem("The latest Recent copy is unavailable or does not match its saved metadata. Use Open to reload the saved file.");
        application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
        return false;
      }
      application.setProblem(metadata?.contentKept === false
        ? "The last saved document's Recent copy is unavailable. Use Open to reload the saved file."
        : "No recent document is available.");
      return false;
    } catch (error) {
      if (stale()) return false;
      const diagnostic = recentOpenFailure(error);
      application.setProblem(diagnostic.message);
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
      return false;
    }
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
    requestOpenBytes,
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
