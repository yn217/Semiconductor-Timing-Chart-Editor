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

export function auditSource(source, file = "fixture.tsx") {
  const errors = [];
  for (const tag of openingButtonTags(source)) {
    const disabled = /\bdisabled\s*=/.test(tag.text);
    const hasBehavior = /\bon(?:Click|KeyDown|PointerDown|PointerUp|DragOver|DragLeave|Drop|Submit)\s*=/.test(tag.text)
      || /\btype\s*=\s*["']submit["']/.test(tag.text);
    if (!hasBehavior) {
      errors.push(`${file}:${lineNumber(source, tag.offset)} enabled/disabled <button> has no command, form-submit, or event behavior`);
    }
  }
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
