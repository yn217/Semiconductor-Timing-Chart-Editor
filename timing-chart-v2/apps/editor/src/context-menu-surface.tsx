import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { computeViewportSafePosition, currentViewportBounds } from "./viewport-safe-position.js";
import { usePeerMenuSurface } from "./runtime/peer-menu-surface.js";

type ContextMenuAnchor = Readonly<{ x: number; y: number; originRowId?: string }>;

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
    // #899: a context menu is anchored to the row that invoked it, but its position is a fixed screen point. When any scroll owner
    // moves that row (or virtualizes it away) the menu would look attached to a different row, so it is dismissed. Only movement of
    // the invoking row counts: unrelated scrolls (focus reveal, other panes) leave the menu alone.
    const originSelector = anchor.originRowId === undefined ? undefined : `[data-row-id="${CSS.escape(anchor.originRowId)}"], [data-annotation-id="${CSS.escape(anchor.originRowId)}"]`;
    const originTop = originSelector === undefined ? undefined : globalThis.document.querySelector(originSelector)?.getBoundingClientRect().top;
    const onAnyScroll = (event: Event) => {
      if (originSelector === undefined || originTop === undefined) return;
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      const origin = globalThis.document.querySelector(originSelector);
      if (!origin || !origin.isConnected || Math.abs(origin.getBoundingClientRect().top - originTop) > 1) onDismiss();
    };
    globalThis.addEventListener("resize", onViewportChange);
    globalThis.addEventListener("scroll", onAnyScroll, true);
    globalThis.visualViewport?.addEventListener("resize", onViewportChange);
    globalThis.visualViewport?.addEventListener("scroll", onViewportChange);
    return () => {
      globalThis.removeEventListener("resize", onViewportChange);
      globalThis.removeEventListener("scroll", onAnyScroll, true);
      globalThis.visualViewport?.removeEventListener("resize", onViewportChange);
      globalThis.visualViewport?.removeEventListener("scroll", onViewportChange);
    };
  }, [anchor.x, anchor.y]);
  return createPortal(<div ref={menuRef} className="context-menu" role="menu" aria-label={label} data-context-target={target} data-testid="signal-context-menu" style={{ left: anchor.x, top: anchor.y, visibility: "hidden" }}>{children}</div>, document.body);
}
