import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const renderer = await readFile(resolve(root, "packages/renderer/src/stable-surface.ts"), "utf8");
const disclosureSpec = await readFile(resolve(root, "packages/renderer/src/disclosure-chevron-spec.ts"), "utf8");
const editorIcon = await readFile(resolve(root, "apps/editor/src/editor-icon.tsx"), "utf8");
const inspectorSection = await readFile(resolve(root, "apps/editor/src/inspector-section.tsx"), "utf8");
const transactionTree = await readFile(resolve(root, "apps/editor/src/transaction-tree.tsx"), "utf8");
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
const missing = required.filter((name) => !iconSource.includes(`name === \"${name}\"`) && !iconSource.includes(`name === \"${name}\"`));
const disclosureOwners = {
  sharedSpecHasBothGlyphs: disclosureSpec.includes('down: { path: "M6 9l6 6 6-6", strokeWidth: 2 }') && disclosureSpec.includes('right: { path: "M9 6l6 6-6 6", strokeWidth: 2 }'),
  cycleConsumesSharedSpec: renderer.includes('DISCLOSURE_CHEVRON_SPEC[name === "chevron-down" ? "down" : "right"]'),
  reactIconsConsumeSharedSpec: editorIcon.includes("DISCLOSURE_CHEVRON_SPEC.down") && editorIcon.includes("DISCLOSURE_CHEVRON_SPEC.right"),
  inspectorUsesChevronNames: inspectorSection.includes('open ? "chevron-down" : "chevron-right"'),
  transactionTreeUsesChevronNames: transactionTree.includes('collapsed.has("__all__") ? "chevron-right" : "chevron-down"'),
  allOwnersUseSharedToggle: renderer.includes('"shared-disclosure-toggle"') && inspectorSection.includes("shared-disclosure-toggle") && transactionTree.includes("shared-disclosure-toggle"),
};
const report = { required, missing, duplicateSymbolIds: [...new Set(duplicateIds)], forbiddenViolations: violations, inlineGeometry: /createElementNS[\s\S]*append\("(?:path|circle)"\)/.test(iconSource), sharedBadgeRenderer, disclosureOwners };
console.log(JSON.stringify(report, null, 2));
if (missing.length || report.duplicateSymbolIds.length || violations.length || !report.inlineGeometry || !sharedBadgeRenderer || Object.values(disclosureOwners).some((value) => !value)) process.exitCode = 1;
