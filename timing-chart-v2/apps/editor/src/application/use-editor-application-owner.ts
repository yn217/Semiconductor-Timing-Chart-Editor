import { useCallback, useRef, useState } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { deriveTimingDiagnostics, deriveTimingDiagnosticsIfInputsChanged, type CanonicalSnapshot, type TimingDiagnostic } from "@timing-chart-v2/core";
import type { HistoryState } from "@timing-chart-v2/history";
import { validateCanonicalDocument, type CanonicalDocument, type CommandId, type DocumentProblem, type ParsedCanonicalDocument } from "@timing-chart-v2/schema";
import { buildCommandRejectionDiagnostics } from "../command-diagnostics.js";
import { EditorApplicationRuntime } from "../runtime/editor-application-runtime.js";

type AcceptedCommandResult = Extract<CommandResult, { readonly ok: true }>;
type AcceptedContext = Readonly<{ operation: string; command?: SemanticCommand; batchId?: CommandId }>;
type AcceptedHandler = (result: AcceptedCommandResult, context: AcceptedContext) => void;

function withoutCommandRejectionDiagnostics(current: readonly DocumentProblem[]): readonly DocumentProblem[] {
  const next = current.filter((item) => !item.detail?.startsWith("command-rejection:"));
  return next.length === current.length ? current : next;
}

function commandDiagnosticTarget(command: SemanticCommand | undefined): Pick<DocumentProblem, "objectType" | "objectId"> {
  if (!command) return {};
  if ("signalId" in command) return { objectType: "signal", objectId: command.signalId };
  if ("groupId" in command) return { objectType: "group", objectId: command.groupId };
  if ("annotationId" in command) return { objectType: "annotation", objectId: command.annotationId };
  if ("transactionId" in command) return { objectType: "transaction", objectId: command.transactionId };
  if ("spacerId" in command) return { objectType: "spacer", objectId: command.spacerId };
  if ("bookmarkId" in command) return { objectType: "bookmark", objectId: command.bookmarkId };
  if ("timeGroupId" in command) return { objectType: "timeGroup", objectId: command.timeGroupId };
  if (command.type === "signal.create") return { objectType: "signal", objectId: command.signal.id };
  if (command.type === "signal.bulkCreate") return command.signals[0] ? { objectType: "signal", objectId: command.signals[0].id } : { objectType: "signal" };
  if (command.type === "group.create") return { objectType: "group", objectId: command.group.id };
  if (command.type === "transaction.create") return { objectType: "transaction", objectId: command.transaction.id };
  if (command.type === "annotation.create") return { objectType: "annotation", objectId: command.annotation.id };
  if (command.type === "bookmark.create") return { objectType: "bookmark", objectId: command.bookmark.id };
  if (command.type === "timeGroup.create") return { objectType: "timeGroup", objectId: command.timeGroup.id };
  if (command.type === "spacer.create") return { objectType: "spacer", objectId: command.spacer.id };
  return {};
}

