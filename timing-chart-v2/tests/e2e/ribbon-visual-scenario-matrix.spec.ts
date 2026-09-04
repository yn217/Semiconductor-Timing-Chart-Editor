import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { captureScenarioReview } from "../../harness/gui/ai-review-bundle.mjs";

const tabs = ["File", "Home", "Insert", "Timeline", "Annotation", "View", "Check", "AI"] as const;
const ribbonMetricRules = [
  { selector: "[data-testid='ribbon'] button.ds-ribbon-button", target: "Ds Ribbon command", iconSelector: "svg", iconGroup: "ds-ribbon-command-icons", groupBy: "major-group", maxDeltaPx: 2 },
  { selector: "[data-testid='ribbon'] button.ribbon-tool", target: "Legacy Ribbon command", iconSelector: "svg", iconGroup: "legacy-ribbon-command-icons", groupBy: "major-group", maxDeltaPx: 2 },
  { selector: "[data-testid='ribbon'] .ds-ribbon-group > b, [data-testid='ribbon'] .ribbon-group > b", target: "Ribbon group footer", measureSelf: true, baselineGroup: "ribbon-footer-labels", maxDeltaPx: 2 },
];

test("captures deterministic production Ribbon scenario manifests", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("ribbon-scenarios");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const manifests = [];
  for (const tab of tabs) {
    await page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true }).click();
    await expect(page.locator("[data-testid='ribbon']")).toBeVisible();
    const image = resolve(output, `${tab.toLowerCase()}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    const manifest = await captureScenarioReview({ page, scenario: `RIBBON-${tab.toUpperCase()}-DESKTOP`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-testid='ribbon']", target: "Ribbon" }, ...ribbonMetricRules], actions: [`switch:${tab}`], images: { current: image }, outputPath: resolve(output, `${tab.toLowerCase()}.json`) });
    expect(manifest.diagnostics.findings.filter((finding) => ["ICON_ALIGNMENT", "BASELINE"].includes(finding.category)), `${tab} icon/baseline diagnostics`).toEqual([]);
    manifests.push(manifest);
  }
  expect(manifests).toHaveLength(tabs.length);
  expect(manifests.map((manifest) => manifest.scenario)).toEqual(tabs.map((tab) => `RIBBON-${tab.toUpperCase()}-DESKTOP`));
  expect(manifests.every((manifest) => manifest.testedCommit === gitHead && manifest.capture.viewport.join("x") === "1672x941")).toBe(true);
  expect(manifests.every((manifest) => manifest.diagnostics.findings.every((finding) => finding.severity && finding.category && finding.target && finding.evidence))).toBe(true);
  expect(manifests.flatMap((manifest) => manifest.diagnostics.findings.filter((finding) => ["CONSOLE_ERROR", "PAGE_ERROR", "RESOURCE_FAILURE"].includes(finding.category)))).toEqual([]);
});

test("covers compressed Ribbon layout and Home round-trip without semantic mutation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1365, height: 800 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const ribbon = page.getByTestId("ribbon");
  const ribbonHeight = (await ribbon.boundingBox())!.height;
  const workspaceY = (await page.locator(".desktop-workspace").boundingBox())!.y;
  const output = testInfo.outputPath("ribbon-scenarios");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const compressedImage = resolve(output, "compressed.png");
  await page.screenshot({ path: compressedImage, animations: "disabled" });
  const compressedManifest = await captureScenarioReview({ page, scenario: "RIBBON-COMPRESSED", gitHead, viewport: [1365, 800], rules: [{ selector: "[data-testid='ribbon']", target: "Ribbon" }, ...ribbonMetricRules], actions: ["viewport:1365x800"], images: { current: compressedImage }, outputPath: resolve(output, "compressed.json") });
  expect(compressedManifest.diagnostics.findings.filter((finding) => ["ICON_ALIGNMENT", "BASELINE"].includes(finding.category)), "compressed icon/baseline diagnostics").toEqual([]);
  for (const tab of ["Insert", "View", "Check", "AI", "Home", "View", "Home"]) {
    await page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true }).click();
    await expect(page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true })).toHaveClass(/active/);
    expect((await ribbon.boundingBox())!.height).toBe(ribbonHeight);
    expect((await page.locator(".desktop-workspace").boundingBox())!.y).toBe(workspaceY);
    expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  }
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
  expect(await ribbon.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  const roundtripImage = resolve(output, "roundtrip.png");
  await page.screenshot({ path: roundtripImage, animations: "disabled" });
  const roundtripManifest = await captureScenarioReview({ page, scenario: "RIBBON-ROUNDTRIP", gitHead, viewport: [1365, 800], rules: [{ selector: "[data-testid='ribbon']", target: "Ribbon" }, ...ribbonMetricRules], actions: ["Home:other:Home"], images: { current: roundtripImage }, outputPath: resolve(output, "roundtrip.json") });
  expect(roundtripManifest.diagnostics.findings.filter((finding) => ["ICON_ALIGNMENT", "BASELINE"].includes(finding.category)), "roundtrip icon/baseline diagnostics").toEqual([]);
});
