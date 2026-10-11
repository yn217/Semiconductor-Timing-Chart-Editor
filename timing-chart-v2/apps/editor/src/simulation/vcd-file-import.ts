import { DOCUMENT_RESOURCE_BUDGET } from "@timing-chart-v2/schema";
import { parseVcdText, type VcdParseResult, type VcdTextParserOptions } from "./vcd-text-parser.js";

async function* decodeFileChunks(file: Blob, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const cancel = (): void => { void reader.cancel(); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/**
 * Production file-import entry for VCD text. It streams bytes through the same
 * bounded parser used by other callers and rejects oversized files before
 * allocating/decoding their contents.
 */
export function importVcdTextFile(
  file: Blob,
  options: VcdTextParserOptions = {},
): Promise<VcdParseResult> {
  const requestedLimit = options.maxInputBytes;
  if (requestedLimit !== undefined && (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1)) {
    return parseVcdText(decodeFileChunks(file, options.signal), options);
  }
  const inputLimit = Math.min(requestedLimit ?? DOCUMENT_RESOURCE_BUDGET.openFileBytes, DOCUMENT_RESOURCE_BUDGET.openFileBytes);
  if (file.size > inputLimit) {
    return Promise.resolve({
      ok: false,
      error: { code: "resource-limit", message: `VCD input exceeds the ${inputLimit}-byte limit.` },
    });
  }
  return parseVcdText(decodeFileChunks(file, options.signal), { ...options, maxInputBytes: inputLimit });
}
