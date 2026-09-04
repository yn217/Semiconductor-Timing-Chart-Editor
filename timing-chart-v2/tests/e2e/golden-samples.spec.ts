import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { parseDocument } from "@timing-chart-v2/schema";
import { assertGoldenCoverageContract, assertGoldenSemanticContract, assertGoldenSvgContract, type GoldenExportFormat } from "../golden/golden-contract.js";
import { captureScenarioReview } from "../../harness/gui/ai-review-bundle.mjs";

type GoldenSample = {
  readonly file: string;
  readonly title: string;
  readonly cycles?: number;
  readonly signalCount?: number;
  readonly transactionCount?: number;
  readonly coverage: readonly string[];
};

const repoRoot = resolve(import.meta.dirname, "../..");
const manifests = [
  resolve(repoRoot, "samples/golden-protocol/timing_chart_sample_pack/manifest.json"),
  resolve(repoRoot, "samples/golden-feature-coverage/timing_chart_feature_coverage_pack/manifest.json"),
];

test.setTimeout(120_000);

async function samplesFromManifests() {
  const samples: Array<{ readonly meta: GoldenSample; readonly path: string }> = [];
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as GoldenSample[];
    for (const meta of manifest) samples.push({ meta, path: resolve(manifestPath, "..", "samples", meta.file) });
  }
  const filter = process.env.GOLDEN_SAMPLE_FILTER;
  return filter ? samples.filter(({ meta }) => meta.file.includes(filter)) : samples;
}

test("opens all 20 immutable Golden Samples in the production browser path", async ({ page }, testInfo) => {
  const samples = await samplesFromManifests();
  expect(samples).toHaveLength(process.env.GOLDEN_SAMPLE_FILTER ? 1 : 20);
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const evidence: Array<Record<string, unknown>> = [];
  const reviewOutput = testInfo.outputPath("sample-review-bundles");
  await mkdir(reviewOutput, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  for (const [index, { meta, path }] of samples.entries()) {
    const source = await readFile(path);
    const parsed = parseDocument(source.toString("utf8"));
    if (!parsed.ok) throw new Error(`${meta.file}: Golden source did not produce a validated Canonical document.`);
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: meta.file, mimeType: "application/json", buffer: source });
    const host = page.getByTestId("cycle-surface");
    await expect(page.locator(".app-titlebar h1")).toHaveText(meta.title, { timeout: 60_000 });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect(host.locator("[data-role='timing-chart-surface']")).toBeVisible();
    await expect(host).toHaveAttribute("data-canonical-revision", "0");
    const observedCounts = {
      cycles: Number(await page.locator(".editor-shell").getAttribute("data-cycle-count")),
      signals: Number(await page.locator(".editor-shell").getAttribute("data-signal-count")),
      transactions: Number(await page.locator(".editor-shell").getAttribute("data-transaction-count")),
    };
    assertGoldenSemanticContract(meta, observedCounts);
    if (meta.cycles !== undefined) await expect(page.locator(".editor-shell")).toHaveAttribute("data-cycle-count", String(meta.cycles));
    if (meta.signalCount !== undefined) await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", String(meta.signalCount));
    if (meta.transactionCount !== undefined) await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", String(meta.transactionCount));
    if (meta.signalCount !== undefined) await expect(page.getByTestId("signal-count-status")).toHaveText(`Signals: ${meta.signalCount}`);
    expect(await host.locator("[data-role='left-row'][data-row-id]").count()).toBeGreaterThan(0);
    const screenshotPath = `.tmp_gui_reference/golden-${String(index + 1).padStart(2, "0")}-${meta.file.replace(/\.tcd\.json$/, "")}.png`;
    await page.screenshot({ path: screenshotPath, animations: "disabled" });
    const review = await captureScenarioReview({
      page,
      scenario: `GOLDEN-SAMPLE-${String(index + 1).padStart(2, "0")}`,
      gitHead,
      viewport: [1672, 941],
      rules: [
        { selector: ".app-titlebar h1", target: "title" },
        { selector: "[data-testid='ribbon']", target: "Ribbon" },
      ],
      actions: [`open:${meta.file}`, "capture:production-browser"],
      images: { current: screenshotPath },
      outputPath: resolve(reviewOutput, `${String(index + 1).padStart(2, "0")}-${meta.file.replace(/\.tcd\.json$/, "")}.json`),
    });
    expect(review.testedCommit).toBe(gitHead);
    expect(review.diagnostics.findings.filter((finding) => ["CONSOLE_ERROR", "PAGE_ERROR", "RESOURCE_FAILURE"].includes(finding.category))).toEqual([]);
    const coverageEvidence = assertGoldenCoverageContract(meta, parsed.document, { rendered: true, visualGate: true });
    const title = await page.locator(".app-titlebar h1").textContent();
    const counters = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as Record<string, unknown>;
    const diagnostics = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-performance-counters") ?? "null") as Record<string, unknown>;
    expect(title).toBe(meta.title);
    const fileTab = page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true });
    if (!((await fileTab.getAttribute("class")) ?? "").split(/\s+/).includes("active")) await fileTab.click();
    const pendingSave = page.waitForEvent("download");
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    const saved = await pendingSave;
    const savedPath = await saved.path();
    expect(savedPath).toBeTruthy();
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
    await expect(page.locator(".app-titlebar h1")).toHaveText(meta.title, { timeout: 60_000 });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect(host).toHaveAttribute("data-canonical-revision", "0");
    evidence.push({ file: meta.file, title, cycles: meta.cycles, signalCount: meta.signalCount, transactionCount: meta.transactionCount, coverage: meta.coverage, coverageEvidence, saveOpen: true, visualArtifact: `.tmp_gui_reference/golden-${String(index + 1).padStart(2, "0")}-${meta.file.replace(/\.tcd\.json$/, "")}.png`, counters, diagnostics });
  }

  await testInfo.attach("golden-samples-browser-evidence.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
  await page.screenshot({ path: ".tmp_gui_reference/golden-sample-20-browser-1280x720.png", animations: "disabled" });
});

