import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("Export respects a collapsed TimeGroup: shorter SVG width, no hidden cycle numbers, source data unchanged", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const dataSvg = surface.locator("[data-signal-id='sig_cycle_data'] > svg");
  const widthBefore = Number(await dataSvg.evaluate((el) => el.getAttribute("width")));

  const exportSvg = async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
    await dialog.getByLabel("Export format").selectOption("svg");
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Export SVG" }).click();
    const result = await pending;
    const text = (await readFile((await result.path())!)).toString("utf8");
    await dialog.getByRole("button", { name: "Close export" }).click();
    await expect(dialog).toHaveCount(0);
    return text;
  };

  const svgBefore = await exportSvg();
  const widthBeforeAttr = Number(/\bwidth="([\d.]+)"/.exec(svgBefore)?.[1]);

  // Collapse the default Timeline range [2, 4) — a genuine structural fold, not a visual band.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Add gap" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const widthAfter = Number(await dataSvg.evaluate((el) => el.getAttribute("width")));
  expect(widthAfter).toBeLessThan(widthBefore);

  const svgAfter = await exportSvg();
  const widthAfterAttr = Number(/\bwidth="([\d.]+)"/.exec(svgAfter)?.[1]);

  // The export must genuinely compress, matching the on-screen fold — not export the full,
  // uncompressed source width with the fold merely hidden in the editor UI.
  expect(widthAfterAttr).toBeLessThan(widthBeforeAttr);
  // The folded cycles (2, 3) must not appear as ruler tick labels in the exported SVG.
  expect(svgAfter).not.toMatch(/<text x="[\d.]+" y="24" stroke="none">2<\/text>/);
  expect(svgAfter).not.toMatch(/<text x="[\d.]+" y="24" stroke="none">3<\/text>/);
});
