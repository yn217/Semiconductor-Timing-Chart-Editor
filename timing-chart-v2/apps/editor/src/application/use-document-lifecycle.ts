import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { validateDocumentResourceBudget, type CanonicalDocument, type DocumentProblem, type ParsedCanonicalDocument, type ScenarioDocumentModel } from "@timing-chart-v2/schema";
import type { ActiveEditorSession } from "../runtime/editor-session-controller.js";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import { commitDocumentReplacement } from "./document-replacement.js";
import { documentIdFromRecentText, isLegacyRecentDocument, loadRecentDocument, recentRecordMatches, saveRecentDocument, type RecentDocumentIdentity, type RecentDocumentMetadata, type RecentDocumentRecord } from "./recent-document-storage.js";
import { canonicalDocumentOf, createNewDocumentFromProductTemplate, decodeOpenDocumentBytes, MAX_OPEN_FILE_BYTES, openFileByteBudgetProblem, parseEditorDocument } from "../file-document-controller.js";
import { documentFilename } from "../document-filename.js";
import { randomId } from "../random-id.js";

const RECENT_KEY = "timing-chart-v2.recent";
const RECENT_META_KEY = "timing-chart-v2.recent-meta";

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
  const generation = randomId();
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

export type PendingDocumentAction = Readonly<{ kind: "new" | "open"; requestId: number; text?: string; filename?: string | undefined }>;
// The file name the user last chose (Save As) or opened for the current document. Tagged with the document epoch so any replacement drops it.
type RememberedFilename = Readonly<{ filename: string; documentEpoch: number }>;
export type CompatibilityPreview = Readonly<{ sourceFormatVersion: number; sourceText: string; readOnly: boolean }>;

