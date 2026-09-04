import { useEffect, useRef, useState } from "react";
import { RibbonIcon } from "./ribbon-icon.js";

/** PowerPoint-style "Arrange" group for the Annotation ribbon tab: the 3
 * most common operations (Bring to Front / Send to Back / Group) as a
 * stacked icon-row column -- same packing FontStyleToolbar uses -- plus a
 * dropdown for the rest (Ungroup / Rotate), mirroring how PowerPoint splits
 * frequent one-click actions from a fuller menu. Every handler is optional:
 * when omitted the corresponding item renders disabled with a title
 * explaining it isn't wired up yet, so this can ship as a GUI shell ahead
 * of the schema/planner/renderer work (z-order, grouping, rotation) that a
 * working version needs. */
export function ArrangeGroup({ onBringToFront, onSendToBack, onGroup, onUngroup, onRotateRight, onRotateLeft, onAlign, onLock, onUnlock, onMatchSpan }: {
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
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
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
  const notWired = "Not yet implemented";
  return <div className="arrange-group" ref={rootRef}>
    <div className="arrange-rows">
      <button type="button" className="font-style-button" title={onBringToFront ? "Bring to front" : notWired} disabled={!onBringToFront} onClick={onBringToFront}><RibbonIcon name="i-bring-front" /><span>Front</span></button>
      <button type="button" className="font-style-button" title={onSendToBack ? "Send to back" : notWired} disabled={!onSendToBack} onClick={onSendToBack}><RibbonIcon name="i-send-back" /><span>Back</span></button>
      <button type="button" className="font-style-button" title={onGroup ? "Group" : notWired} disabled={!onGroup} onClick={onGroup}><RibbonIcon name="i-group" /><span>Group</span></button>
    </div>
    <div className="arrange-dropdown">
      <button type="button" className="arrange-dropdown-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><RibbonIcon name="i-arrange" /><span>Arrange</span><RibbonIcon name="i-chevron-down" /></button>
      {open && <div className="arrange-menu" role="menu" aria-label="Arrange">
        <button type="button" role="menuitem" disabled={!onUngroup} title={onUngroup ? undefined : notWired} onClick={() => { onUngroup?.(); setOpen(false); }}><RibbonIcon name="i-ungroup" /><span>Ungroup</span></button>
        <div className="arrange-menu-sep" />
        <button type="button" role="menuitem" disabled={!onRotateRight} title={onRotateRight ? undefined : notWired} onClick={() => { onRotateRight?.(); setOpen(false); }}><RibbonIcon name="i-rotate-right" /><span>Rotate right 90°</span></button>
        <button type="button" role="menuitem" disabled={!onRotateLeft} title={onRotateLeft ? undefined : notWired} onClick={() => { onRotateLeft?.(); setOpen(false); }}><RibbonIcon name="i-rotate-left" /><span>Rotate left 90°</span></button>
        <div className="arrange-menu-sep" />
        <button type="button" role="menuitem" disabled={!onAlign} title={onAlign ? "Align selected annotations to the same row" : notWired} onClick={() => { onAlign?.(); setOpen(false); }}><RibbonIcon name="i-align-row" /><span>Align</span></button>
        <button type="button" role="menuitem" disabled={!onMatchSpan} title={onMatchSpan ? "Match the first selected annotation's cycle span" : notWired} onClick={() => { onMatchSpan?.(); setOpen(false); }}><RibbonIcon name="i-range-arrow" /><span>Same width</span></button>
        <div className="arrange-menu-sep" />
        <button type="button" role="menuitem" disabled={!onLock} title={onLock ? "Lock" : notWired} onClick={() => { onLock?.(); setOpen(false); }}><RibbonIcon name="i-lock" /><span>Lock</span></button>
        <button type="button" role="menuitem" disabled={!onUnlock} title={onUnlock ? "Unlock" : notWired} onClick={() => { onUnlock?.(); setOpen(false); }}><RibbonIcon name="i-unlock" /><span>Unlock</span></button>
      </div>}
    </div>
  </div>;
}
