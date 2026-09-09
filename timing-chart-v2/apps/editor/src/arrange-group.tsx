import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RibbonIcon } from "./ribbon-icon.js";
import { computeViewportSafePosition, currentViewportBounds } from "./viewport-safe-position.js";

/** PowerPoint-style "Arrange" group for the Annotation ribbon tab: the 3
 * most common operations (Bring to Front / Send to Back / Group) as a
 * stacked icon-row column -- same packing FontStyleToolbar uses -- plus a
 * dropdown for the rest (Ungroup / Rotate), mirroring how PowerPoint splits
 * frequent one-click actions from a fuller menu. Every handler is optional:
 * when omitted the corresponding item renders disabled with a title
 * explaining it isn't wired up yet, so this can ship as a GUI shell ahead
 * of the schema/planner/renderer work (z-order, grouping, rotation) that a
 * working version needs. */
export function ArrangeGroup({ onBringToFront, onSendToBack, onGroup, onUngroup, onRotateRight, onRotateLeft, onAlign, onLock, onUnlock, onMatchSpan, unavailableReason, groupUnavailableReason, ungroupUnavailableReason, alignUnavailableReason, matchSpanUnavailableReason, lockUnavailableReason, unlockUnavailableReason }: {
  readonly onBringToFront?: () => void;
  readonly onSendToBack?: () => void;
  readonly onGroup?: () => void;
  readonly onUngroup?: () => void;
  readonly onRotateRight?: () => void;
  readonly onRotateLeft?: () => void;
  readonly onAlign?: () => void;
  readonly onLock?: () => void;
  readonly onUnlock?: () => void;
  readonly onMatchSpan?: () => void;
  /** #332 item D: every disabled Arrange control here IS implemented --
   * it's only unavailable because the current selection doesn't satisfy
   * its precondition. `unavailableReason` covers the common "nothing
   * selected" case shared by every button; the per-control reasons below
   * override it once something is selected but a specific precondition
   * (selection count, grouped state, compatible types) still isn't met.
   * Neither this component nor its caller should ever fall back to a
   * generic "Not yet implemented" for a control that has real behavior. */
  readonly unavailableReason?: string;
  readonly groupUnavailableReason?: string | undefined;
  readonly ungroupUnavailableReason?: string | undefined;
  readonly alignUnavailableReason?: string | undefined;
  readonly matchSpanUnavailableReason?: string | undefined;
  readonly lockUnavailableReason?: string | undefined;
  readonly unlockUnavailableReason?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (rootRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setOpen(false);
    };
    // ArrowUp/ArrowDown/Home/End cycling for this menu already comes for
    // free from runtime/interaction-controller.ts's attachMenuKeyboardNavigation
    // -- it matches on any `[role='menu']` ancestor generically, not by
    // class name, so it already covers .arrange-menu too. Escape stays
    // local since this dropdown owns its own open/close state rather than
    // going through that shared owner's close callbacks.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.document.addEventListener("pointerdown", onPointerDown, true);
    window.document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown, true);
      window.document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);
  // Accessibility: matches Home Overflow's own open-focus contract
  // (ribbon/home-overflow.tsx) -- a role="menu" popup should hand focus to
  // its first enabled item on open, not leave it on the trigger button.
  // The shared attachMenuKeyboardNavigation already gives this menu Arrow/
  // Home/End cycling (it matches any [role='menu'] generically); only the
  // open-focus handoff was missing here.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  // #197: this dropdown used to be a plain CSS `position: absolute; left: 0`
  // box with no viewport-edge awareness at all -- since the Arrange group
  // sits near the right end of the Annotation ribbon, its 150px-wide menu
  // could render partly off-screen at narrower viewports. It now goes
  // through the same viewport-safe positioning helper the Signal/Group/
  // Annotation context menu uses (computeViewportSafePosition), anchored to
  // the trigger button's own rect instead of a pointer point.
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const { x, y } = computeViewportSafePosition({ x: triggerRect.left, y: triggerRect.bottom + 3 }, { width: menuRect.width, height: menuRect.height }, currentViewportBounds());
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.style.visibility = "visible";
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  const fallback = unavailableReason ?? "Select at least one annotation";
  return <div className="arrange-group" ref={rootRef}>
    <div className="arrange-rows">
      <button type="button" className="font-style-button" title={onBringToFront ? "Bring to front" : fallback} disabled={!onBringToFront} onClick={onBringToFront}><RibbonIcon name="i-bring-front" /><span>Front</span></button>
      <button type="button" className="font-style-button" title={onSendToBack ? "Send to back" : fallback} disabled={!onSendToBack} onClick={onSendToBack}><RibbonIcon name="i-send-back" /><span>Back</span></button>
      <button type="button" className="font-style-button" title={onGroup ? "Group" : groupUnavailableReason ?? fallback} disabled={!onGroup} onClick={onGroup}><RibbonIcon name="i-group" /><span>Group</span></button>
    </div>
    <div className="arrange-dropdown">
      <button ref={triggerRef} type="button" className="arrange-dropdown-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><RibbonIcon name="i-arrange" /><span>Arrange</span><RibbonIcon name="i-chevron-down" /></button>
      {open && createPortal(<div ref={menuRef} className="arrange-menu" role="menu" aria-label="Arrange" style={{ position: "fixed", visibility: "hidden" }}>
        <button type="button" role="menuitem" disabled={!onUngroup} title={onUngroup ? undefined : ungroupUnavailableReason ?? fallback} onClick={() => { onUngroup?.(); setOpen(false); }}><RibbonIcon name="i-ungroup" /><span>Ungroup</span></button>
        <div className="arrange-menu-sep" />
        <button type="button" role="menuitem" disabled={!onRotateRight} title={onRotateRight ? undefined : fallback} onClick={() => { onRotateRight?.(); setOpen(false); }}><RibbonIcon name="i-rotate-right" /><span>Rotate right 90°</span></button>
        <button type="button" role="menuitem" disabled={!onRotateLeft} title={onRotateLeft ? undefined : fallback} onClick={() => { onRotateLeft?.(); setOpen(false); }}><RibbonIcon name="i-rotate-left" /><span>Rotate left 90°</span></button>
        <div className="arrange-menu-sep" />
        <button type="button" role="menuitem" disabled={!onAlign} title={onAlign ? "Align selected annotations to the same row" : alignUnavailableReason ?? fallback} onClick={() => { onAlign?.(); setOpen(false); }}><RibbonIcon name="i-align-row" /><span>Align</span></button>
        <button type="button" role="menuitem" disabled={!onMatchSpan} title={onMatchSpan ? "Match the first selected annotation's cycle span" : matchSpanUnavailableReason ?? fallback} onClick={() => { onMatchSpan?.(); setOpen(false); }}><RibbonIcon name="i-range-arrow" /><span>Same width</span></button>
        <div className="arrange-menu-sep" />
        <button type="button" role="menuitem" disabled={!onLock} title={onLock ? "Lock" : lockUnavailableReason ?? fallback} onClick={() => { onLock?.(); setOpen(false); }}><RibbonIcon name="i-lock" /><span>Lock</span></button>
        <button type="button" role="menuitem" disabled={!onUnlock} title={onUnlock ? "Unlock" : unlockUnavailableReason ?? fallback} onClick={() => { onUnlock?.(); setOpen(false); }}><RibbonIcon name="i-unlock" /><span>Unlock</span></button>
      </div>, window.document.body)}
    </div>
  </div>;
}
