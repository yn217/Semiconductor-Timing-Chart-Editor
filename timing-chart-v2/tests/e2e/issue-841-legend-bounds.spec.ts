import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startInCycleSample } from "./cycle-startup.js";
import { hoverTimelineArea, timelineOwner } from "./timeline-scroll.js";
import { documentState, expectViewOnly } from "./view-only.js";

startInCycleSample(test);

async function expectLegendInVisibleArea(page: Page, legend: Locator) {
  const metrics = await page.evaluate(() => {
    const legendElement = document.querySelector<HTMLElement>(".editor-legend")!;
    const content = legendElement.parentElement!;
    const viewport = content.closest<HTMLElement>(".cycle-viewport")!;
    const ruler = content.querySelector<HTMLElement>(".cycle-ruler")!;
    const rail = document.querySelector<HTMLElement>(".left-workspace-rail")!;
    const panel = viewport.closest<HTMLElement>(".cycle-panel")!;
    const scrollbar = panel.querySelector<HTMLElement>(":scope > .timeline-hscroll");
    const scrollbarTop = scrollbar && !scrollbar.hidden ? scrollbar.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
    const bottomTrack = document.querySelector<HTMLElement>(".bottom-resize-track");
    const bottomTrackBox = bottomTrack?.getBoundingClientRect();
    const bottomTrackTop = bottomTrack && bottomTrackBox && bottomTrackBox.width > 0 && bottomTrackBox.height > 0 ? bottomTrackBox.top : Number.POSITIVE_INFINITY;
    const box = legendElement.getBoundingClientRect();
    const viewportBox = viewport.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const rulerBox = ruler.getBoundingClientRect();
    return {
      legend: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      canonical: { x: legendElement.dataset.legendPositionX, y: legendElement.dataset.legendPositionY, left: legendElement.style.left, top: legendElement.style.top },
      geometry: { viewportTop: viewportBox.top, viewportBottom: viewportBox.bottom, contentTop: contentBox.top, contentBottom: contentBox.bottom, rulerTop: rulerBox.top, scrollTop: viewport.scrollTop, scrollbarTop, bottomTrackTop },
      minimumLeft: Math.max(viewportBox.left, rail.getBoundingClientRect().right),
      maximumRight: viewportBox.right,
      minimumTop: ruler.getBoundingClientRect().top,
      maximumBottom: Math.min(viewportBox.bottom, contentBox.bottom, scrollbarTop, bottomTrackTop),
    };
  });
  expect(metrics.legend.left, JSON.stringify(metrics)).toBeGreaterThanOrEqual(metrics.minimumLeft - 1);
  expect(metrics.legend.right, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.maximumRight + 1);
  expect(metrics.legend.top, JSON.stringify(metrics)).toBeGreaterThanOrEqual(metrics.minimumTop - 1);
  expect(metrics.legend.bottom, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.maximumBottom + 1);
  await expect(legend).toHaveAttribute("data-legend-position-x", /\d+/);
  await expect(legend).toHaveAttribute("data-legend-position-y", /\d+/);
}

async function exerciseLegendBounds(page: Page) {
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const cycleViewport = page.getByTestId("cycle-viewport");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Legend show").check();
  await properties.getByLabel("Legend position X").fill("500");
  await properties.getByLabel("Legend position Y").fill("80");
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();

  const legend = page.getByTestId("editor-legend");
  await expect(legend).toBeVisible();
  const before = (await legend.boundingBox())!;
  const viewport = (await cycleViewport.boundingBox())!;
  const rail = (await page.getByTestId("left-workspace-rail").boundingBox())!;
  expect(before.x).toBeGreaterThanOrEqual(rail.x + rail.width - 1);
  expect(before.y).toBeGreaterThanOrEqual(viewport.y);

  await page.mouse.move(before.x + Math.min(12, before.width / 2), before.y + Math.min(10, before.height / 2));
  await page.mouse.down();
  await page.mouse.move(viewport.x + viewport.width - 2, viewport.y + viewport.height - 2, { steps: 5 });
  await page.mouse.up();
  await expectLegendInVisibleArea(page, legend);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await legend.click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-entity", "legend");
  await page.getByLabel("Legend X").fill("100000");
  await page.getByLabel("Legend Y").fill("100000");
  await page.getByTestId("apply-legend-properties").click();
  await expectLegendInVisibleArea(page, legend);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByLabel("Legend X")).toHaveValue(await legend.getAttribute("data-legend-position-x"));
  await expect(page.getByLabel("Legend Y")).toHaveValue(await legend.getAttribute("data-legend-position-y"));

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const propertiesAgain = page.getByRole("dialog", { name: "Document Properties" });
  await propertiesAgain.getByLabel("Legend position X").fill("100000");
  await propertiesAgain.getByLabel("Legend position Y").fill("100000");
  await propertiesAgain.getByTestId("apply-document-properties").click();
  await expect(propertiesAgain.getByLabel("Legend position X")).toHaveValue(await legend.getAttribute("data-legend-position-x"));
  await expect(propertiesAgain.getByLabel("Legend position Y")).toHaveValue(await legend.getAttribute("data-legend-position-y"));
  await propertiesAgain.getByRole("button", { name: "Close properties" }).click();
  await expectLegendInVisibleArea(page, legend);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("drag and Inspector positioning keep the Legend inside its document surface", async ({ page }) => {
      await exerciseLegendBounds(page);
    });
  });
}

