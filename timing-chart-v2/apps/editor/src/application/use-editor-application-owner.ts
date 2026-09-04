import { useCallback, useRef, useState } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { HistoryState } from "@timing-chart-v2/history";
import { validateCanonicalDocument, type CanonicalDocument, type CommandId, type DocumentProblem, type ParsedCanonicalDocument } from "@timing-chart-v2/schema";
import { buildCommandRejectionDiagnostics } from "../command-diagnostics.js";
import { EditorApplicationRuntime } from "../runtime/editor-application-runtime.js";

type AcceptedCommandResult = Extract<CommandResult, { readonly ok: true }>;
type AcceptedContext = Readonly<{ operation: string; command?: SemanticCommand; batchId?: CommandId }>;
type AcceptedHandler = (result: AcceptedCommandResult, context: AcceptedContext) => void;

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
  const [validationDiagnostics, setValidationDiagnostics] = useState<readonly DocumentProblem[]>(() => validateCanonicalDocument(initialDocument));
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<readonly DocumentProblem[]>([]);
  const acceptedHandlerRef = useRef<AcceptedHandler | undefined>(undefined);

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
    setValidationDiagnostics([]);
    setProblem("");
    setRuntimeDiagnostics((current) => current.filter((item) => !item.detail?.startsWith("command-rejection:")));
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
    setValidationDiagnostics([]);
    setProblem("");
    setRuntimeDiagnostics(diagnostics);
    return session;
  }, [runtime]);
  const publishHistory = useCallback(() => setHistory(runtime.session.current().historyState()), [runtime]);

  return {
    runtime,
    snapshot,
    history,
    problem,
    validationDiagnostics,
    runtimeDiagnostics,
    diagnostics: [...validationDiagnostics, ...runtimeDiagnostics] as readonly DocumentProblem[],
    execute,
    executeBatch,
    undo,
    redo,
    attachAcceptedHandler,
    replaceSession,
    publishHistory,
    setProblem,
    setValidationDiagnostics,
    setRuntimeDiagnostics,
  } as const;
}

export type EditorApplicationOwner = ReturnType<typeof useEditorApplicationOwner>;
