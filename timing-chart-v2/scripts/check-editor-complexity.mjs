import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const file = "apps/editor/src/minimal-cycle-view.tsx";
const ownershipMap = "apps/editor/src/OWNERSHIP.md";
const deprecatedRuntimeBridge = resolve(root, "apps/editor/src/runtime/use-editor-runtime-bridge.ts");
let deprecatedRuntimeBridgeExists = true;
try { await access(deprecatedRuntimeBridge); } catch { deprecatedRuntimeBridgeExists = false; }
async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = resolve(directory, entry.name);
    return entry.isDirectory() ? collectSourceFiles(target) : [target];
  }));
  return nested.flat();
}
const actionOwner = await readFile(resolve(root, "apps/editor/src/application/use-editor-actions.ts"), "utf8");
const presentationOwner = await readFile(resolve(root, "apps/editor/src/application/use-editor-presentation-state.ts"), "utf8");
const exportDialogSource = await readFile(resolve(root, "apps/editor/src/export-dialog.tsx"), "utf8");
const linkedSignalsSource = await readFile(resolve(root, "apps/editor/src/transaction-linked-signals.tsx"), "utf8");
const advancedJsonSource = await readFile(resolve(root, "apps/editor/src/advanced-json-panel.tsx"), "utf8");
const shellSource = await readFile(resolve(root, "apps/editor/src/editor-shell-view.tsx"), "utf8");
const secondarySurfaceSource = await readFile(resolve(root, "apps/editor/src/editor-secondary-surfaces.tsx"), "utf8");
const ribbonSource = await readFile(resolve(root, "apps/editor/src/minimal-cycle-view-ribbon.tsx"), "utf8");
const applicationRuntimeSource = await readFile(resolve(root, "apps/editor/src/runtime/editor-application-runtime.ts"), "utf8");
const timelineSurfaceSource = await readFile(resolve(root, "apps/editor/src/runtime/timeline-surface-controller.ts"), "utf8");
const timelineInteractionsSource = await readFile(resolve(root, "apps/editor/src/runtime/timeline-surface-interactions.ts"), "utf8");
const signalSplitHookSource = await readFile(resolve(root, "apps/editor/src/runtime/use-signal-split-surface-runtime.ts"), "utf8");
const signalSplitControllerSource = await readFile(resolve(root, "apps/editor/src/runtime/signal-split-surface-controller.ts"), "utf8");
const timelineRuntimeHookSource = await readFile(resolve(root, "apps/editor/src/runtime/use-timeline-surface-runtime.ts"), "utf8");
const renderInvalidationSource = await readFile(resolve(root, "apps/editor/src/runtime/render-invalidation.ts"), "utf8");
const source = await readFile(resolve(root, file), "utf8");
const editorReactSources = await Promise.all((await collectSourceFiles(resolve(root, "apps/editor/src")))
  .filter((target) => target.endsWith(".tsx"))
  .map(async (target) => [target, await readFile(target, "utf8")]));