test.describe("Legend projection across modes", () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test("Cycle and Combined retain the bounded Legend; Transaction explicitly hides it without mutation", async ({ page }) => {
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
    const properties = page.getByRole("dialog", { name: "Document Properties" });
    await properties.getByLabel("Legend show").check();
    await properties.getByLabel("Legend position X").fill("500");
    await properties.getByLabel("Legend position Y").fill("80");
    await properties.getByTestId("apply-document-properties").click();
    await properties.getByRole("button", { name: "Close properties" }).click();

    const legend = page.getByTestId("editor-legend");
    await expect(legend).toBeVisible();
    await legend.click();
    await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-entity", "legend");
    const canonicalX = await page.getByLabel("Legend X").inputValue();
    const canonicalY = await page.getByLabel("Legend Y").inputValue();
    const viewOnlyBefore = await documentState(page);

    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption("200");
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
    await expectLegendInVisibleArea(page, legend);

    const modes = page.locator(".view-mode");
    await modes.getByRole("button", { name: "Combined", exact: true }).click();
    await expect(legend).toBeVisible();
    await expectLegendInVisibleArea(page, legend);
    await expect(page.getByLabel("Legend X")).toHaveValue(canonicalX);
    await expect(page.getByLabel("Legend Y")).toHaveValue(canonicalY);

    await modes.getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(legend).not.toBeVisible();
    await modes.getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(legend).toBeVisible();
    await expectLegendInVisibleArea(page, legend);
    await expect(page.getByLabel("Legend X")).toHaveValue(canonicalX);
    await expect(page.getByLabel("Legend Y")).toHaveValue(canonicalY);
    await expectViewOnly(page, viewOnlyBefore);
  });
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test.describe(`Legend scroll ownership at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("horizontal scroll keeps the document position canonical and the visible Legend reachable", async ({ page }) => {
      await page.goto("/");
      const surface = page.getByTestId("cycle-surface");
      await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
      await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
      await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
      const properties = page.getByRole("dialog", { name: "Document Properties" });
      await properties.getByLabel("Legend show").check();
      await properties.getByLabel("Legend position X").fill("500");
      await properties.getByLabel("Legend position Y").fill("80");
      await properties.getByTestId("apply-document-properties").click();
      await properties.getByRole("button", { name: "Close properties" }).click();

      const legend = page.getByTestId("editor-legend");
      await legend.click();
      const inspectorX = page.getByLabel("Legend X");
      const inspectorY = page.getByLabel("Legend Y");
      await expect(inspectorX).toHaveValue("500");
      await expect(inspectorY).toHaveValue("80");
      const viewOnlyBefore = await documentState(page);

      await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
      await page.getByLabel("Zoom preset").selectOption("800");
      await expect(surface).toHaveAttribute("data-editor-idle", "true");
      const viewportElement = timelineOwner(page);
      const viewportMetrics = await viewportElement.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
      }));
      expect(viewportMetrics.scrollWidth).toBeGreaterThan(viewportMetrics.clientWidth);

      await hoverTimelineArea(page);
      for (let step = 0; step < 4; step += 1) {
        const before = await viewportElement.evaluate((element) => element.scrollLeft);
        await page.mouse.wheel(240, 0);
        await expect.poll(() => viewportElement.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
      }
      await expect.poll(() => viewportElement.evaluate((element) => element.scrollLeft)).toBeGreaterThan(500);
      await expect(surface).toHaveAttribute("data-editor-idle", "true");
      await expectLegendInVisibleArea(page, legend);
      await expect(inspectorX).toHaveValue("500");
      await expect(inspectorY).toHaveValue("80");

      await page.mouse.wheel(-4000, 0);
      await expect.poll(() => viewportElement.evaluate((element) => element.scrollLeft)).toBe(0);
      await expect(surface).toHaveAttribute("data-editor-idle", "true");
      await expectLegendInVisibleArea(page, legend);
      await expect(inspectorX).toHaveValue("500");
      await expect(inspectorY).toHaveValue("80");
      await expectViewOnly(page, viewOnlyBefore);

      const ribbon = page.getByTestId("ribbon");
      await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
      const pendingSave = page.waitForEvent("download");
      await ribbon.getByRole("button", { name: "Save", exact: true }).click();
      const savedPath = await (await pendingSave).path();
      expect(savedPath).toBeTruthy();
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
      await expect(surface).toHaveAttribute("data-editor-idle", "true");

      const reopenedLegend = page.getByTestId("editor-legend");
      await expect(reopenedLegend).toBeVisible();
      await expect(reopenedLegend).toHaveAttribute("data-legend-position-x", "500");
      await expect(reopenedLegend).toHaveAttribute("data-legend-position-y", "80");
      await expectLegendInVisibleArea(page, reopenedLegend);

      await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
      await ribbon.getByRole("button", { name: "Export", exact: true }).click();
      const exportDialog = page.getByRole("dialog", { name: "Export Timing Chart" });
      const pendingExport = page.waitForEvent("download");
      await exportDialog.getByRole("button", { name: "Export SVG" }).click();
      const svg = await readFile((await (await pendingExport).path())!);
      expect(svg.toString("utf8")).toContain('data-layer="legend" data-orientation="horizontal" transform="translate(500 80)"');
    });
  });
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test.describe(`Large Feature Showcase Legend ownership at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("keeps the visible Legend reachable through real vertical/horizontal scroll, mode changes, Save/Open, and export", async ({ page }) => {
      // The 48-signal fixture's SVG export is intentionally part of this acceptance path.
      test.setTimeout(60_000);
      await page.goto("/");
      const surface = page.getByTestId("cycle-surface");
      await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");

      const fixture = await readFile(new URL("../../samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json", import.meta.url));
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
        name: "21_large_feature_showcase.tcd.json",
        mimeType: "application/json",
        buffer: fixture,
      });
      await expect(page.getByRole("heading", { name: "Large Feature Showcase — 128 cycles / 48 signals" })).toBeVisible();
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "48");

      const legend = page.getByTestId("editor-legend");
      await expect(legend).toBeVisible();
      await legend.click();
      const inspectorX = page.getByLabel("Legend X");
      const inspectorY = page.getByLabel("Legend Y");
      await expect(inspectorX).toHaveValue("18");
      await expect(inspectorY).toHaveValue("18");

      const viewOnlyBefore = await documentState(page);
      const cycleViewport = page.getByTestId("cycle-viewport");
      expect(await cycleViewport.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
        await cycleViewport.evaluate((element) => element.clientHeight),
      );
      await hoverTimelineArea(page);
      await page.mouse.wheel(0, 500);
      await expect.poll(() => cycleViewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expectLegendInVisibleArea(page, legend);
      await expect(inspectorX).toHaveValue("18");
      await expect(inspectorY).toHaveValue("18");

      await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
      await page.getByLabel("Zoom preset").selectOption("200");
      await expect(surface).toHaveAttribute("data-editor-idle", "true");
      const owner = timelineOwner(page);
      const overflow = await owner.evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(overflow).toBe(true);
      await hoverTimelineArea(page);
      await page.mouse.wheel(360, 0);
      await expect.poll(() => owner.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expectLegendInVisibleArea(page, legend);
      await expect(inspectorX).toHaveValue("18");
      await expect(inspectorY).toHaveValue("18");

      const modes = page.locator(".view-mode");
      await modes.getByRole("button", { name: "Combined", exact: true }).click();
      await expect(legend).toBeVisible();
      await expectLegendInVisibleArea(page, legend);
      await modes.getByRole("button", { name: "Transaction", exact: true }).click();
      await expect(legend).not.toBeVisible();
      await modes.getByRole("button", { name: "Cycle", exact: true }).click();
      await expect(legend).toBeVisible();
      await expectLegendInVisibleArea(page, legend);
      await expect(inspectorX).toHaveValue("18");
      await expect(inspectorY).toHaveValue("18");
      await expectViewOnly(page, viewOnlyBefore);

      const ribbon = page.getByTestId("ribbon");
      await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
      const pendingSave = page.waitForEvent("download");
      await ribbon.getByRole("button", { name: "Save", exact: true }).click();
      const savedPath = await (await pendingSave).path();
      expect(savedPath).toBeTruthy();
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
      await expect(page.getByRole("heading", { name: "Large Feature Showcase — 128 cycles / 48 signals" })).toBeVisible();
      const reopenedLegend = page.getByTestId("editor-legend");
      await expect(reopenedLegend).toBeVisible();
      await expect(reopenedLegend).toHaveAttribute("data-legend-position-x", "18");
      await expect(reopenedLegend).toHaveAttribute("data-legend-position-y", "18");
      await expectLegendInVisibleArea(page, reopenedLegend);

      await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
      await ribbon.getByRole("button", { name: "Export", exact: true }).click();
      const exportDialog = page.getByRole("dialog", { name: "Export Timing Chart" });
      const pendingExport = page.waitForEvent("download");
      await exportDialog.getByRole("button", { name: "Export SVG" }).click();
      const svg = await readFile((await (await pendingExport).path())!);
      expect(svg.toString("utf8")).toContain('data-layer="legend" data-orientation="vertical" transform="translate(18 18)"');
    });
  });
}
