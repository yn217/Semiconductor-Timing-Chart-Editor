/** Shared cancellation slot for the editor's currently active gesture. */
let activeCancel: (() => void) | undefined;

export function registerActiveGestureCancel(cancel: () => void): () => void {
  activeCancel = cancel;
  return () => { if (activeCancel === cancel) activeCancel = undefined; };
}

export function cancelActiveGesture(): boolean {
  if (activeCancel === undefined) return false;
  const cancel = activeCancel;
  activeCancel = undefined;
  cancel();
  return true;
}
