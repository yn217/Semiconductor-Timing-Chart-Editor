import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

type GoldenSample = {
  readonly file: string;
  readonly title: string;
  readonly cycles?: number;
  readonly signalCount?: number;
  readonly transactionCount?: number;
  readonly coverage: readonly string[];
};

const repoRoot = resolve(import.meta.dirname, "../../..");
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
  return samples;
}

test("opens all 20 immutable Golden Samples in the production browser path", async ({ page }, testInfo) => {
  const samples = await samplesFromManifests();
  expect(samples).toHaveLength(20);
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const evidence: Array<Record<string, unknown>> = [];

  for (const { meta, path } of samples) {
    const source = await readFile(path);
    await page.locator("input[type='file']").setInputFiles({ name: meta.file, mimeType: "application/json", buffer: source });
    const host = page.getByTestId("cycle-surface");
    await expect(page.locator(".app-titlebar h1")).toHaveText(meta.title, { timeout: 60_000 });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect(host.locator("[data-role='timing-chart-surface']")).toBeVisible();
    await expect(host).toHaveAttribute("data-canonical-revision", "0");
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
    await page.locator("input[type='file']").setInputFiles(savedPath!);
    await expect(page.locator(".app-titlebar h1")).toHaveText(meta.title, { timeout: 60_000 });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect(host).toHaveAttribute("data-canonical-revision", "0");
    evidence.push({ file: meta.file, title, cycles: meta.cycles, signalCount: meta.signalCount, transactionCount: meta.transactionCount, coverage: meta.coverage, saveOpen: true, counters, diagnostics });
  }

  await testInfo.attach("golden-samples-browser-evidence.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
  await page.screenshot({ path: ".tmp_gui_reference/golden-sample-20-browser-1280x720.png", animations: "disabled" });
});

test("exports SVG for all 20 immutable Golden Samples without mutating Canonical state", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const samples = await samplesFromManifests();
  expect(samples).toHaveLength(20);
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const evidence: Array<Record<string, unknown>> = [];

  for (const { meta, path } of samples) {
    await page.locator("input[type='file']").setInputFiles({ name: meta.file, mimeType: "application/json", buffer: await readFile(path) });
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
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Export SVG" }).click();
    const download = await pending;
    const outputPath = await download.path();
    expect(outputPath).toBeTruthy();
    const svg = await readFile(outputPath!);
    expect(svg.toString("utf8")).toContain(meta.title);
    await dialog.getByRole("button", { name: "Close export" }).click();
    expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
    expect(await host.getAttribute("data-history-depth")).toBe(before.history);
    expect(await host.getAttribute("data-session-counters")).toBe(before.session);
    evidence.push({ file: meta.file, title: meta.title, svgBytes: svg.length, canonicalRevision: before.revision, historyDepth: before.history });
  }

  await testInfo.attach("golden-sample-svg-export-evidence.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
});
