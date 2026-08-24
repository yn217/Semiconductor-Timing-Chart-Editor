import type { SemanticCommandDispatcher } from "@timing-chart-v2/commands";

/** UI receives only the semantic command port; it never receives a mutation port. */
export interface UiServices {
  readonly commands: SemanticCommandDispatcher;
}

export type UiCommandHandler<Payload = unknown> = (payload: Payload) => void;

/** One routing surface shared by Ribbon, keyboard, context menus and inspectors. */
export class UiCommandRegistry {
  readonly #handlers = new Map<string, UiCommandHandler>();

  register<Payload>(name: string, handler: UiCommandHandler<Payload>): () => void {
    if (this.#handlers.has(name)) throw new Error(`UI command '${name}' is already registered.`);
    this.#handlers.set(name, handler as UiCommandHandler);
    return () => this.#handlers.delete(name);
  }

  canExecute(name: string): boolean {
    return this.#handlers.has(name);
  }

  execute<Payload = undefined>(name: string, payload?: Payload): void {
    const handler = this.#handlers.get(name);
    if (!handler) throw new Error(`UI command '${name}' is not registered.`);
    handler(payload);
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
