import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const CONTEXT_MENU_VIEWPORT_MARGIN = 8;
type ContextMenuAnchor = Readonly<{ x: number; y: number }>;

export function ContextMenuSurface({ anchor, children, label, target }: { readonly anchor: ContextMenuAnchor; readonly children: ReactNode; readonly label: string; readonly target: "signal" | "group" | "annotation" | "transaction" }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const position = (reveal = true) => {
    const menu = menuRef.current;
    if (!menu) return;
    const viewport = globalThis.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportRight = viewportLeft + (viewport?.width ?? globalThis.innerWidth);
    const viewportBottom = viewportTop + (viewport?.height ?? globalThis.innerHeight);
    const rect = menu.getBoundingClientRect();
    const preferredRight = anchor.x + rect.width;
    const preferredBottom = anchor.y + rect.height;
    const flipX = preferredRight > viewportRight - CONTEXT_MENU_VIEWPORT_MARGIN && anchor.x - rect.width >= viewportLeft + CONTEXT_MENU_VIEWPORT_MARGIN;
    const flipY = preferredBottom > viewportBottom - CONTEXT_MENU_VIEWPORT_MARGIN && anchor.y - rect.height >= viewportTop + CONTEXT_MENU_VIEWPORT_MARGIN;
    const preferredX = flipX ? anchor.x - rect.width : anchor.x;
    const preferredY = flipY ? anchor.y - rect.height : anchor.y;
    const x = Math.max(viewportLeft + CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(preferredX, viewportRight - rect.width - CONTEXT_MENU_VIEWPORT_MARGIN));
    const y = Math.max(viewportTop + CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(preferredY, viewportBottom - rect.height - CONTEXT_MENU_VIEWPORT_MARGIN));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.dataset.positioned = "true";
    menu.dataset.flippedX = String(flipX);
    menu.dataset.flippedY = String(flipY);
    if (reveal) menu.style.visibility = "visible";
  };
  useLayoutEffect(() => {
    position(false);
    const frame = requestAnimationFrame(() => position(true));
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
