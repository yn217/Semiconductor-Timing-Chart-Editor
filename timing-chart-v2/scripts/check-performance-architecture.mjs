import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoots = [path.join(root, "apps"), path.join(root, "packages")];
const errors = [];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "dist" ? [] : filesBelow(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }))).flat();
}

for (const sourceRoot of sourceRoots) {
  for (const file of await filesBelow(sourceRoot)) {
    const source = await readFile(file, "utf8");
    if (/\bMutationObserver\b/.test(source)) errors.push(`${path.relative(root, file)}: MutationObserver-based render synchronization is forbidden`);
    if (/\brenderEverything\b/i.test(source)) errors.push(`${path.relative(root, file)}: monolithic render-everything entry point is forbidden`);
  }
}

const requiredContracts = [
  ["packages/projection/src/types.ts", "mountedRowIds"],
  ["packages/renderer/src/types.ts", "RendererDiagnostics"],
  ["packages/testing/src/index.ts", "generatePerformanceDocument"],
  ["tests/e2e/performance-closure.spec.ts", "1000x1000 virtualization"],
  ["packages/core/src/index.ts", "document: next"],
  ["packages/history/src/session.ts", "#cleanDocument"],
  ["packages/wavedrom-adapter/src/renderer.ts", "#renderIndices.delete(signalId)"],
  ["packages/export/src/index.ts", "data-wave-engine"],
];
for (const [relative, marker] of requiredContracts) {
  const source = await readFile(path.join(root, relative), "utf8");
  if (!source.includes(marker)) errors.push(`${relative}: missing Phase 13 contract ${marker}`);
}

const forbiddenContracts = [
  ["packages/core/src/index.ts", /cloneValue\(next\)/, "full-document clone on commit"],
  ["packages/history/src/session.ts", /serializeCanonicalDocument/, "full-document serialization for Dirty state"],
  ["packages/export/src/index.ts", /function signalPath/, "custom fixed-pitch waveform export"],
  ["apps/editor/src/minimal-cycle-view.tsx", /const onAnnotationPointerMove[\s\S]{0,1600}buildSnapIndex/, "SnapIndex rebuild during pointermove"],
];
for (const [relative, pattern, description] of forbiddenContracts) {
  const source = await readFile(path.join(root, relative), "utf8");
  if (pattern.test(source)) errors.push(`${relative}: ${description} is forbidden`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Phase 13 performance architecture gate passed.");
}
