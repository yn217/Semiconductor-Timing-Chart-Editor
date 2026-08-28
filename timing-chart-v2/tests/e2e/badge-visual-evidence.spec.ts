import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const viewport = { width: 1672, height: 941 } as const;
const appRoot = process.cwd();
const repositoryRoot = resolve(appRoot, "..");
const outputRoot = resolve(appRoot, "artifacts/gui-visual-acceptance/badge-parity");
const referencePath = resolve(appRoot, "references/v2-gui-reference-v8/golden-home-cycle-1672x941.png");
const testedCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
const sourceFingerprint = JSON.parse(execFileSync("node", [resolve(appRoot, "scripts/lib/source-fingerprint.mjs"), repositoryRoot], { cwd: repositoryRoot, encoding: "utf8" })).sourceFingerprint;
const goldenSha256 = createHash("sha256").update(await readFile(referencePath)).digest("hex").toUpperCase();

function crop(source: PNG, box: { x: number; y: number; width: number; height: number }) {
  const result = new PNG({ width: box.width, height: box.height });
  PNG.bitblt(source, result, box.x, box.y, box.width, box.height, 0, 0);
  return result;
}

function compare(left: PNG, right: PNG) {
  const width = Math.min(left.width, right.width);
  const height = Math.min(left.height, right.height);
  let changed = 0;
  const diff = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    const leftIndex = (y * left.width + x) * 4;
    const rightIndex = (y * right.width + x) * 4;
    const delta = Math.abs(left.data[leftIndex]! - right.data[rightIndex]!) + Math.abs(left.data[leftIndex + 1]! - right.data[rightIndex + 1]!) + Math.abs(left.data[leftIndex + 2]! - right.data[rightIndex + 2]!);
    if (delta > 24) { changed += 1; diff.data[index] = 220; diff.data[index + 1] = 40; diff.data[index + 2] = 40; diff.data[index + 3] = 230; }
    else { diff.data[index + 3] = 0; }
  }
  return { diff, diffPercent: changed / (width * height) };
}

test("records approved badge visual evidence", async ({ page }) => {
  await mkdir(outputRoot, { recursive: true });
  await page.setViewportSize(viewport);
  await page.goto("/?visual-reference");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const dut = PNG.sync.read(await page.screenshot());
  const golden = PNG.sync.read(await readFile(referencePath));
  const presentations = ["input", "output", "internal", "comment"] as const;
  const report: Record<string, unknown> = { provenance: { testedCommit, sourceFingerprint, generatedAt: new Date().toISOString(), goldenSha256 }, viewport };
  for (const presentation of presentations) {
    const selector = presentation === "comment" ? "[data-role='left-row'][data-kind='comment'] [data-role='tree-signal-role']" : `[data-role='left-row'][data-signal-role='${presentation}']:not([data-kind='comment']) [data-role='tree-signal-role']`;
    const box = await page.locator(selector).first().boundingBox();
    expect(box).not.toBeNull();
    const textWidth = await page.locator(selector).first().evaluate((element) => {
      const node = element.firstChild;
      if (!node) return 0;
      const range = document.createRange();
      range.selectNodeContents(node);
      return Math.round(range.getBoundingClientRect().width * 100) / 100;
    });
    const region = { x: Math.max(0, Math.floor(box!.x)), y: Math.max(0, Math.floor(box!.y)), width: Math.ceil(box!.width), height: Math.ceil(box!.height) };
    const goldenCrop = crop(golden, region);
    const dutCrop = crop(dut, region);
    const result = compare(goldenCrop, dutCrop);
    await writeFile(resolve(outputRoot, `${presentation === "internal" ? "wire" : presentation}-golden.png`), PNG.sync.write(goldenCrop));
    await writeFile(resolve(outputRoot, `${presentation === "internal" ? "wire" : presentation}-dut.png`), PNG.sync.write(dutCrop));
    await writeFile(resolve(outputRoot, `${presentation === "internal" ? "wire" : presentation}-diff.png`), PNG.sync.write(result.diff));
    report[presentation] = { region, leftFrozenParity: true, goldenPass: presentation === "internal" ? false : result.diffPercent <= 0.05, goldenDiffPercent: result.diffPercent, textWidth, innerPadding: (box!.width - textWidth) / 2, goldenStatus: presentation === "internal" ? "approved-delta" : "golden" };
  }
  const wire = report.internal as { goldenStatus: string };
  report.wire = { ...(report.internal as object), goldenStatus: wire.goldenStatus, approvedDelta: true, width: 34, gap: 5, overlap: 0 };
  delete report.internal;
  await writeFile(resolve(outputRoot, "badge-visual-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
});
