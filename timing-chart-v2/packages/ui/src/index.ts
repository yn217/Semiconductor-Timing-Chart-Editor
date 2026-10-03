import type { SemanticCommandDispatcher } from "@timing-chart-v2/commands";

/** UI receives only the semantic command port; it never receives a mutation port. */
export interface UiServices {
  readonly commands: SemanticCommandDispatcher;
}

export type UiCommandHandler<Payload = unknown, Result = unknown> = (payload: Payload) => Result;

export type CommandSurface = "ribbon" | "context-menu" | "keyboard" | "tree" | "inspector" | "bottom";

export interface CommandSurfaceContract {
  readonly logicalCommand: string;
  readonly canonicalCommand: string;
  readonly surfaces: Readonly<Record<CommandSurface, boolean>>;
  readonly precondition: string;
  readonly historyUnit: "one-operation" | "view-only";
}

/**
 * Production command-surface contract. This is deliberately declarative: each
 * surface remains free to present the operation differently, but supported
 * entry points must name the same semantic command and history policy.
 */
export const COMMAND_SURFACE_CONTRACTS: readonly CommandSurfaceContract[] = [
  {
    logicalCommand: "Rename",
    canonicalCommand: "signal.rename | group.rename | annotation.updateProperties",
    surfaces: { ribbon: true, "context-menu": true, keyboard: true, tree: true, inspector: true, bottom: true },
    precondition: "one selected renameable entity",
    historyUnit: "one-operation",
  },
  {
    logicalCommand: "Delete",
    canonicalCommand: "selection.delete",
    surfaces: { ribbon: true, "context-menu": true, keyboard: true, tree: true, inspector: true, bottom: true },
    precondition: "one or more deletable selected entities",
    historyUnit: "one-operation",
  },
  {
    logicalCommand: "Visibility",
    canonicalCommand: "signal.setVisibility",
    surfaces: { ribbon: true, "context-menu": true, keyboard: false, tree: true, inspector: true, bottom: true },
    precondition: "one selected Signal",
    historyUnit: "one-operation",
  },
  {
    logicalCommand: "Reorder",
    canonicalCommand: "signal.move | group.move",
    surfaces: { ribbon: true, "context-menu": true, keyboard: false, tree: true, inspector: false, bottom: false },
    precondition: "selected row and valid sibling target",
    historyUnit: "one-operation",
  },
  {
    logicalCommand: "Undo/Redo",
    canonicalCommand: "history.undo | history.redo",
    surfaces: { ribbon: true, "context-menu": false, keyboard: true, tree: false, inspector: true, bottom: true },
    precondition: "corresponding history stack is non-empty",
    historyUnit: "one-operation",
  },
] as const;

/** One routing surface shared by Ribbon, keyboard, context menus and inspectors. */
export class UiCommandRegistry {
  readonly #handlers = new Map<string, UiCommandHandler>();