test("exports SVG for all 20 immutable Golden Samples without mutating Canonical state", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const samples = await samplesFromManifests();
  expect(samples).toHaveLength(process.env.GOLDEN_SAMPLE_FILTER ? 1 : 20);
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const evidence: Array<Record<string, unknown>> = [];

  for (const { meta, path } of samples) {
    const source = await readFile(path);
    const parsed = parseDocument(source.toString("utf8"));
    if (!parsed.ok) throw new Error(`${meta.file}: Golden source did not produce a validated Canonical document.`);
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: meta.file, mimeType: "application/json", buffer: source });
    const host = page.getByTestId("cycle-surface");
    await expect(page.locator(".app-titlebar h1")).toHaveText(meta.title, { timeout: 60_000 });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    const before = {
      revision: await host.getAttribute("data-canonical-revision"),
      history: await host.getAttribute("data-history-depth"),
      session: await host.getAttribute("data-session-counters"),
    };
    const fileTab = page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true });
    if (!((await fileTab.getAttribute("class")) ?? "").split(/\s+/).includes("active")) await fileTab.click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
    const pending = page.waitForEvent("download", { timeout: 5_000 }).catch(() => undefined);
    await dialog.getByRole("button", { name: "Export SVG" }).click();
    const download = await pending;
    if (!download) throw new Error(`${meta.file}: required SVG export was not produced; status=${await dialog.locator("output").textContent()}`);
    const outputPath = await download!.path();
    expect(outputPath).toBeTruthy();
    const svg = await readFile(outputPath!);
    assertGoldenSvgContract(meta, svg.toString("utf8"));
    const exportedFormats: GoldenExportFormat[] = ["svg"];
    for (const format of ["png", "pdf"] as const) {
      if (!meta.coverage.some((coverage) => coverage.toLowerCase() === `${format} export`)) continue;
      await dialog.getByLabel("Export format").selectOption(format);
      const pendingFormat = page.waitForEvent("download", { timeout: 15_000 });
      await dialog.getByRole("button", { name: `Export ${format.toUpperCase()}` }).click();
      const formatDownload = await pendingFormat;
      const formatPath = await formatDownload.path();
      expect(formatPath).toBeTruthy();
      const bytes = await readFile(formatPath!);
      expect(bytes.length).toBeGreaterThan(100);
      if (format === "png") expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      if (format === "pdf") expect(bytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
      exportedFormats.push(format);
    }
    const coverageEvidence = assertGoldenCoverageContract(meta, parsed.document, { rendered: true, visualGate: true, exportedFormats });
    await dialog.getByRole("button", { name: "Close export" }).click();
    expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
    expect(await host.getAttribute("data-history-depth")).toBe(before.history);
    expect(await host.getAttribute("data-session-counters")).toBe(before.session);
    evidence.push({ file: meta.file, title: meta.title, export: exportedFormats, svgBytes: svg.length, coverageEvidence, canonicalRevision: before.revision, historyDepth: before.history });
  }

  await testInfo.attach("golden-sample-svg-export-evidence.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
});
