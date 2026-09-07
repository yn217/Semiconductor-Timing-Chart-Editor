import { DeterministicExportService, type ExportRequest } from "@timing-chart-v2/export";

export interface EditorExportController {
  readonly export: (request: ExportRequest) => Promise<Uint8Array>;
  readonly download: (bytes: Uint8Array, filename: string, type: string) => void;
  readonly copyImage: (bytes: Uint8Array, format: "svg" | "png") => Promise<void>;
}

function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyImage(bytes: Uint8Array, format: "svg" | "png"): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard API is unavailable in this browser.");
  const mime = format === "svg" ? "image/svg+xml" : "image/png";
  const blobBytes = bytes.slice().buffer as ArrayBuffer;
  const blob = new Blob([blobBytes], { type: mime });
  const items = format === "svg"
    ? { "image/svg+xml": blob, "text/plain": new Blob([new TextDecoder().decode(bytes)], { type: "text/plain" }) }
    : { "image/png": blob };
  await navigator.clipboard.write([new ClipboardItem(items)]);
}

/** Owns export-service selection and browser delivery side effects for editor UI. */
export function createEditorExportController(): EditorExportController {
  const service = new DeterministicExportService();
  return {
    export: (request) => service.export(request),
    download: downloadBytes,
    copyImage,
  };
}
