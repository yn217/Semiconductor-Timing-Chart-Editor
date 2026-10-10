import type { MouseEvent, ReactNode } from "react";

export function consumeOutsidePointerDown(event: PointerEvent, onDismiss: () => void) {
  event.preventDefault();
  event.stopImmediatePropagation();
  // The press only dismisses: the click that completes it must not also reach whatever sits under the pointer (a Signal row, a bar, ...).
  const swallowClick = (clickEvent: globalThis.MouseEvent) => { clickEvent.stopImmediatePropagation(); clickEvent.preventDefault(); };
  // Only a primary press is followed by a click; a right/middle press must not leave a swallower behind for the next, unrelated click.
  if (event.button !== 0) { onDismiss(); return; }
  window.addEventListener("click", swallowClick, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 600);
  onDismiss();
}

export function ModalBackdrop({ children, onDismiss, dismissible = true, testId }: { readonly children: ReactNode; readonly onDismiss: () => void; readonly dismissible?: boolean; readonly testId?: string }) {
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (dismissible && event.target === event.currentTarget) onDismiss();
  };
  return <div className="modal-backdrop" data-testid={testId} onClick={onClick}>{children}</div>;
}
