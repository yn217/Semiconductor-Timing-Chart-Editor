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
    evidence.push({ file: meta.file, title, cycles: meta.cycles, signalCount: meta.signalCount, transactionCount: meta.transactionCount, coverage: meta.coverage, counters, diagnostics });
  }

  await testInfo.attach("golden-samples-browser-evidence.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
  await page.screenshot({ path: ".tmp_gui_reference/golden-sample-20-browser-1280x720.png", animations: "disabled" });
});
