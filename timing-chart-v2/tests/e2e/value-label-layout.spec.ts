import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("fits long value labels to WaveDrom segments across adjacent values, zoom, and SVG export", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  const editor = json.getByLabel("Advanced JSON");
  const source = JSON.parse(await editor.inputValue()) as { signals: Array<{ id: string; type: string; values?: Array<Record<string, unknown>> }> };
  const bus = source.signals.find((signal) => signal.type === "bus");
  expect(bus).toBeDefined();
  (bus as typeof bus & { width?: number })!.width = 32;
  bus!.values = [
    { start: 0, value: "0xDEADBEEF", displayLabel: "0xDEADBEEF" },
    { start: 1, value: "LONG_SYMBOLIC_STATE", displayLabel: "LONG_SYMBOLIC_STATE" },
    { start: 2, value: "NEXT", displayLabel: "NEXT" },
  ];
  await editor.fill(JSON.stringify(source, null, 2));
  await json.getByTestId("apply-advanced-json").click();
  await expect(json.locator("output")).toHaveText("Applied");

  const dataSvg = surface.locator(`[data-signal-id='${bus!.id}'] > svg`);
  const gridBeforeZoom = await dataSvg.locator("[id^='gmark_']").evaluateAll((lines) => lines.map((line) => line.getAttribute("x1")));
  const labels = dataSvg.locator("[data-value-label-index]");
  await expect(labels).toHaveCount(3);
  const evidence = await labels.evaluateAll((items) => items.map((item) => ({
    mode: item.getAttribute("data-value-label-mode"),
    start: Number(item.getAttribute("data-value-label-segment-start")),
    end: Number(item.getAttribute("data-value-label-segment-end")),
    x: Number(item.getAttribute("x")),
    semantic: item.getAttribute("aria-label"),
    title: item.querySelector("title")?.textContent,
  })));
  expect(evidence[0]).toMatchObject({ mode: "ellipsis", start: 0, end: 40, x: 20, semantic: "0xDEADBEEF", title: "0xDEADBEEF" });
  expect(evidence[1]).toMatchObject({ mode: "ellipsis", start: 40, end: 80, x: 60, semantic: "LONG_SYMBOLIC_STATE", title: "LONG_SYMBOLIC_STATE" });
  expect(evidence[2]).toMatchObject({ mode: "normal", start: 80, end: 960, x: 520, semantic: "NEXT", title: "NEXT" });
  expect(evidence.every((item) => item.end > item.start && item.x >= item.start && item.x <= item.end)).toBe(true);
  expect(gridBeforeZoom).toHaveLength(25);
  expect(gridBeforeZoom.slice(0, 3)).toEqual(["0", "40", "80"]);
  expect(gridBeforeZoom.at(-1)).toBe("960");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In" }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In" }).click();
  await expect(dataSvg.locator("[data-value-label-index='0']")).toHaveAttribute("data-value-label-mode", "ellipsis");
  expect(await dataSvg.locator("[id^='gmark_']").evaluateAll((lines) => lines.map((line) => line.getAttribute("x1")))).toEqual(gridBeforeZoom);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pending = page.waitForEvent("download");
  await dialog.getByLabel("Export format").selectOption("svg");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const download = await pending;
  const svg = (await readFile((await download.path())!)).toString("utf8");
  expect(svg).toContain('data-value-label-mode="ellipsis"');
  expect(svg).toContain('aria-label="0xDEADBEEF"');
  expect(svg).toContain("<title>LONG_SYMBOLIC_STATE</title>");
});