export type DocumentReplacement = Readonly<{
  document: CanonicalDocument;
  session: ActiveEditorSession;
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
  | "replaceScenarioSession" | "setOperationMessage"
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
  const readSeqRef = useRef(0);
  const rememberedFilenameRef = useRef<RememberedFilename | undefined>(undefined);
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

  const replaceScenarioDocument = useCallback((model: ScenarioDocumentModel) => {
    let session!: ActiveEditorSession;
    let documentEpoch = 0;
    try {
      flushSync(() => {
        session = application.replaceScenarioSession(model);
        documentEpoch = application.runtime.documentEpoch.advance();
      });
    } catch (error) {
      application.setProblem(`The Scenario document could not be opened: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    setCompatibilityPreview(undefined);
    effectsRef.current?.applyReplacement({ document: session.getSnapshot().document as CanonicalDocument, session, documentEpoch, migrationWarnings: [] });
    return true;
  }, [application]);

  const openText = useCallback((text: string) => {
    const fileReadStartedAt = fileReadStartedAtRef.current;
    fileReadStartedAtRef.current = undefined;
    effectsRef.current?.beginOpenMeasurement(undefined, fileReadStartedAt);
    effectsRef.current?.markOpenPhase("file-read-complete");
    const parsed = parseEditorDocument(text);
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
    return parsed.kind === "scenario"
      ? replaceScenarioDocument(parsed.model)
      : replaceDocument(parsed.document, parsed.document.warnings);
  }, [application, replaceDocument, replaceScenarioDocument]);

  const rememberFilename = useCallback((filename: string | undefined) => {
    rememberedFilenameRef.current = filename === undefined ? undefined : { filename, documentEpoch: application.runtime.documentEpoch.current() };
  }, [application.runtime]);

  // Returns the remembered name only while the same document epoch is current; New, Open, Recent and any other replacement drop it.
  const rememberedFilename = useCallback((): string | undefined => {
    const remembered = rememberedFilenameRef.current;
    return remembered !== undefined && remembered.documentEpoch === application.runtime.documentEpoch.current() ? remembered.filename : undefined;
  }, [application.runtime]);

  const performAction = useCallback((action: PendingDocumentAction) => {
    if (action.requestId !== requestIdRef.current) return false;
    if (action.kind === "new") {
      effectsRef.current?.beginOpenMeasurement();
      const created = replaceDocument(createNewDocumentFromProductTemplate(productTemplate, `document_${Date.now()}`));
      if (created) rememberFilename(undefined);
      return created;
    }
    if (action.text === undefined) return false;
    const opened = openText(action.text);
    // Remember the opened file's name after the replacement advanced the epoch, so the name belongs to the document just opened.
    if (opened) rememberFilename(action.filename);
    return opened;
  }, [openText, productTemplate, rememberFilename, replaceDocument]);

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
  const requestOpenText = useCallback((text: string, requestId?: number, filename?: string) => requestAction({ kind: "open", text, filename }, requestId), [requestAction]);
  // `sourceName` is the picked or dropped file's name; it becomes the remembered Save name once the document opens.
  const requestOpenBytes = useCallback((bytes: ArrayBuffer | Uint8Array, sourceName?: string, requestId = ++requestIdRef.current) => {
    if (requestId !== requestIdRef.current) return;
    const byteLength = bytes.byteLength;
    if (byteLength > MAX_OPEN_FILE_BYTES) {
      fileReadStartedAtRef.current = undefined;
      const diagnostic = openFileByteBudgetProblem({ name: sourceName ?? "selected document", size: byteLength });
      application.setProblem(diagnostic.message);
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
      return;
    }
    try {
      requestOpenText(decodeOpenDocumentBytes(bytes), requestId, sourceName === undefined ? undefined : documentFilename(sourceName));
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      fileReadStartedAtRef.current = undefined;
      application.setProblem(`Could not decode document: ${errorReason(error, "Invalid file bytes.")}`);
    }
  }, [application, requestOpenText]);
  const readFile = useCallback(async (file: File) => {
    // A file rejected by the size budget or failing to read must not supersede a pending New/Open (for example one awaiting the
    // Unsaved Changes answer), so the request id is claimed only once the bytes are in hand. A newer readFile still supersedes an older one.
    if (file.size > MAX_OPEN_FILE_BYTES) {
      const diagnostic = openFileByteBudgetProblem(file);
      application.setProblem(diagnostic.message);
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
      return;
    }
    const readSeq = ++readSeqRef.current;
    const baselineRequestId = requestIdRef.current;
    const superseded = () => readSeq !== readSeqRef.current || baselineRequestId !== requestIdRef.current;
    fileReadStartedAtRef.current = globalThis.performance.now();
    try {
      const bytes = await file.arrayBuffer();
      if (superseded()) return;
      requestOpenBytes(bytes, file.name);
    } catch (error) {
      if (superseded()) return;
      fileReadStartedAtRef.current = undefined;
      const diagnostic: DocumentProblem = { code: "OPEN_READ_FAILED", path: "$", message: `Could not read ${file.name || "selected file"}: ${errorReason(error, "File access failed.")}`, severity: "error", operation: "document.open", operationLabel: "Open document", source: "open", stage: "storage", recommendation: "Check file access permissions or choose another file, then retry Open.", detail: "open-failure:read" };
      application.setProblem(diagnostic.message);
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
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
      text = application.runtime.session.serializeCurrentDocument();
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
    application.setProblem("");
    application.setOperationMessage(`Saved: ${filename}`);
    application.setRuntimeDiagnostics((current) => current.filter((item) => !isSaveDiagnostic(item)));
    const recentWriteStartedAt = performance.now();
    const identity = createRecentIdentity(filename, savedDocument.document.id, text.length);
    const recentWrite = recentWriteRef.current.catch(() => undefined).then(async () => {
      await saveRecentDocument(text, identity);
      const recentMetadataStartedAt = performance.now();
      try {
        publishRecentMetadata(identity, savedDocument.document.title);
      } finally {
        recordSaveMeasure("timing-chart-v2.save.recent-metadata", recentMetadataStartedAt, { characters: text.length });
      }
    });
    recentWriteRef.current = recentWrite.catch((error: unknown) => {
      if (application.runtime.session.current() !== session) return;
      const diagnostic = recentSaveWarning(error);
      application.setRuntimeDiagnostics((current) => [...current.filter((item) => item.code !== "SAVE_RECENT_FAILED"), diagnostic]);
      application.setProblem(`Saved successfully. ${diagnostic.message}`);
    }).finally(() => {
      recordSaveMeasure("timing-chart-v2.save.recent-write", recentWriteStartedAt, { characters: text.length });
    });
    return true;
  }, [application, persistText, reportSaveFailure]);

  // Save As is an explicit choice, so later Saves of this document reuse it (until the document is replaced).
  const saveAs = useCallback((name: string) => {
    const filename = documentFilename(name);
    const saved = save(filename);
    if (saved) rememberFilename(filename);
    return saved;
  }, [rememberFilename, save]);
  // Plain Save uses the remembered name when there is one, otherwise the fallback derived from the document title.
  const saveCurrent = useCallback((fallbackFilename: string) => save(rememberedFilename() ?? fallbackFilename), [rememberedFilename, save]);
  const savePendingAndContinue = useCallback((filename: string) => {
    if (!pendingAction || !save(rememberedFilename() ?? filename)) return false;
    const action = pendingAction;
    setPendingAction(undefined);
    performAction(action);
    return true;
  }, [pendingAction, performAction, rememberedFilename, save]);
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
      // Corrupt metadata must not block the legacy-copy fallback below (publishRecentMetadata guards the same parse).
      let parsedMetadata: unknown = null;
      try { parsedMetadata = JSON.parse(localStorage.getItem(RECENT_META_KEY) ?? "null"); } catch { parsedMetadata = null; }
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
    saveCurrent,
    savePendingAndContinue,
    openRecent,
    enterCompatibilityReadOnly: () => setCompatibilityPreview((current) => current ? { ...current, readOnly: true } : current),
    closeCompatibility: () => setCompatibilityPreview(undefined),
    attachEffects,
  } as const;
}

export type DocumentLifecycleOwner = ReturnType<typeof useDocumentLifecycle>;
