import { readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";

const root = path.resolve(import.meta.dirname, "..");
const css = await readFile(path.join(root, "apps/editor/src/styles/mode-cycle.css"), "utf8");
const combinedCss = await readFile(path.join(root, "apps/editor/src/styles/mode-combined.css"), "utf8");
const workspaceView = await readFile(path.join(root, "apps/editor/src/editor-workspace-view.tsx"), "utf8");
const stylesheet = postcss.parse(css);
const combinedStylesheet = postcss.parse(combinedCss);
const errors = [];

function declarationsFor(selector) {
  const declarations = new Map();
  stylesheet.walkRules(selector, (rule) => {
    rule.walkDecls((declaration) => declarations.set(declaration.prop, declaration.value));
  });
  return declarations;
}

function requireDeclaration(selector, property, expected) {
  const actual = declarationsFor(selector).get(property);
  if (actual !== expected) errors.push(`${selector}: expected ${property}: ${expected}; found ${actual ?? "<missing>"}`);
}

function requireCombinedDeclaration(selector, property, expected) {
  const declarations = new Map();
  combinedStylesheet.walkRules(selector, (rule) => {
    rule.walkDecls((declaration) => declarations.set(declaration.prop, declaration.value));
  });
  const actual = declarations.get(property);
  if (actual !== expected) errors.push(`${selector}: expected ${property}: ${expected}; found ${actual ?? "<missing>"}`);
}

// Static architecture contract: Cycle's time-domain column owns horizontal overflow,
// while the fixed columns occupy sibling grid columns and never enter that scroll owner.
requireDeclaration('.surface-host [data-role="timeline-viewport"]', "display", "contents");
requireDeclaration('.desktop-workspace[data-workspace-owner="CycleWorkspace"] .surface-host [data-role="timing-chart-surface"]', "grid-template-columns", "var(--gui-left-width) var(--gui-frozen-width) minmax(0, 1fr)");
requireDeclaration('.desktop-workspace[data-workspace-owner="CycleWorkspace"] .surface-host [data-role="timeline-viewport"]', "display", "grid");
requireDeclaration('.desktop-workspace[data-workspace-owner="CycleWorkspace"] .surface-host [data-role="timeline-viewport"]', "grid-column", "3");
requireDeclaration('.desktop-workspace[data-workspace-owner="CycleWorkspace"] .surface-host [data-role="timeline-viewport"]', "overflow-x", "scroll");
if (!/\(workspace\.timeViewportOwner === "cycle-inner" \|\| workspace\.timeViewportOwner === "combined-inner"\) && <TimelineHorizontalScrollbar\b[^>]*\/>/.test(workspaceView)) {
  errors.push("TimelineHorizontalScrollbar must mount only for Cycle/Combined inner owners; standalone Transaction uses its own viewport overflow.");
}

// Combined uses the same fixed-column/time-column split as Cycle but keeps its
// own workspace-scoped geometry and horizontal owner contract.
requireCombinedDeclaration('.desktop-workspace[data-workspace-owner="CombinedWorkspace"] .surface-host [data-role="timing-chart-surface"]', "grid-template-columns", "var(--gui-left-width) var(--gui-frozen-width) minmax(0, 1fr)");
requireCombinedDeclaration('.desktop-workspace[data-workspace-owner="CombinedWorkspace"] .surface-host [data-role="timeline-viewport"]', "grid-column", "3");
requireCombinedDeclaration('.desktop-workspace[data-workspace-owner="CombinedWorkspace"] .surface-host [data-role="timeline-viewport"]', "overflow-x", "scroll");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Cycle scroll-owner architecture contract: PASS");
}
