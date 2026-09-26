import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { computeViewportSafePosition, currentViewportBounds } from "./viewport-safe-position.js";
import { usePeerMenuSurface } from "./runtime/peer-menu-surface.js";

type ContextMenuAnchor = Readonly<{ x: number; y: number }>;

export function ContextMenuSurface({ anchor, children, label, onDismiss, target }: { readonly anchor: ContextMenuAnchor; readonly children: ReactNode; readonly label: string; readonly onDismiss: () => void; readonly target: "ruler" | "signal" | "group" | "annotation" | "transaction" }) {
  const menuRef = useRef<HTMLDivElement>(null);
  usePeerMenuSurface(true, onDismiss);
  const position = (reveal = true) => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const { x, y, flippedX, flippedY } = computeViewportSafePosition(anchor, { width: rect.width, height: rect.height }, currentViewportBounds());
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.dataset.positioned = "true";
    menu.dataset.flippedX = String(flippedX);
    menu.dataset.flippedY = String(flippedY);
    if (reveal) menu.style.visibility = "visible";
  };
  useLayoutEffect(() => {
    position(false);
    const frame = requestAnimationFrame(() => position(true));
    return () => cancelAnimationFrame(frame);
  }, [anchor.x, anchor.y]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>(
          "button[role='menuitem']:not(:disabled)",
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor.x, anchor.y]);
  useEffect(() => {
    const onViewportChange = () => position();
    globalThis.addEventListener("resize", onViewportChange);
    globalThis.addEventListener("scroll", onViewportChange, true);
    globalThis.visualViewport?.addEventListener("resize", onViewportChange);
    globalThis.visualViewport?.addEventListener("scroll", onViewportChange);
    return () => {
      globalThis.removeEventListener("resize", onViewportChange);
      globalThis.removeEventListener("scroll", onViewportChange, true);
      globalThis.visualViewport?.removeEventListener("resize", onViewportChange);
      globalThis.visualViewport?.removeEventListener("scroll", onViewportChange);
    };
  }, [anchor.x, anchor.y]);
  return createPortal(<div ref={menuRef} className="context-menu" role="menu" aria-label={label} data-context-target={target} data-testid="signal-context-menu" style={{ left: anchor.x, top: anchor.y, visibility: "hidden" }}>{children}</div>, document.body);
}
