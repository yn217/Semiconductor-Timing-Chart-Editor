import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const packageRules = JSON.parse(await readFile(path.join(root, "architecture/packages.json"), "utf8"));
const stateOwners = JSON.parse(await readFile(path.join(root, "architecture/state-ownership.json"), "utf8"));
const errors = [];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  }));
  return nested.flat();
}

function packageNameFromSpecifier(specifier) {
  const match = /^@timing-chart-v2\/([^/]+)$/.exec(specifier);
  return match?.[1];
}

for (const [unit, allowed] of Object.entries(packageRules)) {
  const directory = unit === "apps/editor"
    ? path.join(root, "apps/editor")
    : path.join(root, "packages", unit);
  const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const allDeclared = Object.keys({ ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) });
  const declared = allDeclared
    .filter((name) => name.startsWith("@timing-chart-v2/"))
    .map((name) => name.slice("@timing-chart-v2/".length));

  for (const dependency of declared) {
    if (!allowed.includes(dependency)) {
      errors.push(`${unit}: manifest dependency on ${dependency} is forbidden`);
    }
  }
  if (["schema", "core", "commands", "history", "geometry"].includes(unit)) {
    for (const dependency of allDeclared.filter((name) => ["react", "react-dom", "pixi.js", "wavedrom"].includes(name))) {
      errors.push(`${unit}: manifest dependency on ${dependency} is forbidden`);
    }
  }

  const sourceFiles = (await filesBelow(path.join(directory, "src")))
    .filter((file) => /\.(?:ts|tsx)$/.test(file));
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    const imports = [
      ...[...source.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)].map((match) => match[2]),
      ...[...source.matchAll(/^\s*import\s+(["'])([^"']+)\1/gm)].map((match) => match[2]),
    ];
    for (const specifier of imports) {
      const workspaceDependency = packageNameFromSpecifier(specifier);
      if (workspaceDependency && !allowed.includes(workspaceDependency)) {
        errors.push(`${path.relative(root, file)}: import of ${workspaceDependency} is forbidden`);
      }
      if (specifier.includes("gui-mockup") || specifier.includes("references/") || specifier.includes("cad-v2")) {
        errors.push(`${path.relative(root, file)}: V1/other-product runtime import is forbidden`);
      }
      if (specifier === "wavedrom" && unit !== "wavedrom-adapter") {
        errors.push(`${path.relative(root, file)}: WaveDrom imports belong only in wavedrom-adapter`);
      }
      if (specifier.startsWith(".")) {
        const target = path.resolve(path.dirname(file), specifier);
        const relativeTarget = path.relative(directory, target);
        if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
          errors.push(`${path.relative(root, file)}: relative import escapes its package boundary`);
        }
      }
    }

    if (["schema", "core", "commands", "history", "geometry"].includes(unit)) {
      if (/(?:\bwindow\s*\.|\bglobalThis\s*\.\s*(?:window|document)\b|\bdocument\s*\.\s*(?:querySelector|getElementById|createElement|createElementNS|addEventListener|removeEventListener|body|documentElement)\b|\b(?:HTMLElement|SVGElement)\b)/.test(source)) {
        errors.push(`${path.relative(root, file)}: browser/DOM ownership is forbidden`);
      }
      if (imports.some((specifier) => ["react", "react-dom", "pixi.js"].includes(specifier))) {
        errors.push(`${path.relative(root, file)}: UI/renderer dependency is forbidden`);
      }
    }
  }
}

const stateKeys = new Set();
for (const state of stateOwners) {
  if (stateKeys.has(state.key)) errors.push(`duplicate state owner: ${state.key}`);
  stateKeys.add(state.key);
  if (state.class !== "persistent" && (state.saved || state.undoable)) {
    errors.push(`${state.key}: only persistent state may be saved or undoable`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Architecture boundary gate passed (${Object.keys(packageRules).length} units, ${stateKeys.size} state owners).`);
}
