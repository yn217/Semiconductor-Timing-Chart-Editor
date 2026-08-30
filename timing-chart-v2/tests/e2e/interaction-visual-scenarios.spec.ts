import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { captureScenarioReview } from "../../harness/gui/ai-review-bundle.mjs";
import { reversiblePixelRegionReport } from "../../harness/gui/mechanical-diagnostics.mjs";
import { PNG } from "pngjs";

test("captures Signal visibility before/after/undo/redo visual bundles", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("signal-visibility");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const row = host.locator("[data-role='left-row'][data-row-id='sig_cycle_ready']");
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `SIGNAL-VISIBILITY-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-role='left-row'][data-row-id='sig_cycle_ready']", target: "left-row:sig_cycle_ready" }, { selector: "[data-role='frozen-row'][data-row-id='sig_cycle_ready']", target: "timing-row:sig_cycle_ready" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["left-row:sig_cycle_ready", "timing-row:sig_cycle_ready"], stableRegions: ["ribbon", "ruler", "inspector-shell"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("before");
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  await row.locator("[data-role='tree-visibility']").click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(0);
  const after = await capture("after-hide");
  expect(after.diagnostics.findings.filter((finding) => ["CONSOLE_ERROR", "PAGE_ERROR", "RESOURCE_FAILURE"].includes(finding.category))).toEqual([]);
  expect(await host.getAttribute("data-canonical-revision")).toBe(String(Number(revisionBefore) + 1));
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(1);
  await capture("after-undo");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(0);
  await capture("after-redo");
});

test("proves Signal visibility PNG reversibility by region", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = PNG.sync.read(await page.screenshot({ animations: "disabled" }));
  await host.locator("[data-role='left-row'][data-row-id='sig_cycle_ready'] [data-role='tree-visibility']").click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(0);
  const after = PNG.sync.read(await page.screenshot({ animations: "disabled" }));
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  const undo = PNG.sync.read(await page.screenshot({ animations: "disabled" }));
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  const redo = PNG.sync.read(await page.screenshot({ animations: "disabled" }));
  const report = reversiblePixelRegionReport({ before: before.data, after: after.data, undo: undo.data, redo: redo.data, width: before.width, regions: { full: { x: 0, y: 0, width: before.width, height: before.height } }, maxDelta: 0.01 });
  expect(report.pass).toBe(true);
});

test("captures Annotation add/undo/redo visual bundles", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("annotation-lifecycle");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `ANNOTATION-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-role='annotation-owner']", target: "annotation-owner" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["annotation-owner"], stableRegions: ["ribbon", "ruler"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("before");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host.locator("[data-role='annotation-owner']")).toHaveCount(1);
  await capture("after-add");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host.locator("[data-role='annotation-owner']")).toHaveCount(0);
  await capture("after-undo");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host.locator("[data-role='annotation-owner']")).toHaveCount(1);
  await capture("after-redo");
});

test("captures Group collapse/expand visual bundles without canonical mutation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("group-collapse");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const group = host.locator("[data-role='left-group-header']").first();
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `GROUP-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-role='left-group-header']", target: "group:first" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["group:first"], stableRegions: ["ribbon", "ruler"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("expanded");
  await group.locator("[data-role='tree-collapse']").click();
  await expect(group.locator("[data-role='tree-collapse']")).toHaveAttribute("aria-expanded", "false");
  await capture("collapsed");
  await group.locator("[data-role='tree-collapse']").click();
  await expect(group.locator("[data-role='tree-collapse']")).toHaveAttribute("aria-expanded", "true");
  await capture("restored");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
});

test("captures Signal selection visual state without semantic mutation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("signal-selection");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const beforeCounters = await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters");
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `SIGNAL-SELECTION-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-role='frozen-row'][data-row-id='sig_cycle_request']", target: "frozen-row:sig_cycle_request" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["frozen-row:sig_cycle_request"], stableRegions: ["ribbon", "ruler"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("before");
  await row.click();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await capture("selected");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
  expect(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters")).toBe(beforeCounters);
});

test("captures Zoom/Fit visual round-trip without semantic mutation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("zoom-fit");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `ZOOM-FIT-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-testid='cycle-viewport']", target: "cycle-viewport" }, { selector: "[data-testid='cycle-ruler']", target: "cycle-ruler" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["cycle-viewport", "cycle-ruler"], stableRegions: ["left-tree", "inspector-shell"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("baseline");
  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await ribbon.getByRole("button", { name: "Zoom In", exact: true }).click();
  await capture("zoom-in");
  await ribbon.getByRole("button", { name: "Fit All", exact: true }).click();
  await capture("fit-all");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
});

test("captures left pane resize visual before/after without semantic mutation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("left-pane-resize");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `LEFT-PANE-RESIZE-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-testid='left-pane-resizer']", target: "left-pane-resizer" }, { selector: ".column-headings", target: "column-headings" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["left-pane-resizer", "column-headings"], stableRegions: ["ribbon", "ruler"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("before");
  const resizer = page.getByTestId("left-pane-resizer");
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 70, box!.y + box!.height / 2);
  await page.mouse.up();
  await expect(resizer).not.toHaveAttribute("aria-valuenow", "265");
  await capture("after");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
});

test("captures timeline insert visual reversibility", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("timeline-insert");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const beforeCycles = await page.locator(".editor-shell").getAttribute("data-cycle-count");
  const revision = await host.getAttribute("data-canonical-revision");
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `TIMELINE-INSERT-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-testid='cycle-ruler']", target: "cycle-ruler" }, { selector: "[data-role='timing-row']", target: "timing-rows" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["cycle-ruler", "timing-rows"], stableRegions: ["left-tree", "inspector-shell"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("before");
  await page.getByTestId("ribbon").getByRole("button", { name: "Insert one cycle", exact: true }).click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-cycle-count", String(Number(beforeCycles) + 1));
  await capture("after-insert");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-cycle-count", beforeCycles!);
  await capture("after-undo");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-cycle-count", String(Number(beforeCycles) + 1));
  await capture("after-redo");
  expect(await host.getAttribute("data-canonical-revision")).toBe(String(Number(revision) + 3));
});

test("captures Bottom Editor resize visual state without semantic mutation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("bottom-resize");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `BOTTOM-RESIZE-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-testid='bottom-editor']", target: "bottom-editor" }, { selector: "[data-testid='bottom-resizer']", target: "bottom-resizer" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["bottom-editor", "bottom-resizer"], stableRegions: ["ribbon", "left-tree", "inspector-shell"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("before");
  const resizer = page.getByTestId("bottom-resizer");
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 50);
  await page.mouse.up();
  await capture("after");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
});

test("captures Inspector resize visual state without semantic mutation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("inspector-resize");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `INSPECTOR-RESIZE-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-testid='inspector']", target: "inspector" }, { selector: "[data-testid='inspector-resizer']", target: "inspector-resizer" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["inspector", "inspector-resizer"], stableRegions: ["ribbon", "left-tree", "bottom-editor"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("before");
  const resizer = page.getByTestId("inspector-resizer");
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x - 50, box!.y + box!.height / 2);
  await page.mouse.up();
  await capture("after");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
});