const isOptInProbe = (target) => {
  const normalized = target.replaceAll("\\", "/");
  return normalized.includes("/probes/") || normalized.endsWith("/minimal-cycle-view-next-probe.tsx");
};
const ownership = await readFile(resolve(root, ownershipMap), "utf8");
const runtimeHelperSources = await Promise.all([
  "apps/editor/src/runtime/viewport-projection.ts",
  "apps/editor/src/runtime/waveform-surface-provider.ts",
  "apps/editor/src/runtime/timeline-presentation-refresh.ts",
  "apps/editor/src/runtime/renderer-host-sizing.ts",
  "apps/editor/src/runtime/runtime-diagnostics.ts",
  "apps/editor/src/runtime/viewport-controller.ts",
  "apps/editor/src/runtime/interaction-controller.ts",
  "apps/editor/src/runtime/document-lifecycle-controller.ts",
  "apps/editor/src/runtime/render-coordinator.ts",
].map(async (helper) => [helper, await readFile(resolve(root, helper), "utf8")]));
const lines = source.split(/\r?\n/).length;
const budget = 900;
const ownerBudgets = [
  ["apps/editor/src/application/use-editor-actions.ts", 500],
  ["apps/editor/src/application/use-editor-presentation-state.ts", 500],
  ["apps/editor/src/runtime/use-timeline-surface-runtime.ts", 800],
  ["apps/editor/src/runtime/timeline-surface-controller.ts", 800],
  ["apps/editor/src/runtime/signal-split-surface-controller.ts", 800],
  ["apps/editor/src/editor-workspace-view.tsx", 500],
  ["apps/editor/src/editor-dialog-layer.tsx", 500],
  ["apps/editor/src/editor-secondary-surfaces.tsx", 500],
  ["apps/editor/src/editor-shell-view.tsx", 300],
  ["apps/editor/src/minimal-cycle-view-ribbon.tsx", 520],
  ["apps/editor/src/ribbon/home-overflow.tsx", 200],
  ["apps/editor/src/application/editor-export-controller.ts", 250],
  ["apps/editor/src/application/file-action-controller.ts", 200],
  ["apps/editor/src/application/selection-actions.ts", 200],
  ["apps/editor/src/application/bottom-editor-actions.ts", 300],
  ["apps/editor/src/application/clipboard-actions.ts", 350],
  ["apps/editor/src/runtime/viewport-controller.ts", 300],
  ["apps/editor/src/runtime/interaction-controller.ts", 300],
  ["apps/editor/src/runtime/document-lifecycle-controller.ts", 200],
  ["apps/editor/src/runtime/render-coordinator.ts", 300],
  ["apps/editor/src/runtime/presentation-preview.ts", 500],
  ["apps/editor/src/panels/inspector-panel.tsx", 500],
  ["apps/editor/src/minimal-cycle-view-panels.tsx", 500],
  ["apps/editor/src/editors/signal-editor.tsx", 500],
  ["apps/editor/src/editors/clock-generator-editor.tsx", 500],
  ["apps/editor/src/application/editor-surface-command-controller.ts", 300],
];
const forbiddenOwners = [
  ["Canonical mutation outside command/session path", /setSnapshot\([^)]*document|validateCanonicalDocument\([^)]*setSnapshot/],
  ["raw document/window listener lifecycle in root", /(?:document|window)\.(?:addEventListener|removeEventListener)\s*\(/],
  ["renderer/WaveDrom/geometry construction in root", /new\s+(?:TimelineGeometryOwner|EditorApplicationRuntime|CommandHistorySession)|createWaveformSurfaceProvider\s*\(|runtime\.createRenderer|(?:renderer|renderCoordinator)\.dispose\s*\(/],
  ["pure parser/default factory in root", /parseBulkSignalDefinitions|parseOpenDocument|createNewDocumentFromProductTemplate/],
  ["batch mutation bypass in root", /application\.executeBatch\s*\(/],
  ["semantic command construction in root", /create(?:Annotation|Transaction)\s*\(/],
  ["large secondary surface JSX in root", /<(?:SignalEditor|AnnotationEditor|TransactionEditor|BookmarkEditor|InspectorPanel|BottomEditorPanel|AdvancedJsonPanel|AIOperationPanel)\b/],
  ["shell slot JSX leaked into root", /<(?:EditorRibbon|EditorWorkspaceView|EditorStatusBar)\b/],
  ["large shell markup in root", /className="(?:desktop-workspace|cycle-panel|inspector-shell|modal-backdrop)"|<main\b|<section\b|<aside\b/],
];
const requiredOwners = ["Review scope, severity, navigation", "Viewport, timeline, ruler and grid lifecycle", "File open/save/export lifecycle", "UI action composition", "Presentation-only editor toggles", "Editor shell JSX", "Inspector panel composition", "Timeline surface controller", "Runtime viewport controller", "Runtime interaction controller", "Runtime document refresh lifecycle", "Runtime render coordinator", "Document Properties presentation", "Legend presentation", "Bottom Bookmark editor", "Bottom Annotation editor", "Annotation list presentation", "Home Ribbon overflow"];
const rootAllowListContract = /MinimalCycleView.*root allow-list:[\s\S]*ALLOW:[\s\S]*DENY:/;
const requiredSourceContracts = [
  ["command router", /useEditorCommandRouter/],
  ["action owner", /useEditorActions/],
  ["presentation owner", /useEditorPresentationState/],
  ["shell owner", /EditorShellView/],
  ["dialog shell owner", /EditorDialogLayer/],
  ["runtime DOM bridge split", /editor-dom-bridge/],
  ["timeline presentation state owner", /useTimelinePresentationState/],
  ["secondary surface owner", /useEditorSecondarySurfaces/],
];
const runtimeOwnershipContracts = [
  ["application runtime owns document epoch", applicationRuntimeSource, /class EditorApplicationRuntime[\s\S]*documentEpoch\s*=\s*new DocumentEpoch/],
  ["application runtime owns display mapping", applicationRuntimeSource, /displayMapping\s*=\s*new DisplayMappingCoordinator/],
  ["application runtime owns geometry and projection", applicationRuntimeSource, /geometry\s*=\s*new GeometryRegistry[\s\S]*projection\s*=\s*new ProjectionCoordinator/],
  ["application runtime creates renderer and WaveDrom adapter", applicationRuntimeSource, /createRenderer\([\s\S]*createWaveDromAdapter\(/],
  ["timeline surface is a typed runtime owner", timelineRuntimeHookSource, /createTimelineSurfaceController\(\w+\)/],
  ["timeline surface owns WaveDrom provider", timelineSurfaceSource, /createWaveformSurfaceProvider\(/],
  ["timeline surface owns one geometry owner", timelineSurfaceSource, /new TimelineGeometryOwner\(/],
  ["timeline surface owns renderer lifecycle", timelineSurfaceSource, /runtime\.createRenderer\([\s\S]*renderCoordinator\.dispose\(/],
  ["timeline surface reads current session state", timelineSurfaceSource, /session\.getSnapshot\(\)|sessionController\.snapshot\(\)/],
  ["timeline interactions read replaceable session state", timelineInteractionsSource, /getSnapshot:\s*\(\)\s*=>|getSnapshot\(\)\.document/],
  ["timeline interactions do not capture a mount-time session", timelineInteractionsSource, /readonly getSnapshot:/],
  ["signal split lifecycle is a non-React owner", signalSplitControllerSource, /createSignalSplitSurfaceController[\s\S]*createWaveformSurfaceProvider[\s\S]*runtime\.createRenderer/],
  ["signal split hook is a thin lifecycle adapter", signalSplitHookSource, /createSignalSplitSurfaceController\(input\)/],
  ["signal split controller has no React lifecycle dependency", signalSplitControllerSource, /^(?![\s\S]*from [\"']react[\"'])/],
  ["timeline surface owns document epoch boundary", timelineSurfaceSource, /documentEpoch\.(?:current|advance|isCurrent)\(/],
  ["render invalidation has one pure owner", renderInvalidationSource, /export function deriveRenderInvalidation\(/],
];
const directReactRuntimeOwnerPattern = /new\s+(?:EditorApplicationRuntime|CommandHistorySession|TimelineGeometryOwner)|createWaveformSurfaceProvider\s*\(|runtime\.createRenderer\s*\(|new\s+ProductionWaveDromAdapter/;
const presentationCommandSources = await Promise.all([
  ["ribbon constructs semantic commands", "apps/editor/src/minimal-cycle-view-ribbon.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["find/replace panel constructs semantic commands", "apps/editor/src/find-replace-panel.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["transaction editor constructs semantic commands", "apps/editor/src/transaction-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["clock editor constructs semantic commands", "apps/editor/src/editors/clock-generator-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["transaction lanes constructs semantic commands", "apps/editor/src/runtime/transaction-lanes.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["signal editor constructs semantic commands", "apps/editor/src/editors/signal-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["event table constructs semantic commands", "apps/editor/src/event-table.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["event row constructs semantic commands", "apps/editor/src/event-table-components.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["signal generator constructs semantic commands", "apps/editor/src/signal-generator-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["comment row constructs semantic commands", "apps/editor/src/comment-row-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["inspector clock constructs semantic commands", "apps/editor/src/inspector-clock-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["inspector bookmark constructs semantic commands", "apps/editor/src/inspector-bookmark-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["layout inspector constructs semantic commands", "apps/editor/src/layout-inspector.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["inspector annotation constructs semantic commands", "apps/editor/src/inspector-annotation-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["inspector panel constructs semantic commands", "apps/editor/src/panels/inspector-panel.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["document properties constructs semantic commands", "apps/editor/src/document-properties.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["legend view constructs semantic commands", "apps/editor/src/legend-view.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["bookmark editor constructs semantic commands", "apps/editor/src/bookmark-editor.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
  ["annotation list constructs semantic commands", "apps/editor/src/annotation-list.tsx", /(?:^|\n)\s*import[^;\n]*(?:SemanticCommand|nextCommandId)/],
].map(async ([name, owner, pattern]) => [name, pattern, await readFile(resolve(root, owner), "utf8")]));
const requiredShellContracts = [
  ["workspace shell owner", /EditorWorkspaceView/],
  ["ribbon presentation boundary", /EditorRibbon/],
];
const forbiddenShellOwnership = [
  ["EditorShellView semantic mutation ownership", /(?:SemanticCommand|commandRegistry|(?:application|session)\.(?:execute|replace)|executeBatch)/],
  ["EditorShellView runtime lifecycle ownership", /(?:EditorApplicationRuntime|CommandHistorySession|TimelineGeometryOwner|createWaveformSurfaceProvider|createWaveDromAdapter|runtime\.createRenderer)/],
  ["EditorShellView imperative listener lifecycle", /(?:addEventListener|removeEventListener)\s*\(/],
];
const violations = [
  ...forbiddenOwners.filter(([, pattern]) => pattern.test(source)).map(([name]) => name),
  ...requiredOwners.filter((owner) => !ownership.includes(owner)).map((owner) => `ownership map missing: ${owner}`),
  ...(!rootAllowListContract.test(ownership) ? ["ownership map missing MinimalCycleView root allow-list"] : []),
  ...requiredSourceContracts.filter(([, pattern]) => !pattern.test(source)).map(([name]) => `${name} contract missing`),
  ...runtimeOwnershipContracts.filter(([, ownerSource, pattern]) => !pattern.test(ownerSource)).map(([name]) => `${name} contract missing`),
  ...(/readonly session\s*:/.test(timelineInteractionsSource) ? ["timeline interactions must not capture a mount-time session"] : []),
  ...(/createWaveformSurfaceProvider|runtime\.createRenderer|createWaveDromAdapter/.test(signalSplitHookSource) ? ["signal split hook must not own renderer lifecycle"] : []),
  ...(deprecatedRuntimeBridgeExists ? ["deprecated runtime compatibility bridge must not be restored"] : []),
  ...editorReactSources.filter(([target, reactSource]) => !isOptInProbe(target) && directReactRuntimeOwnerPattern.test(reactSource)).map(([target]) => `React presentation directly owns long-lived runtime: ${target.replace(`${root}/`, "")}`),
  ...(!/createEditorSurfaceCommandController/.test(secondarySurfaceSource) ? ["surface command controller contract missing"] : []),
  ...(!/EditorSurfaceCommandController/.test(ribbonSource) || !/commands\.(?:createSignal|bringAnnotationsToFront|updateAnnotationStyle)/.test(ribbonSource) ? ["ribbon typed command controller contract missing"] : []),
  ...presentationCommandSources.filter(([, pattern, ownerSource]) => pattern.test(ownerSource)).map(([name]) => name),
  ...requiredShellContracts.filter(([, pattern]) => !pattern.test(shellSource)).map(([name]) => `${name} contract missing`),
  ...forbiddenShellOwnership.filter(([, pattern]) => pattern.test(shellSource)).map(([name]) => name),
  ...(/<(?:div|main|section|button|AIOperationPanel|EditorShellView)\b/.test(actionOwner) ? ["use-editor-actions must remain JSX-free"] : []),
  ...(/<(?:div|main|section|button|AIOperationPanel|EditorShellView)\b/.test(presentationOwner) ? ["use-editor-presentation-state must remain JSX-free"] : []),
  ...(exportDialogSource.includes("DeterministicExportService") ? ["ExportDialog must use EditorExportController"] : []),
  ...(/nextCommandId|SemanticCommand|transaction\.(?:linkSignal|unlinkSignal)/.test(linkedSignalsSource) ? ["TransactionLinkedSignals must use an application callback"] : []),
  ...(/nextCommandId|SemanticCommand|document\.replace/.test(advancedJsonSource) ? ["AdvancedJsonPanel must use an application callback"] : []),
  ...(source.includes("new TimelineGeometryOwner") || source.includes("createWaveformSurfaceProvider") || source.includes("attachEditorEventBindings") ? ["runtime lifecycle leaked into MinimalCycleView"] : []),
  ...runtimeHelperSources.flatMap(([helper, helperSource]) => helperSource.length === 0 ? [`empty runtime helper: ${helper}`] : []),
];
const preferredWarnings = [];
for (const [owner, max] of ownerBudgets) {
  const ownerSource = await readFile(resolve(root, owner), "utf8");
  const ownerLines = ownerSource.split(/\r?\n/).length;
  if (ownerLines > max) preferredWarnings.push(`${owner} exceeds preferred ${max} lines (${ownerLines})`);
}
const ratchet = JSON.parse(await readFile(resolve(root, "architecture/size-ratchet.json"), "utf8"));
for (const [ratchetFile, ceiling] of Object.entries(ratchet)) {
  if (ratchetFile.startsWith("_")) continue;
  const ratchetLines = (await readFile(resolve(root, ratchetFile), "utf8")).split("\n").length;
  if (ratchetLines > ceiling) violations.push(`${ratchetFile} grew past its ratchet ceiling ${ceiling} (${ratchetLines}); extract an owner or lower the ceiling with the refactor`);
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
