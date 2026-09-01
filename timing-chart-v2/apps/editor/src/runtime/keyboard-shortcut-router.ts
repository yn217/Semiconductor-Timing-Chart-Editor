import { mayRouteGlobalShortcut } from "@timing-chart-v2/ui";

export type GlobalShortcutContext = Readonly<{
  /** True while a pointer/drag gesture owns input (Range/Annotation/Transaction
   * drag in progress); global shortcuts must not fire mid-gesture. */
  isGestureActive: () => boolean;
  execute: (name: string) => void;
  /** Escape: closes any open context menu, cancels an in-progress
   * interaction preview, and resets dependency-arrow pick mode. */
  cancel: () => void;
}>;

const CONTROL_SHORTCUTS: Readonly<Record<string, string>> = {
  c: "clipboard.copy",
  x: "clipboard.cut",
  v: "clipboard.paste",
  d: "clipboard.duplicate",
  a: "selection.selectAll",
};

/** Routes Delete/Copy/Cut/Paste/Duplicate/Undo/Redo/Select All/Escape to the
 * shared UiCommandRegistry. Holds no semantic implementation of its own --
 * every branch either dispatches a named UI command or delegates to the
 * caller's `cancel`. `mayRouteGlobalShortcut` (typing/IME/dialog/gesture
 * focus classification) gates every branch below Escape so native
 * text-editing behavior and IME composition are never intercepted.
 * Returns whether the event was handled (callers should stop there and not
 * fall through to widget-specific keyboard handling, e.g. Annotation nudge). */
export function routeGlobalShortcut(event: KeyboardEvent, context: GlobalShortcutContext): boolean {
  if (!(event.target instanceof Element) || !mayRouteGlobalShortcut(event, context.isGestureActive())) return false;
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      context.execute(event.shiftKey ? "history.redo" : "history.undo");
      return true;
    }
    const command = CONTROL_SHORTCUTS[key];
    if (command) {
      event.preventDefault();
      context.execute(command);
      return true;
    }
  }
  if (event.key === "Delete") {
    event.preventDefault();
    context.execute("selection.delete");
    return true;
  }
  if (event.key === "Escape") {
    context.cancel();
    return true;
  }
  return false;
}
