import { keyboardScope, mayRouteGlobalShortcut } from "@timing-chart-v2/ui";

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
 * focus classification) gates every branch except Escape, which gets its
 * own narrower check (still excludes native text editing/an open dialog,
 * but -- unlike every other branch -- is explicitly allowed to fire during
 * an active gesture, since cancelling that gesture is Escape's job) so
 * native text-editing behavior and IME composition are never intercepted.
 * Returns whether the event was handled (callers should stop there and not
 * fall through to widget-specific keyboard handling, e.g. Annotation nudge). */
export function routeGlobalShortcut(event: KeyboardEvent, context: GlobalShortcutContext): boolean {
  if (!(event.target instanceof Element)) return false;
  // #421: Escape must still cancel an in-progress Annotation drag (the
  // gesture `mayRouteGlobalShortcut` exists to protect from -- Undo/Redo/
  // Copy/Paste/Delete must never fire mid-gesture) -- it's the one global
  // shortcut whose whole purpose IS to end a gesture, so it gets its own,
  // narrower gate: never during native text editing or an open dialog,
  // but explicitly allowed during the "gesture" scope that blocks every
  // other branch below.
  if (event.key === "Escape" && !event.isComposing) {
    const scope = keyboardScope(event.target, false);
    if (scope !== "editable" && scope !== "modal") { context.cancel(); return true; }
  }
  if (!mayRouteGlobalShortcut(event, context.isGestureActive())) return false;
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      context.execute(event.shiftKey ? "history.redo" : "history.undo");
      return true;
    }
    // Ctrl+Y is the Windows-native Redo; Ctrl+Shift+Z stays the cross-platform one.
    if (key === "y" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      context.execute("history.redo");
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
  return false;
}
