import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
import { readFile } from "node:fs/promises";
import { documentState, expectViewOnly } from "./view-only.js";

startInCycleSample(test);

async function showLegend(page: import("@playwright/test").Page) {
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Legend show").check();
  await properties.getByLabel("Legend position X").fill("200");
  await properties.getByLabel("Legend position Y").fill("140");
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();
  return { surface, legend: page.getByTestId("editor-legend") };
}

test("Legend Escape and pointer cancellation restore the committed position without a mutation", async ({ page }) => {
  const { surface, legend } = await showLegend(page);
  const original = { x: await legend.getAttribute("data-legend-position-x"), y: await legend.getAttribute("data-legend-position-y") };
  const viewOnlyBefore = await documentState(page);
  const box = (await legend.boundingBox())!;

  await page.mouse.move(box.x + 16, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 48, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(legend).toHaveAttribute("data-legend-position-x", original.x!);
  await expect(legend).toHaveAttribute("data-legend-position-y", original.y!);
  await expectViewOnly(page, viewOnlyBefore);

  const resetBox = (await legend.boundingBox())!;
  await page.mouse.move(resetBox.x + 16, resetBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(resetBox.x + 80, resetBox.y + 55, { steps: 3 });
  await legend.dispatchEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" });
  await page.mouse.up();
  await expect(legend).toHaveAttribute("data-legend-position-x", original.x!);
  await expect(legend).toHaveAttribute("data-legend-position-y", original.y!);
  await expectViewOnly(page, viewOnlyBefore);
});

test("external Legend drag does not erase dirty Inspector fields or apply stale position", async ({ page }) => {
  const { legend } = await showLegend(page);
  await legend.click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toHaveAttribute("data-inspector-entity", "legend");
  await page.getByLabel("Legend orientation").selectOption("vertical");
  await page.getByLabel("Legend X").fill("300");

  const box = (await legend.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + 35, { steps: 3 });
  await page.mouse.up();

  await expect(page.getByLabel("Legend orientation")).toHaveValue("vertical");
  await expect(page.getByLabel("Legend X")).toHaveValue("300");
  await expect(inspector.getByTestId("legend-draft-conflict")).toBeVisible();
  await expect(page.getByTestId("apply-legend-properties")).toBeDisabled();
  await inspector.getByRole("button", { name: "Keep my draft" }).click();
  await page.getByTestId("apply-legend-properties").click();
  await expect(legend).toHaveAttribute("data-legend-position-x", "300");
  await expect(legend).toHaveClass(/vertical/);
});

test("Legend selection is announced without implying a toggle state", async ({ page }) => {
  const { legend } = await showLegend(page);
  await expect(legend).toHaveAttribute("aria-label", "Legend");
  await expect(legend).not.toHaveAttribute("aria-pressed");

  await legend.click();

  await expect(legend).toHaveAttribute("data-selected", "true");
  await expect(legend).toHaveAttribute("aria-label", "Legend, selected");
  await expect(legend).not.toHaveAttribute("aria-pressed");
});

test("Legend pointerup is one undo unit and Save/Open/export use the committed position", async ({ page }) => {
  const { surface, legend } = await showLegend(page);
  const original = {
    x: Number(await legend.getAttribute("data-legend-position-x")),
    y: Number(await legend.getAttribute("data-legend-position-y")),
  };
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  const box = (await legend.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + 35, { steps: 3 });
  await page.mouse.up();
  const committed = {
    x: Number(await legend.getAttribute("data-legend-position-x")),
    y: Number(await legend.getAttribute("data-legend-position-y")),
  };
  expect(committed).toEqual({ x: original.x + 35, y: original.y + 20 });
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(surface).toHaveAttribute("data-canonical-revision", "2");

  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(legend).toHaveAttribute("data-legend-position-x", String(original.x));
  await expect(legend).toHaveAttribute("data-legend-position-y", String(original.y));
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(legend).toHaveAttribute("data-legend-position-x", String(committed.x));
  await expect(legend).toHaveAttribute("data-legend-position-y", String(committed.y));
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  const reopenedLegend = page.getByTestId("editor-legend");
  await expect(reopenedLegend).toHaveAttribute("data-legend-position-x", String(committed.x));
  await expect(reopenedLegend).toHaveAttribute("data-legend-position-y", String(committed.y));
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pendingExport = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export SVG" }).click();
  const svg = await readFile((await (await pendingExport).path())!);
  expect(svg.toString("utf8")).toContain(`data-layer="legend" data-orientation="horizontal" transform="translate(${committed.x} ${committed.y})"`);
});
