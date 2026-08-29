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

export type ProblemTarget = Readonly<{ kind: "signal" | "group" | "annotation" | "transaction" | "timeline"; id?: string }>;

/** Resolves canonical validation paths/IDs without persisting diagnostics as editor state. */
export function resolveProblemTarget(path: string, document: {
  readonly signals: readonly Readonly<{ id: string }>[];
  readonly signalGroups: readonly Readonly<{ id: string }>[];
  readonly annotations: readonly Readonly<{ id: string }>[];
  readonly transactions?: readonly Readonly<{ id: string }>[];
}): ProblemTarget {
  const match = /^\$\.(signals|signalGroups|annotations|transactions)\[(\d+)\]/.exec(path);
  if (!match) return { kind: "timeline" };
  const index = Number(match[2]);
  if (match[1] === "signals") return document.signals[index] ? { kind: "signal", id: document.signals[index].id } : { kind: "signal" };
  if (match[1] === "signalGroups") return document.signalGroups[index] ? { kind: "group", id: document.signalGroups[index].id } : { kind: "group" };
  if (match[1] === "transactions") return document.transactions?.[index] ? { kind: "transaction", id: document.transactions[index].id } : { kind: "transaction" };
  return document.annotations[index] ? { kind: "annotation", id: document.annotations[index].id } : { kind: "annotation" };
}
