import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { captureScenarioReview } from "../../harness/gui/ai-review-bundle.mjs";

const tabs = ["File", "Home", "Insert", "Timeline", "Annotation", "View", "Check", "AI"] as const;

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
    const ribbon = page.locator("[data-testid='ribbon']");
    await expect(ribbon).toBeVisible();
    const image = resolve(output, `${tab.toLowerCase()}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    // A full-page screenshot is too coarse for a reviewer to judge Ribbon
    // typography/icon alignment at a glance -- also persist just the Ribbon
    // itself as a crop so the bundle carries a direct-review-ready image.
    const crop = resolve(output, `${tab.toLowerCase()}-ribbon-crop.png`);
    await ribbon.screenshot({ path: crop, animations: "disabled" });
    manifests.push(await captureScenarioReview({
      page, scenario: `RIBBON-${tab.toUpperCase()}-DESKTOP`, gitHead, viewport: [1672, 941],
      // iconGroup/baselineGroup are left undeclared here on purpose: the
      // shared harness now derives one per (target, className) automatically,
      // so buttons that intentionally use a different class (a different
      // sizing system) are never force-compared against each other -- only
      // literally-same-class controls are checked for icon-size/baseline drift.
      // Direct-child selectors only: a DsRibbonGroup's own DsRibbonButton
      // row is meant to be visually uniform, but some groups (Font, Arrange)
      // embed a custom sub-toolbar (FontStyleToolbar, ArrangeGroup) that owns
      // its own internal multi-row button layout by design -- a descendant
      // selector would wrongly compare those nested buttons against the
      // command row and flag legitimate design as drift.
      rules: [{ selector: "[data-testid='ribbon']", target: "Ribbon" }, { selector: "[data-testid='ribbon'] .ribbon-group > button, [data-testid='ribbon'] .ds-ribbon-group > button", target: "Ribbon command", iconSelector: "svg", labelSelector: "span" }],
      actions: [`switch:${tab}`], images: { current: image }, crops: [crop], outputPath: resolve(output, `${tab.toLowerCase()}.json`),
    }));
  }
  expect(manifests).toHaveLength(tabs.length);
  expect(manifests.map((manifest) => manifest.scenario)).toEqual(tabs.map((tab) => `RIBBON-${tab.toUpperCase()}-DESKTOP`));
  expect(manifests.every((manifest) => manifest.testedCommit === gitHead && manifest.capture.viewport.join("x") === "1672x941")).toBe(true);
  expect(manifests.every((manifest) => manifest.crops.length === 1)).toBe(true);
  expect(manifests.every((manifest) => manifest.diagnostics.findings.every((finding) => finding.severity && finding.category && finding.target && finding.evidence))).toBe(true);
  expect(manifests.flatMap((manifest) => manifest.diagnostics.findings.filter((finding) => ["CONSOLE_ERROR", "PAGE_ERROR", "RESOURCE_FAILURE"].includes(finding.category)))).toEqual([]);
  // Same-class Ribbon command controls must agree on icon size and label
  // baseline within each tab -- this is the machine-detectable half of #307's
  // "uneven icon rows" / "footer baseline drift" acceptance criteria.
  expect(manifests.flatMap((manifest) => manifest.diagnostics.findings.filter((finding) => ["ICON_ALIGNMENT", "BASELINE"].includes(finding.category)))).toEqual([]);
});

test("covers compressed Ribbon layout and Home round-trip without semantic mutation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1365, height: 800 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("ribbon-scenarios");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const ribbon = page.getByTestId("ribbon");
  const ribbonHeight = (await ribbon.boundingBox())!.height;
  const workspaceY = (await page.locator(".desktop-workspace").boundingBox())!.y;
  const compressedImage = resolve(output, "compressed.png");
  const compressedCrop = resolve(output, "compressed-ribbon-crop.png");
  await page.screenshot({ path: compressedImage, animations: "disabled" });
  await ribbon.screenshot({ path: compressedCrop, animations: "disabled" });
  const compressedManifest = await captureScenarioReview({
    page, scenario: "RIBBON-COMPRESSED", gitHead, viewport: [1365, 800],
    rules: [{ selector: "[data-testid='ribbon']", target: "Ribbon" }],
    actions: ["load:compressed-viewport"], images: { current: compressedImage }, crops: [compressedCrop], outputPath: resolve(output, "compressed.json"),
  });
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
  const roundtripCrop = resolve(output, "roundtrip-ribbon-crop.png");
  await page.screenshot({ path: roundtripImage, animations: "disabled" });
  await ribbon.screenshot({ path: roundtripCrop, animations: "disabled" });
  const roundtripManifest = await captureScenarioReview({
    page, scenario: "RIBBON-ROUNDTRIP", gitHead, viewport: [1365, 800],
    rules: [{ selector: "[data-testid='ribbon']", target: "Ribbon" }],
    actions: ["switch:Insert", "switch:View", "switch:Check", "switch:AI", "switch:Home", "switch:View", "switch:Home"],
    images: { current: roundtripImage }, crops: [roundtripCrop], expectedChange: [], stableRegions: ["Ribbon"], outputPath: resolve(output, "roundtrip.json"),
  });
  for (const manifest of [compressedManifest, roundtripManifest]) {
    expect(manifest.testedCommit).toBe(gitHead);
    expect(manifest.crops).toHaveLength(1);
    expect(manifest.diagnostics.findings.filter((finding) => ["CONSOLE_ERROR", "PAGE_ERROR", "RESOURCE_FAILURE"].includes(finding.category))).toEqual([]);
  }
});
