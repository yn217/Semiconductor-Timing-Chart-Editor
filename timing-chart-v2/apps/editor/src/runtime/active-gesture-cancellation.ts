/** Shared cancellation slot for the editor's currently active gesture. */
let activeCancel: (() => void) | undefined;
let activeHint: string | undefined;
const hintListeners = new Set<() => void>();
const publishHint = (hint: string | undefined) => { if (activeHint === hint) return; activeHint = hint; for (const listener of hintListeners) listener(); };

/** `hint` is a short status-bar sentence (e.g. "Move Transaction - drag horizontally; Esc cancels") shown while the gesture is active. */
export function registerActiveGestureCancel(cancel: () => void, hint?: string): () => void {
  activeCancel = cancel;
  publishHint(hint);
  return () => { if (activeCancel === cancel) { activeCancel = undefined; publishHint(undefined); } };
}

export function cancelActiveGesture(): boolean {
  if (activeCancel === undefined) return false;
  const cancel = activeCancel;
  activeCancel = undefined;
  publishHint(undefined);
  cancel();
  return true;
}

/** useSyncExternalStore pair for the status bar: view-only, never touches Canonical. */
export const subscribeGestureHint = (listener: () => void) => { hintListeners.add(listener); return () => { hintListeners.delete(listener); }; };
export const getGestureHint = () => activeHint;
