import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CanonicalDocument, TransactionTimeScale } from "@timing-chart-v2/schema";
import { RibbonIcon } from "./ribbon-icon.js";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";

const DEFAULT_SCALE: TransactionTimeScale = { clockCyclesPerTransactionCycle: 1, majorInterval: 5, minorInterval: 1 };

/** #397 Transaction Mode GUI Closure Section 4: `transaction.setTimeScale`
 * already existed at the command/planner layer (validated ratio + integer
 * intervals) with zero GUI entry point -- the status label always read
 * "Time Scale: Cycle" regardless of `document.transactionTimeScale`. Same
 * self-contained trigger + floating panel shell as FindReplacePanel
 * (find-replace-panel.tsx), scoped to this file rather than growing the
 * Ribbon function further. */
export function TransactionTimeScalePanel({ document, cyclesPerTc: activeCyclesPerTc, onChangeCyclesPerTc, onSetScale }: { readonly document: CanonicalDocument; readonly cyclesPerTc: number; readonly onChangeCyclesPerTc: (value: number) => void; readonly onSetScale: (scale: TransactionTimeScale) => void }) {
  const [open, setOpen] = useState(false);
  const current = document.transactionTimeScale ?? DEFAULT_SCALE;
  const [cyclesPerTc, setCyclesPerTc] = useState(activeCyclesPerTc);
  const [majorInterval, setMajorInterval] = useState(current.majorInterval);
  const [minorInterval, setMinorInterval] = useState(current.minorInterval);
  const [showSecondaryClock, setShowSecondaryClock] = useState(current.showSecondaryClock ?? false);
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number; readonly maxHeight: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocusLoop(panelRef, triggerRef, open);

  useEffect(() => {
    if (!open) return;
    setCyclesPerTc(activeCyclesPerTc);
    setMajorInterval(current.majorInterval);
    setMinorInterval(current.minorInterval);
    setShowSecondaryClock(current.showSecondaryClock ?? false);
    // Reopen should always reflect the document's actual current value,
    // not whatever was left over in a prior, cancelled edit session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCyclesPerTc, open]);

  useLayoutEffect(() => {
    // Keep the last valid coordinates while closed. Clearing them here can
    // race a rapid close/reopen and leave the newly mounted dialog hidden
    // before its next positioning pass.
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const margin = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const maxHeight = Math.max(160, window.innerHeight - margin * 2);
      const panelHeight = Math.min(panel.scrollHeight, maxHeight);
      const panelWidth = Math.max(240, panel.getBoundingClientRect().width);
      const left = Math.max(margin, Math.min(triggerRect.left, window.innerWidth - margin - panelWidth));
      const belowTop = triggerRect.bottom + margin;
      const top = belowTop + panelHeight <= window.innerHeight - margin ? belowTop : Math.max(margin, triggerRect.top - margin - panelHeight);
      setPosition({ left, top, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.document.addEventListener("pointerdown", onPointerDown, true);
    window.document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown, true);
      window.document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const valid = Number.isInteger(cyclesPerTc) && cyclesPerTc >= 1 && Number.isInteger(majorInterval) && majorInterval >= 1 && Number.isInteger(minorInterval) && minorInterval >= 1;

  const apply = () => {
    if (!valid) return;
    onChangeCyclesPerTc(cyclesPerTc);
    const semanticSettingsChanged = majorInterval !== current.majorInterval || minorInterval !== current.minorInterval || showSecondaryClock !== (current.showSecondaryClock ?? false);
    if (semanticSettingsChanged) onSetScale({ ...current, majorInterval, minorInterval, showSecondaryClock });
    setOpen(false);
  };

  return <>
    <button ref={triggerRef} type="button" className="ds-ribbon-button" aria-expanded={open} aria-haspopup="dialog" data-testid="transaction-time-scale-trigger" onClick={() => setOpen((value) => !value)}><span className="ds-icon-box" aria-hidden="true"><RibbonIcon name="i-clock" /></span><span className="ds-ribbon-label">Time Scale</span></button>
    {open && createPortal(<div ref={panelRef} className="transaction-time-scale-panel" role="dialog" aria-label="Transaction Time Scale" data-testid="transaction-time-scale-panel" style={{ left: `${position?.left ?? 0}px`, top: `${position?.top ?? 0}px`, maxHeight: `${position?.maxHeight ?? 200}px`, visibility: position ? "visible" : "hidden" }}>
      <label>Clock cycles per Transaction Cycle<input aria-label="Clock cycles per Transaction Cycle" type="number" min="1" step="1" value={cyclesPerTc} onChange={(event) => setCyclesPerTc(Number(event.target.value))} /></label>
      <label>Major tick interval (TC)<input aria-label="Major tick interval" type="number" min="1" step="1" value={majorInterval} onChange={(event) => setMajorInterval(Number(event.target.value))} /></label>
      <label>Minor tick interval (TC)<input aria-label="Minor tick interval" type="number" min="1" step="1" value={minorInterval} onChange={(event) => setMinorInterval(Number(event.target.value))} /></label>
      <label><input aria-label="Show secondary clock" type="checkbox" checked={showSecondaryClock} onChange={(event) => setShowSecondaryClock(event.target.checked)} /> Show secondary clock</label>
      {!valid && <output role="alert" data-testid="transaction-time-scale-error">Cycles per Transaction Cycle and tick intervals must be positive whole numbers.</output>}
      <div className="transaction-time-scale-actions">
        <button type="button" data-testid="transaction-time-scale-apply" disabled={!valid} onClick={apply}>Apply</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>, window.document.body)}
  </>;
}
