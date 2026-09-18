import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const renderer = await readFile(resolve(root, "packages/renderer/src/stable-surface.ts"), "utf8");
const sharedIcons = await readFile(resolve(root, "packages/renderer/src/left-tree-icon-spec.ts"), "utf8");
const editorIcons = await readFile(resolve(root, "apps/editor/src/editor-icon.tsx"), "utf8");
const styles = await readFile(resolve(root, "apps/editor/src/styles.css"), "utf8");
const sprite = await readFile(resolve(root, "../timing-chart-v1/gui-mockup/icons.svg"), "utf8");
const iconStart = renderer.indexOf("function createLeftTreeIcon");
const iconEnd = renderer.indexOf("interface Layers", iconStart);
const iconSource = iconStart >= 0 && iconEnd >= 0 ? renderer.slice(iconStart, iconEnd) : "";
const ids = [...sprite.matchAll(/<symbol\b[^>]*\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
const forbidden = [
  ["external sprite constant", /iconSprite|gui-mockup\/icons\.svg/],
  ["SVG use generation", /createElementNS\([^\n]*["']use["']|<use\b/],
  ["CSS icon content", /tree-(?:collapse|group-more|more|visibility)[^\{]*::before[^\}]*content\s*:/],
];
const violations = forbidden.filter(([, pattern]) => pattern.test(renderer) || pattern.test(styles)).map(([name]) => name);
const sharedBadgeRenderer = (renderer.match(/function createRoleBadge\(/g) ?? []).length === 1 && (renderer.match(/createRoleBadge\(document/g) ?? []).length >= 2;
const required = ["chevron-down", "chevron-right", "eye", "eye-off", "more", "comment"];
const missing = required.filter((name) => name === "more" || name === "comment"
  ? !iconSource.includes(`name === \"${name}\"`)
  : !new RegExp(`(?:[\"']${name}[\"']|\\b${name})\\s*:`).test(sharedIcons));
const sharedTreeIconSpec = renderer.includes("LEFT_TREE_ICON_PATHS[pathName]")
  && editorIcons.includes("LEFT_TREE_ICON_PATHS[treeIconName]");
const report = { required, missing, duplicateSymbolIds: [...new Set(duplicateIds)], forbiddenViolations: violations, inlineGeometry: /createElementNS[\s\S]*append\("(?:path|circle)"\)/.test(iconSource), sharedTreeIconSpec, sharedBadgeRenderer };
console.log(JSON.stringify(report, null, 2));
if (missing.length || report.duplicateSymbolIds.length || violations.length || !report.inlineGeometry || !sharedTreeIconSpec || !sharedBadgeRenderer) process.exitCode = 1;
