import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const manifest = JSON.parse(await readFile(resolve(root, "harness/gui/golden-manifest.json"), "utf8"));
const golden = await readFile(resolve(root, manifest.path));
const actual = createHash("sha256").update(golden).digest("hex").toUpperCase();
const report = { path: manifest.path, expectedSha256: manifest.sha256, actualSha256: actual, immutable: actual === manifest.sha256 };
console.log(JSON.stringify(report, null, 2));
if (!report.immutable) process.exitCode = 1;
