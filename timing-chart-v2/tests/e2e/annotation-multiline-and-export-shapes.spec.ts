import { expect, test } from "@playwright/test";

// #377: Marker/Callout/Bracket completeness -- three concrete gaps fixed:
//  1. Annotation label could not hold multi-line text at all (a plain
//     <input> cannot contain "\n"), most critically for Callout.
//  2. The live-DOM label span collapsed embedded "\n" (default
//     `white-space: normal`) even once the input could hold it.
//  3. The standalone SVG export pipeline (packages/export/src/index.ts)
//     drew Bracket as a plain zero-cap line and Marker as an invisible
//     zero-length line -- neither matched its own live-DOM glyph.
// These tests assert the fixes at both layers: live DOM and exported SVG.

async function addAnnotation(page: import("@playwright/test").Page, type: string) {
  await page.getByLabel("Annotation type").selectOption(type);
  await page.getByRole("button", { name: "Add annotation" }).click();
  return page.getByTestId("cycle-surface").locator(`[data-role='annotation-owner'][data-annotation-type='${type}']`).last();
}

async function exportSvgText(page: import("@playwright/test").Page): Promise<string> {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  return fs.readFileSync(path!, "utf-8");
}

test("Callout label holds real multi-line text in the live DOM and exported SVG", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const callout = await addAnnotation(page, "callout");
  const editor = page.getByTestId("annotation-editor");
  const labelField = editor.getByLabel("Annotation label", { exact: true });
  await expect(labelField).toHaveJSProperty("tagName", "TEXTAREA");
  await labelField.fill("Line one\nLine two\nLine three");
  await editor.getByTestId("apply-annotation-properties").click();

  const label = callout.locator("[data-role='annotation-label']");
  await expect(label).toHaveCSS("white-space", "pre-wrap");
  await expect(label).toHaveText("Line one\nLine two\nLine three");
  const annotationId = await callout.getAttribute("data-annotation-id");

  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  // #377: a bare SVG <text> ignores embedded "\n" -- one <tspan> per line is
  // the standard SVG multi-line idiom (packages/export/src/index.ts's new
  // `multilineText` helper), so three source lines must yield three <tspan>s.
  expect((groupMatch![0].match(/<tspan/g) ?? []).length).toBe(3);
  expect(groupMatch![0]).toContain("Line one");
  expect(groupMatch![0]).toContain("Line two");
  expect(groupMatch![0]).toContain("Line three");
});

test("Bracket's exported SVG carries its own cap marks, not a plain Range line", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const bracket = await addAnnotation(page, "bracket");
  await expect(bracket.locator("[data-role='annotation-bracket-caps']")).toHaveCount(1);
  const annotationId = await bracket.getAttribute("data-annotation-id");

  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  // #377: matches the live-DOM data-role exactly, giving Bracket a distinct,
  // testable exported shape instead of falling through to the generic
  // point/line fallback (which drew no cap marks at all).
  expect(groupMatch![0]).toContain(`data-role="annotation-bracket-caps"`);
  expect(groupMatch![0]).toMatch(/<path[^>]*data-role="annotation-bracket-caps"[^>]*d="M [^"]+"/);
});

test("Marker's exported SVG carries a vertical tick glyph, not an invisible zero-length line", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const marker = await addAnnotation(page, "marker");
  // Live-DOM glyph: a 3px-wide, 28px-tall vertical tick (center-columns.css).
  await expect(marker.locator("[data-role='annotation-body']")).toHaveCSS("height", "28px");
  const annotationId = await marker.getAttribute("data-annotation-id");

  const svgText = await exportSvgText(page);
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  const tick = groupMatch![0].match(/<line data-role="marker-tick" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/);
  expect(tick).not.toBeNull();
  // Vertical: same x, and a fixed 28px span between y1/y2 -- matching the
  // live-DOM glyph's own height, not a zero-length point.
  expect(tick![1]).toBe(tick![3]);
  expect(Math.abs(Number(tick![4]) - Number(tick![2]))).toBeCloseTo(28, 0);
});
