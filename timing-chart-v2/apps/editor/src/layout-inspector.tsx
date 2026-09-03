import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { MiniMap } from "./minimap.js";

const DOCUMENTED_LAYOUT_DEFAULTS: CanonicalDocument["layout"] = { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" };

export function LayoutInspector({ document, viewport, onCommand, onCancel }: { readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onCancel: () => void }) {
  const [roleColumnWidth, setRoleColumnWidth] = useState(document.layout.roleColumnWidth);
  const [signalNameWidth, setSignalNameWidth] = useState(document.layout.signalNameWidth);
  const [signalNameAlign, setSignalNameAlign] = useState(document.layout.signalNameAlign);
  const [overflow, setOverflow] = useState(document.layout.overflow);
  const [rowHeight, setRowHeight] = useState(document.layout.rowHeight);
  const [signalSpacing, setSignalSpacing] = useState(document.layout.signalSpacing);
  const [error, setError] = useState("");
  useEffect(() => {
    setRoleColumnWidth(document.layout.roleColumnWidth);
    setSignalNameWidth(document.layout.signalNameWidth);
    setSignalNameAlign(document.layout.signalNameAlign);
    setOverflow(document.layout.overflow);
    setRowHeight(document.layout.rowHeight);
    setSignalSpacing(document.layout.signalSpacing);
    setError("");
  }, [document.layout]);
  const resetDraft = () => {
    setRoleColumnWidth(document.layout.roleColumnWidth);
    setSignalNameWidth(document.layout.signalNameWidth);
    setSignalNameAlign(document.layout.signalNameAlign);
    setOverflow(document.layout.overflow);
    setRowHeight(document.layout.rowHeight);
    setSignalSpacing(document.layout.signalSpacing);
    setError("");
  };
  const apply = () => {
    if (![roleColumnWidth, signalNameWidth, rowHeight, signalSpacing].every(Number.isFinite) || roleColumnWidth < 16 || roleColumnWidth > 240 || signalNameWidth < 40 || signalNameWidth > 600 || rowHeight < 12 || signalSpacing < 0) {
      setError("Layout dimensions must be finite and within the supported range.");
      return;
    }
    onCommand({ id: nextCommandId("layout_properties"), type: "document.updateLayout", layout: { ...document.layout, roleColumnWidth, signalNameWidth, signalNameAlign, rowHeight, signalSpacing, overflow } });
  };
  const autoFit = () => {
    const labels = Array.from(globalThis.document.querySelectorAll<HTMLElement>("[data-role='tree-signal-name'], [data-role='frozen-signal-name'], [data-role='annotation-label']"));
    const canvas = globalThis.document.createElement("canvas");
    const context = canvas.getContext("2d");
    const widths = labels.filter((label) => label.textContent?.trim() && label.getClientRects().length > 0).map((label) => {
      if (!context) return label.scrollWidth;
      const style = globalThis.getComputedStyle(label);
      context.font = style.font;
      return context.measureText(label.textContent?.trim() ?? "").width;
    });
    const contentWidth = Math.max(0, ...widths);
    const fittedWidth = Math.min(600, Math.max(40, Math.ceil(contentWidth + 24)));
    if (fittedWidth === document.layout.signalNameWidth) return;
    onCommand({ id: nextCommandId("layout_autofit"), type: "document.updateLayout", layout: { ...document.layout, signalNameWidth: fittedWidth } });
  };
  const resetToDefaults = () => onCommand({ id: nextCommandId("layout_reset"), type: "document.updateLayout", layout: { ...DOCUMENTED_LAYOUT_DEFAULTS } });
  return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span><b>Layout</b></header><form className="inspector-layout-editor" data-testid="inspector-layout-editor" onSubmit={(event) => { event.preventDefault(); apply(); }}><section><h3>Layout</h3><label>Role column width<input aria-label="Inspector role column width" type="number" min="16" max="240" step="1" value={roleColumnWidth} onChange={(event) => setRoleColumnWidth(Number(event.target.value))} /></label><label>Signal name width<input aria-label="Inspector signal name width" type="number" min="40" max="600" step="1" value={signalNameWidth} onChange={(event) => setSignalNameWidth(Number(event.target.value))} /></label><label>Signal name alignment<select aria-label="Inspector signal name alignment" value={signalNameAlign} onChange={(event) => setSignalNameAlign(event.target.value as typeof signalNameAlign)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Signal name overflow<select aria-label="Inspector signal name overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label><label>Row height<input aria-label="Inspector row height" type="number" min="12" step="1" value={rowHeight} onChange={(event) => setRowHeight(Number(event.target.value))} /></label><label>Signal spacing<input aria-label="Inspector signal spacing" type="number" min="0" step="1" value={signalSpacing} onChange={(event) => setSignalSpacing(Number(event.target.value))} /></label><p className="inspector-note">Applied to the derived RowLayout; absolute screen geometry is never stored.</p>{error && <p className="editor-problem" role="alert">{error}</p>}<button type="button" data-testid="auto-fit-inspector-layout" onClick={autoFit}>Auto Fit Signal/Annotation Column</button><button type="submit" data-testid="apply-inspector-layout">Apply Layout</button><button type="button" data-testid="reset-inspector-layout" onClick={resetToDefaults}>Reset Documented Defaults</button><button type="button" data-testid="cancel-inspector-layout" onClick={() => { resetDraft(); onCancel(); }}>Cancel</button></section></form><MiniMap document={document} viewport={viewport} /></aside>;
}