  register<Payload, Result = unknown>(name: string, handler: UiCommandHandler<Payload, Result>): () => void {
    if (this.#handlers.has(name)) throw new Error(`UI command '${name}' is already registered.`);
    this.#handlers.set(name, handler as UiCommandHandler);
    return () => this.#handlers.delete(name);
  }

  canExecute(name: string): boolean {
    return this.#handlers.has(name);
  }

  execute<Payload = undefined, Result = unknown>(name: string, payload?: Payload): Result {
    const handler = this.#handlers.get(name);
    if (!handler) throw new Error(`UI command '${name}' is not registered.`);
    return handler(payload) as Result;
  }
}

export type KeyboardScope = "canvas" | "tree" | "editable" | "modal" | "gesture";

/** Classifies keyboard focus before global shortcuts are routed to semantic commands. */
export function keyboardScope(target: EventTarget | null, activeGesture = false): KeyboardScope {
  if (activeGesture) return "gesture";
  if (typeof Element === "undefined" || !(target instanceof Element)) return "canvas";
  if (target.closest("[role='dialog']")) return "modal";
  if (target.closest("input, textarea, select, [contenteditable='true']")) return "editable";
  if (target.closest("[data-role='timing-tree'], [data-role='tree-branch'], [data-role='frozen-row']")) return "tree";
  return "canvas";
}

export function mayRouteGlobalShortcut(event: Pick<KeyboardEvent, "isComposing" | "target">, activeGesture = false): boolean {
  if (event.isComposing) return false;
  const scope = keyboardScope(event.target, activeGesture);
  return scope !== "editable" && scope !== "modal" && scope !== "gesture";
}

export type ProblemTarget = Readonly<{ kind: "signal" | "group" | "annotation" | "transaction" | "timeline"; id?: string; cycle?: number }>;
export type ProblemTargetHint = Readonly<{ readonly entityId?: string; readonly objectId?: string; readonly objectType?: string; readonly sourceCycle?: number }>;

/** Resolves canonical validation paths/IDs without persisting diagnostics as editor state. */
export function resolveProblemTarget(path: string, document: {
  readonly signals: readonly Readonly<{ id: string }>[];
  readonly signalGroups: readonly Readonly<{ id: string }>[];
  readonly annotations: readonly Readonly<{ id: string }>[];
  readonly transactions?: readonly Readonly<{ id: string }>[];
  readonly constraints?: readonly Readonly<{ id: string; type: string; data?: Readonly<Record<string, unknown>> }>[];
}, hint: ProblemTargetHint = {}): ProblemTarget {
  const stableId = hint.objectId ?? hint.entityId;
  const cycle = Number.isFinite(hint.sourceCycle) ? hint.sourceCycle : undefined;
  if (stableId) {
    if (document.signals.some((item) => item.id === stableId)) return { kind: "signal", id: stableId, ...(cycle === undefined ? {} : { cycle }) };
    if (document.signalGroups.some((item) => item.id === stableId)) return { kind: "group", id: stableId, ...(cycle === undefined ? {} : { cycle }) };
    if (document.annotations.some((item) => item.id === stableId)) return { kind: "annotation", id: stableId, ...(cycle === undefined ? {} : { cycle }) };
    if (document.transactions?.some((item) => item.id === stableId)) return { kind: "transaction", id: stableId, ...(cycle === undefined ? {} : { cycle }) };
    const constraint = hint.objectType === "constraint" ? document.constraints?.find((item) => item.id === stableId) : undefined;
    if (constraint) {
      const data = constraint.data ?? {};
      const candidates = [hint.entityId, data.responseSignalId, data.acknowledgeSignalId, data.triggerSignalId, data.requestSignalId,
        ...(Array.isArray(data.stableSignalIds) ? data.stableSignalIds : [])];
      const signalId = candidates.find((candidate): candidate is string => typeof candidate === "string" && document.signals.some((signal) => signal.id === candidate));
      if (signalId) return { kind: "signal", id: signalId, ...(cycle === undefined ? {} : { cycle }) };
      return { kind: "timeline", ...(cycle === undefined ? {} : { cycle }) };
    }
  }
  const match = /^\$\.(signals|signalGroups|annotations|transactions)\[(\d+)\]/.exec(path);
  if (!match) return { kind: "timeline", ...(cycle === undefined ? {} : { cycle }) };
  const index = Number(match[2]);
  if (match[1] === "signals") return document.signals[index] ? { kind: "signal", id: document.signals[index].id, ...(cycle === undefined ? {} : { cycle }) } : { kind: "signal", ...(cycle === undefined ? {} : { cycle }) };
  if (match[1] === "signalGroups") return document.signalGroups[index] ? { kind: "group", id: document.signalGroups[index].id, ...(cycle === undefined ? {} : { cycle }) } : { kind: "group", ...(cycle === undefined ? {} : { cycle }) };
  if (match[1] === "transactions") return document.transactions?.[index] ? { kind: "transaction", id: document.transactions[index].id, ...(cycle === undefined ? {} : { cycle }) } : { kind: "transaction", ...(cycle === undefined ? {} : { cycle }) };
  return document.annotations[index] ? { kind: "annotation", id: document.annotations[index].id, ...(cycle === undefined ? {} : { cycle }) } : { kind: "annotation", ...(cycle === undefined ? {} : { cycle }) };
}
