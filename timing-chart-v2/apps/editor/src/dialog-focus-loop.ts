import { useEffect } from "react";
import type { RefObject } from "react";

export function useDialogFocusLoop<T extends HTMLElement>(dialogRef: RefObject<T | null>, restoreFocusRef?: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previous = restoreFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((item) => !item.hasAttribute("disabled") && item.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) requestAnimationFrame(() => previous.focus());
      if (restoreFocusRef?.current === previous) restoreFocusRef.current = null;
    };
  }, [dialogRef, restoreFocusRef, enabled]);
}
