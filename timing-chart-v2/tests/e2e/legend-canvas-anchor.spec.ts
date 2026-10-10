import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Legend Canvas-corner anchor survives resize, Save/Open, and SVG export", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Legend show").check();
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();

  const legend = page.getByTestId("editor-legend");
  await legend.click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Legend position mode").selectOption("canvas-corner");
  await inspector.getByLabel("Legend canvas corner").selectOption("top-right");
  await inspector.getByLabel("Legend X").fill("12");
  await inspector.getByLabel("Legend Y").fill("18");
  await page.getByTestId("apply-legend-properties").click();
  await expect(legend).toHaveAttribute("data-legend-position-x", "12");
  const beforeResize = Number(await legend.getAttribute("data-legend-render-x"));
  await page.setViewportSize({ width: 1672, height: 941 });
  await expect.poll(async () => Number(await legend.getAttribute("data-legend-render-x"))).toBeGreaterThan(beforeResize);

  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await page.getByTestId("editor-legend").click(); // Open clears the selection; re-select the Legend to inspect it
  await expect(page.getByTestId("inspector").getByLabel("Legend position mode")).toHaveValue("canvas-corner");
  await expect(page.getByTestId("inspector").getByLabel("Legend canvas corner")).toHaveValue("top-right");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await exportDialog.getByLabel("Export format").selectOption("svg");
  const exportDownload = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const exportedPath = await (await exportDownload).path();
  expect(exportedPath).toBeTruthy();
  const { readFileSync } = await import("node:fs");
  const svg = readFileSync(exportedPath!, "utf8");
  expect(svg).toMatch(/data-layer="legend"[^>]*transform="translate\((?!12 18)[^)]+\)"/);
});
