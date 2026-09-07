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
const forbiddenOwners = [
  ["Canonical mutation outside command/session path", /setSnapshot\([^)]*document|validateCanonicalDocument\([^)]*setSnapshot/],
];
const requiredOwners = ["Review scope, severity, navigation", "Viewport, timeline, ruler and grid lifecycle", "File open/save/export lifecycle", "UI action composition", "Presentation-only editor toggles", "Editor shell JSX"];
const requiredSourceContracts = [
  ["command router", /useEditorCommandRouter/],
  ["action owner", /useEditorActions/],
  ["presentation owner", /useEditorPresentationState/],
  ["shell owner", /EditorShellView/],
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
if (lines > budget || violations.length > 0) {
  console.error(JSON.stringify({ file, lines, budget, violations }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ file, lines, budget, violations: [] }, null, 2));