export function useEditorApplicationOwner(initialDocument: CanonicalDocument) {
  const runtimeRef = useRef<EditorApplicationRuntime | null>(null);
  if (runtimeRef.current === null) runtimeRef.current = new EditorApplicationRuntime(initialDocument);
  const runtime = runtimeRef.current;
  const [snapshot, setSnapshot] = useState<CanonicalSnapshot>(() => runtime.session.snapshot());
  const [history, setHistory] = useState<HistoryState>(() => runtime.session.current().historyState());
  const [problem, setProblem] = useState("");
  const [validationPending, setValidationPending] = useState(false);
  const timingDiagnosticsDocumentRef = useRef(initialDocument);
  const timingDiagnosticsRef = useRef<readonly TimingDiagnostic[]>([]);
  // #175: proves "View-only React rerender never runs a full Canonical
  // validation pass" mechanically rather than by inspection -- this counts
  // actual `validateCanonicalDocument` calls (the expensive whole-document
  // pass), not every `setValidationDiagnostics` update (dispatchResult/
  // replaceSession below only ever clear/reset the array on a completed
  // command or a document replace; they never re-run the validator itself).
  // Published to `sessionCounters` (see minimal-cycle-view.tsx's
  // `publishRendererState` call) so an e2e test can assert the delta is 0
  // across Selection/Ribbon-tab/Zoom/Scroll/panel-resize.
  const validatorInvocationsRef = useRef(0);
  const [validationDiagnostics, setValidationDiagnostics] = useState<readonly DocumentProblem[]>(() => {
    validatorInvocationsRef.current += 1;
    const timingDiagnostics = deriveTimingDiagnostics(initialDocument);
    timingDiagnosticsRef.current = timingDiagnostics;
    return [...validateCanonicalDocument(initialDocument), ...timingDiagnostics];
  });
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<readonly DocumentProblem[]>([]);
  const acceptedHandlerRef = useRef<AcceptedHandler | undefined>(undefined);
  const openDiagnosticsGenerationRef = useRef(0);
  const pendingOpenDiagnosticsRef = useRef<Readonly<{ generation: number; document: CanonicalDocument; revision: number }> | undefined>(undefined);
  const pendingOpenDiagnosticsCompletionRef = useRef<(() => void) | undefined>(undefined);

  const dispatchResult = useCallback((result: CommandResult, context: AcceptedContext): CommandResult => {
    if (!result.ok) {
      const target = commandDiagnosticTarget(context.command);
      const diagnostics = buildCommandRejectionDiagnostics({
        result,
        operation: context.operation,
        ...((context.command?.id ?? context.batchId) === undefined ? {} : { commandId: context.command?.id ?? context.batchId }),
        target,
      });
      setProblem(result.reason === "no-op" ? "" : diagnostics.map((item) => item.message).join(" "));
      setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("command-rejection:")), ...diagnostics]);
      return result;
    }
    setSnapshot(result.snapshot);
    setHistory(runtime.session.current().historyState());
    const interruptedOpenDiagnostics = pendingOpenDiagnosticsRef.current !== undefined;
    openDiagnosticsGenerationRef.current += 1;
    pendingOpenDiagnosticsRef.current = undefined;
    const completePendingOpenDiagnostics = pendingOpenDiagnosticsCompletionRef.current;
    pendingOpenDiagnosticsCompletionRef.current = undefined;
    // Keep Problems derived from the committed Canonical snapshot. Clearing
    // the previous list after every successful command made an unchanged or
    // newly introduced timing warning disappear until the user manually ran
    // Refresh Checks. Undo/Redo use this same accepted-result path, so their
    // diagnostics stay aligned with the resulting document as well.
    // #744: the DocumentSession already ran the ONE authoritative canonical validation for this commit (execute / batch / Undo / Redo)
    // and rejects any candidate with a problem, so an accepted snapshot has no canonical problems by construction. Do not rescan the
    // structure here (validatorInvocations stays put); only the timing diagnostics are derived again.
    const nextDocument = result.snapshot.document;
    const diagnosticsUpdate = interruptedOpenDiagnostics
      ? { diagnostics: deriveTimingDiagnostics(nextDocument), recomputed: true }
      : deriveTimingDiagnosticsIfInputsChanged(timingDiagnosticsDocumentRef.current, nextDocument, timingDiagnosticsRef.current);
    if (diagnosticsUpdate.recomputed) {
      timingDiagnosticsDocumentRef.current = nextDocument;
      timingDiagnosticsRef.current = diagnosticsUpdate.diagnostics;
    }
    setValidationDiagnostics(diagnosticsUpdate.diagnostics);
    setValidationPending(false);
    completePendingOpenDiagnostics?.();
    setProblem("");
    setRuntimeDiagnostics(withoutCommandRejectionDiagnostics);
    acceptedHandlerRef.current?.(result, context);
    return result;
  }, [runtime]);

  const execute = useCallback((command: SemanticCommand) => dispatchResult(runtime.session.execute(command), { operation: command.type, command }), [dispatchResult, runtime]);
  const executeBatch = useCallback((id: CommandId, commands: readonly SemanticCommand[]) => dispatchResult(runtime.session.executeBatch(id, commands), { operation: `batch:${id}`, batchId: id }), [dispatchResult, runtime]);
  const undo = useCallback(() => dispatchResult(runtime.session.undo(), { operation: "history.undo" }), [dispatchResult, runtime]);
  const redo = useCallback(() => dispatchResult(runtime.session.redo(), { operation: "history.redo" }), [dispatchResult, runtime]);
  const attachAcceptedHandler = useCallback((handler: AcceptedHandler) => {
    acceptedHandlerRef.current = handler;
    return () => { if (acceptedHandlerRef.current === handler) acceptedHandlerRef.current = undefined; };
  }, []);
  const replaceSession = useCallback((document: CanonicalDocument | ParsedCanonicalDocument, diagnostics: readonly DocumentProblem[] = []) => {
    const session = runtime.session.replace(document);
    setSnapshot(session.getSnapshot());
    setHistory(session.historyState());
    const canonical = session.getSnapshot().document;
    const generation = ++openDiagnosticsGenerationRef.current;
    pendingOpenDiagnosticsCompletionRef.current = undefined;
    pendingOpenDiagnosticsRef.current = { generation, document: canonical, revision: session.getSnapshot().revision };
    setValidationDiagnostics([]);
    setValidationPending(true);
    setProblem("");
    setRuntimeDiagnostics(diagnostics);
    return session;
  }, [runtime]);
  const runPendingTimingDiagnostics = useCallback((onComplete?: () => void) => {
    const pending = pendingOpenDiagnosticsRef.current;
    if (!pending) { onComplete?.(); return; }
    pendingOpenDiagnosticsCompletionRef.current = onComplete;
    // Run in a later task so the browser can paint the already-published
    // primary presentation before the full-document Problems derivation.
    globalThis.setTimeout(() => {
      if (pendingOpenDiagnosticsRef.current?.generation !== pending.generation || openDiagnosticsGenerationRef.current !== pending.generation) return;
      const current = runtime.session.snapshot();
      if (current.revision !== pending.revision || current.document !== pending.document) return;
      const diagnostics = deriveTimingDiagnostics(pending.document);
      const latest = runtime.session.snapshot();
      if (pendingOpenDiagnosticsRef.current?.generation !== pending.generation || latest.revision !== pending.revision || latest.document !== pending.document) return;
      pendingOpenDiagnosticsRef.current = undefined;
      pendingOpenDiagnosticsCompletionRef.current = undefined;
      timingDiagnosticsDocumentRef.current = pending.document;
      timingDiagnosticsRef.current = diagnostics;
      setValidationDiagnostics(diagnostics);
      setValidationPending(false);
      onComplete?.();
    }, 0);
  }, [runtime]);
  const publishHistory = useCallback(() => setHistory(runtime.session.current().historyState()), [runtime]);
  // The one production entry point that actually re-runs the validator on
  // demand (wired to the "Refresh Checks" command) -- every other diagnostic
  // update above only clears/resets the array.
  const validateDocument = useCallback((document: CanonicalDocument) => {
    validatorInvocationsRef.current += 1;
    const timingDiagnostics = deriveTimingDiagnostics(document);
    const problems = [...validateCanonicalDocument(document), ...timingDiagnostics];
    timingDiagnosticsDocumentRef.current = document;
    timingDiagnosticsRef.current = timingDiagnostics;
    openDiagnosticsGenerationRef.current += 1;
    pendingOpenDiagnosticsRef.current = undefined;
    const completePendingOpenDiagnostics = pendingOpenDiagnosticsCompletionRef.current;
    pendingOpenDiagnosticsCompletionRef.current = undefined;
    setValidationDiagnostics(problems);
    setValidationPending(false);
    completePendingOpenDiagnostics?.();
    return problems;
  }, []);

  return {
    runtime,
    snapshot,
    history,
    problem,
    validationDiagnostics,
    validationPending,
    runtimeDiagnostics,
    diagnostics: [...validationDiagnostics, ...runtimeDiagnostics] as readonly DocumentProblem[],
    execute,
    executeBatch,
    undo,
    redo,
    attachAcceptedHandler,
    replaceSession,
    runPendingTimingDiagnostics,
    publishHistory,
    setProblem,
    setValidationDiagnostics,
    setRuntimeDiagnostics,
    validateDocument,
    validatorInvocationsRef,
  } as const;
}

export type EditorApplicationOwner = ReturnType<typeof useEditorApplicationOwner>;
