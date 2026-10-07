import type { MouseEvent, ReactNode } from "react";

export function consumeOutsidePointerDown(event: PointerEvent, onDismiss: () => void) {
  event.preventDefault();
  event.stopImmediatePropagation();
  onDismiss();
}

export function ModalBackdrop({ children, onDismiss, dismissible = true, testId }: { readonly children: ReactNode; readonly onDismiss: () => void; readonly dismissible?: boolean; readonly testId?: string }) {
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (dismissible && event.target === event.currentTarget) onDismiss();
  };
  return <div className="modal-backdrop" data-testid={testId} onClick={onClick}>{children}</div>;
}
