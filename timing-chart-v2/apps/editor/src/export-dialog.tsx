import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { DocumentProblem } from "@timing-chart-v2/schema";
import type { EditorExportController } from "./application/editor-export-controller.js";

function useExportDialogFocusLoop(dialogRef: RefObject<HTMLElement | null>, restoreFocusRef?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
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
  }, [dialogRef, restoreFocusRef]);
}

function ExportCloseIcon(): ReactNode {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ExportDialog({ snapshot, range, restoreFocusRef, onDiagnostic, onClose, controller }: { readonly snapshot: CanonicalSnapshot; readonly range: { start: number; end: number }; readonly restoreFocusRef?: RefObject<HTMLElement | null>; readonly onDiagnostic: (diagnostic: DocumentProblem | undefined) => void; readonly onClose: () => void; readonly controller: EditorExportController }) {
  const [format, setFormat] = useState<"svg" | "png" | "pdf">("svg");
  const [scope, setScope] = useState<"document" | "selected-range">("document");
  const [scale, setScale] = useState(2);
  const [pageSize, setPageSize] = useState<"A4" | "Letter" | "wide">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [margin, setMargin] = useState(24);
  const [fit, setFit] = useState<"width" | "page">("width");
  const [pageEnabled, setPageEnabled] = useState(false);
  const [foldPolicy, setFoldPolicy] = useState<"respect" | "expand">("respect");
  const [signalLayout, setSignalLayout] = useState<"merged" | "preserve-split">("merged");
  const [status, setStatus] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useExportDialogFocusLoop(dialogRef, restoreFocusRef);
  const settings = () => ({ scope, ...(scope === "selected-range" ? { range } : {}), scale, ...(pageEnabled ? { page: { size: pageSize, orientation, margin, fit } } : {}), foldPolicy, signalLayout });
  const exportNow = async () => {
    setStatus("Generating…");
    try {
      const bytes = await controller.export({ format, snapshot, settings: settings() });
      try {
        controller.download(bytes, `${snapshot.document.document.title || "timing-chart"}.${format}`, format === "svg" ? "image/svg+xml" : format === "png" ? "image/png" : "application/pdf");
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Browser download preparation failed.";
        onDiagnostic({ code: "EXPORT_FAILED", path: "$.export.download", message: `Export download failed: ${reason}`, severity: "error", operation: "document.export.download", operationLabel: `Download ${format.toUpperCase()} export`, source: "export", stage: "storage", recommendation: "Retry the download or choose another export format.", detail: "export-failure:download" });
        setStatus(`Download failed · ${reason}`);
        return;
      }
      onDiagnostic(undefined);
      setStatus(`${format.toUpperCase()} ready`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Export generation failed.";
      onDiagnostic({ code: "EXPORT_FAILED", path: "$.export", message: `Export generation failed: ${reason}`, severity: "error", operation: "document.export.generate", operationLabel: `Generate ${format.toUpperCase()} export`, source: "export", stage: "rasterize", recommendation: "Reduce the selected range or export scale, then retry.", detail: "export-failure:generate" });
      setStatus(reason);
    }
  };
  const copyNow = async (copyFormat: "svg" | "png") => {
    setStatus("Copying…");
    try {
      const bytes = await controller.export({ format: copyFormat, snapshot, settings: settings() });
      await controller.copyImage(bytes, copyFormat);
      onDiagnostic(undefined);
      setStatus(`${copyFormat.toUpperCase()} copied`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Clipboard export failed.";
      onDiagnostic({ code: "CLIPBOARD_FAILED", path: "$.clipboard", message: `Clipboard copy failed: ${reason}`, severity: "error", operation: "document.clipboard.copy", operationLabel: `Copy ${copyFormat.toUpperCase()} export`, source: "clipboard", stage: "clipboard-write", recommendation: "Allow clipboard access or retry the copy operation.", detail: "clipboard-failure:copy" });
      setStatus(reason);
    }
  };
  return <div className="modal-backdrop"><section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Export Timing Chart" className="export-dialog"><header><h2>Export</h2><button type="button" aria-label="Close export" onClick={onClose}><ExportCloseIcon /></button></header><label>Format<select aria-label="Export format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="svg">SVG</option><option value="png">PNG</option><option value="pdf">PDF</option></select></label><label>Scope<select aria-label="Export scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="document">Entire Document</option><option value="selected-range">Selected Range</option></select></label><label>Signal layout<select aria-label="Signal layout" value={signalLayout} onChange={(event) => setSignalLayout(event.target.value as typeof signalLayout)}><option value="merged">Merged document</option><option value="preserve-split">Preserve Upper / Lower split</option></select></label><label>Page Size<select aria-label="Export page size" value={pageSize} onChange={(event) => { setPageEnabled(true); setPageSize(event.target.value as typeof pageSize); }}><option value="A4">A4</option><option value="Letter">Letter</option><option value="wide">Wide</option></select></label><label>Orientation<select aria-label="Export orientation" value={orientation} onChange={(event) => { setPageEnabled(true); setOrientation(event.target.value as typeof orientation); }}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><label>Fit<select aria-label="Export fit" value={fit} onChange={(event) => { setPageEnabled(true); setFit(event.target.value as typeof fit); }}><option value="width">Fit Width</option><option value="page">Fit Page</option></select></label><label>Margin<input aria-label="Export margin" type="number" min="0" step="1" value={margin} onChange={(event) => { setPageEnabled(true); setMargin(Number(event.target.value)); }} /></label><label>Fold Policy<select aria-label="Export fold policy" value={foldPolicy} onChange={(event) => setFoldPolicy(event.target.value as typeof foldPolicy)}><option value="respect">Respect Axis Break</option><option value="expand">Expand Folded Ranges</option></select></label>{format === "png" && <label>Scale<select aria-label="PNG scale" value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value="1">1x</option><option value="2">2x</option><option value="3">3x</option></select></label>}<div className="export-summary">Canonical source · {snapshot.document.signals.length} signals · {snapshot.document.transactions.length} transactions</div><footer><output>{status}</output><button type="button" onClick={() => void copyNow("svg")}>Copy SVG</button><button type="button" onClick={() => void copyNow("png")}>Copy PNG</button><button type="button" onClick={() => void exportNow()}>Export {format.toUpperCase()}</button></footer></section></div>;
}
