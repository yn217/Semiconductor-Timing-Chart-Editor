import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function openingButtonTags(source) {
  const tags = [];
  for (let start = source.indexOf("<button"); start >= 0; start = source.indexOf("<button", start + 7)) {
    const boundary = source[start + 7];
    if (boundary !== undefined && !/[\s>]/.test(boundary)) continue;
    let quote = "";
    let braces = 0;
    for (let index = start + 7; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === quote && source[index - 1] !== "\\") quote = "";
        continue;
      }
      if (character === "\"" || character === "'") { quote = character; continue; }
      if (character === "{") { braces += 1; continue; }
      if (character === "}") { braces = Math.max(0, braces - 1); continue; }
      if (character === ">" && braces === 0) {
        tags.push({ text: source.slice(start, index + 1), offset: start });
        break;
      }
    }
  }
  return tags;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function stripCommentsPreservingLines(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, " "));
}

/** Finds the full `<button ...>...</button>` element (opening tag through its
 * matching close tag) starting at an opening tag discovered by
 * openingButtonTags, so callers can inspect the button's visible/accessible
 * text alongside its attributes. Nested `<button>` elements don't occur in
 * this codebase's JSX, so a simple non-nesting scan is sufficient. */
function closingButtonTagIndex(source, openTagEnd) {
  const close = source.indexOf("</button>", openTagEnd);
  return close < 0 ? source.length : close;
}

/**
 * #332 item C: a control can evade the #253 dead-control check above by
 * having a real onClick handler that changes only a piece of local status
 * text/counter state, never producing the effect its label advertises (see
 * #332's Clock/Annotation "Preview" placeholders, both fixed in the same
 * issue). This flags any <button> whose visible text or aria-label reads as
 * a Preview control when the given source contains no call to any
 * callback-prop-shaped identifier (`onXxx(...)`) at all -- the shape every
 * real preview effect in this codebase uses to delegate out to renderer-level
 * DOM work (see refreshClockPreview/refreshAnnotationPreview/
 * refreshGroupStylePreview in runtime/presentation-preview.ts), whether
 * called directly from the click handler or from a `useEffect` reacting to
 * the toggled state. This is intentionally whole-source, not per-button,
 * scoped: precise per-button attribution of an effect that may be wired
 * through an intermediate local function or a state-driven effect isn't
 * staticaly decidable without a real type-checker, and a coarser check that
 * only flags a preview control with literally zero delegated effect anywhere
 * in its own file is the version that can't false-positive against a real,
 * working implementation.
 */
export function auditPreviewControls(source, file = "fixture.tsx") {
  const errors = [];
  const hasDelegatedEffect = /\bon[A-Z]\w*\s*\(/.test(source);
  if (hasDelegatedEffect) return errors;
  for (const tag of openingButtonTags(source)) {
    const close = closingButtonTagIndex(source, tag.offset + tag.text.length);
    const element = source.slice(tag.offset, close);
    if (!/preview/i.test(element)) continue;
    errors.push(`${file}:${lineNumber(source, tag.offset)} Preview-labeled <button> has no delegated effect (onXxx(...)) anywhere in its source -- looks like a status-text-only placeholder`);
  }
  return errors;
}

export function auditSource(source, file = "fixture.tsx") {
  const executableSource = stripCommentsPreservingLines(source);
  const errors = [];
  for (const tag of openingButtonTags(executableSource)) {
    const disabled = /\bdisabled\s*=/.test(tag.text);
    const hasBehavior = /\bon(?:Click|KeyDown|PointerDown|PointerUp|DragOver|DragLeave|Drop|Submit)\s*=/.test(tag.text)
      || /\btype\s*=\s*["']submit["']/.test(tag.text);
    if (!hasBehavior) {
      errors.push(`${file}:${lineNumber(executableSource, tag.offset)} enabled/disabled <button> has no command, form-submit, or event behavior`);
    }
  }
  errors.push(...auditPreviewControls(executableSource, file));
  return errors;
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  }));
  return nested.flat();
}

export async function auditProductionEditor(root) {
  const files = (await filesBelow(path.join(root, "apps", "editor", "src"))).filter((file) => file.endsWith(".tsx"));
  const errors = [];
  for (const file of files) errors.push(...auditSource(await readFile(file, "utf8"), path.relative(root, file)));
  return { files: files.length, errors };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = path.resolve(import.meta.dirname, "..");
  const report = await auditProductionEditor(root);
  if (report.errors.length > 0) {
    console.error(report.errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Interactive control audit passed (${report.files} editor source files).`);
  }
}
