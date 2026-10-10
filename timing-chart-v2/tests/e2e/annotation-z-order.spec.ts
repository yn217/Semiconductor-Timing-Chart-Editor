import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
import { annotationOwnerById, snapshotAnnotationIds, waitForCreatedAnnotationId } from "./annotation-identity.js";

startInCycleSample(test);

async function addRangeAnnotation(page: import("@playwright/test").Page, host: import("@playwright/test").Locator): Promise<string> {
  await page.getByLabel("Annotation type").selectOption("range");
  const previous = await snapshotAnnotationIds(host);
  await page.getByRole("button", { name: "Add annotation" }).click();
  return waitForCreatedAnnotationId(host, previous, "range");
}

async function annotationDomOrder(host: import("@playwright/test").Locator, ids: readonly string[]): Promise<number[]> {
  return host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((owners, targetIds) => {
    const order = owners.map((owner) => owner.getAttribute("data-annotation-id"));
    return targetIds.map((id) => order.indexOf(id));
  }, [...ids]);
}

test("Annotation Front/Back z-order is one undoable semantic order and survives Save/Open/export", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const backId = await addRangeAnnotation(page, host);
  const frontId = await addRangeAnnotation(page, host);
  const initialOrder = await annotationDomOrder(host, [backId, frontId]);
  expect(initialOrder[0]).toBeLessThan(initialOrder[1]);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  await page.getByTestId("annotation-list").locator(`[data-annotation-list-id="${backId}"]`).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  const frontOrder = await annotationDomOrder(host, [backId, frontId]);
  expect(frontOrder[0]).toBeGreaterThan(frontOrder[1]);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  expect(await annotationDomOrder(host, [backId, frontId])).toEqual(initialOrder);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  expect(await annotationDomOrder(host, [backId, frontId])).toEqual(frontOrder);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  expect(await annotationDomOrder(host, [backId, frontId])).toEqual(initialOrder);
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  expect(await annotationDomOrder(host, [backId, frontId])).toEqual(frontOrder);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 1");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savePath = await (await save).path();
  expect(savePath).toBeTruthy();
  const fs = await import("node:fs");
  const saved = JSON.parse(fs.readFileSync(savePath!, "utf8")) as { annotations: Array<{ id: string }> };
  const savedOrder = saved.annotations.map((annotation) => annotation.id);
  expect(savedOrder.indexOf(backId)).toBeGreaterThan(savedOrder.indexOf(frontId));

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savePath!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  expect(await annotationDomOrder(host, [backId, frontId])).toEqual(frontOrder);
  await expect(annotationOwnerById(host, backId)).toHaveAttribute("data-annotation-id", backId);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const exportDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const exportPath = await (await exportDownload).path();
  expect(exportPath).toBeTruthy();
  const svg = fs.readFileSync(exportPath!, "utf8");
  expect(svg.indexOf(`data-annotation-id="${backId}"`)).toBeGreaterThan(svg.indexOf(`data-annotation-id="${frontId}"`));
});
