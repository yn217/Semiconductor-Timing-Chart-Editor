import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const file = "apps/editor/src/minimal-cycle-view.tsx";
const ownershipMap = "apps/editor/src/OWNERSHIP.md";
const actionOwner = await readFile(resolve(root, "apps/editor/src/application/use-editor-actions.ts"), "utf8");
const presentationOwner = await readFile(resolve(root, "apps/editor/src/application/use-editor-presentation-state.ts"), "utf8");
const source = await readFile(resolve(root, file), "utf8");
const ownership = await readFile(resolve(root, ownershipMap), "utf8");
const lines = source.split(/\r?\n/).length;
const budget = 900;
const ownerBudgets = [
  ["apps/editor/src/application/use-editor-actions.ts", 500],
  ["apps/editor/src/application/use-editor-presentation-state.ts", 500],
  ["apps/editor/src/runtime/use-editor-runtime-bridge.ts", 800],
  ["apps/editor/src/runtime/use-timeline-surface-runtime.ts", 800],
  ["apps/editor/src/editor-workspace-view.tsx", 500],
  ["apps/editor/src/editor-dialog-layer.tsx", 500],
  ["apps/editor/src/runtime/presentation-preview.ts", 500],
];
const forbiddenOwners = [
  ["Canonical mutation outside command/session path", /setSnapshot\([^)]*document|validateCanonicalDocument\([^)]*setSnapshot/],
  ["raw document/window listener lifecycle in root", /(?:document|window)\.(?:addEventListener|removeEventListener)\s*\(/],
  ["renderer/WaveDrom/geometry construction in root", /new\s+(?:TimelineGeometryOwner|EditorApplicationRuntime|CommandHistorySession)|createWaveformSurfaceProvider\s*\(|runtime\.createRenderer|(?:renderer|renderCoordinator)\.dispose\s*\(/],
  ["pure parser/default factory in root", /parseBulkSignalDefinitions|parseOpenDocument|createNewDocumentFromProductTemplate/],
  ["batch mutation bypass in root", /application\.executeBatch\s*\(/],
  ["large shell markup in root", /className="(?:desktop-workspace|cycle-panel|inspector-shell|modal-backdrop)"|<main\b|<section\b|<aside\b/],
];
const requiredOwners = ["Review scope, severity, navigation", "Viewport, timeline, ruler and grid lifecycle", "File open/save/export lifecycle", "UI action composition", "Presentation-only editor toggles", "Editor shell JSX"];
const requiredSourceContracts = [
  ["command router", /useEditorCommandRouter/],
  ["action owner", /useEditorActions/],
  ["presentation owner", /useEditorPresentationState/],
  ["shell owner", /EditorShellView/],
  ["workspace shell owner", /EditorWorkspaceView/],
  ["dialog shell owner", /EditorDialogLayer/],
  ["runtime DOM bridge split", /editor-dom-bridge/],
];
const violations = [
  ...forbiddenOwners.filter(([, pattern]) => pattern.test(source)).map(([name]) => name),
  ...requiredOwners.filter((owner) => !ownership.includes(owner)).map((owner) => `ownership map missing: ${owner}`),
  ...requiredSourceContracts.filter(([, pattern]) => !pattern.test(source)).map(([name]) => `${name} contract missing`),
  ...(/<(?:div|main|section|button|AIOperationPanel|EditorShellView)\b/.test(actionOwner) ? ["use-editor-actions must remain JSX-free"] : []),
  ...(/<(?:div|main|section|button|AIOperationPanel|EditorShellView)\b/.test(presentationOwner) ? ["use-editor-presentation-state must remain JSX-free"] : []),
  ...(source.includes("new TimelineGeometryOwner") || source.includes("createWaveformSurfaceProvider") || source.includes("attachEditorEventBindings") ? ["runtime lifecycle leaked into MinimalCycleView"] : []),
];
const preferredWarnings = [];
for (const [owner, max] of ownerBudgets) {
  const ownerSource = await readFile(resolve(root, owner), "utf8");
  const ownerLines = ownerSource.split(/\r?\n/).length;
  if (ownerLines > max) preferredWarnings.push(`${owner} exceeds preferred ${max} lines (${ownerLines})`);
}
const effectBodies = [...source.matchAll(/use(?:Layout)?Effect\(\(\) => \{([\s\S]*?)\n\s*\},/g)];
for (const [index, match] of effectBodies.entries()) {
  const effectLines = match[1].split(/\r?\n/).length;
  if (effectLines > 150) violations.push(`MinimalCycleView effect ${index + 1} exceeds 150 lines (${effectLines})`);
}
if (effectBodies.length === 0) violations.push("no measurable root effects found; guard pattern must be updated");
if (lines > budget || violations.length > 0) {
  console.error(JSON.stringify({ file, lines, budget, effectBodies: effectBodies.length, preferredWarnings, violations }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ file, lines, budget, effectBodies: effectBodies.length, preferredWarnings, violations: [] }, null, 2));
