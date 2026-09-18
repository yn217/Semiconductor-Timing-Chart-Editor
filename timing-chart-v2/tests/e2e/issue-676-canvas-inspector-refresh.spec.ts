import { expect, test } from "@playwright/test";
import { join } from "node:path";

const viewports = [
  { width: 1672, height: 941 },
  { width: 1280, height: 720 },
];

for (const viewport of viewports) test(`canvas Annotation drag keeps Inspector/list synchronized through Undo/Redo and Save/Open at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Annotation", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("callout");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  const list = page.getByTestId("annotation-list");
  const selectedRow = list.locator("[data-annotation-list-id][data-selected='true']");
  await expect(selectedRow).toHaveCount(1);
  const annotationId = await selectedRow.getAttribute("data-annotation-list-id");
  expect(annotationId).toBeTruthy();
  const owner = host.locator(`[data-role='annotation-owner'][data-annotation-id="${annotationId}"]`);
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='anchor']");
  await expect(owner).toBeVisible();
  await expect(handle).toBeVisible();

  const inspector = page.getByTestId("inspector");
  const offsetField = inspector.getByLabel("Inspector annotation anchor X");
  const beforeOffset = await offsetField.inputValue();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const afterBox = (await handle.boundingBox())!;
  expect(afterBox.x - box.x, JSON.stringify({ afterBox, box, annotationId })).toBeGreaterThan(20);
  await expect(offsetField).not.toHaveValue(beforeOffset);
  const movedOffset = await offsetField.inputValue();
  await expect(selectedRow).toHaveAttribute("data-annotation-list-id", annotationId!);
  await expect(selectedRow).toHaveAttribute("data-selected", "true");
  await expect(owner).toHaveAttribute("data-annotation-id", annotationId!);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(offsetField).toHaveValue(beforeOffset);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(offsetField).toHaveValue(movedOffset);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  const rowIds = await list.locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")).filter((id): id is string => Boolean(id)));
  const otherId = rowIds.find((id) => id !== annotationId);
  expect(otherId).toBeTruthy();
  await list.locator(`[data-annotation-list-id="${otherId}"]`).click();
  await expect(list.locator(`[data-annotation-list-id="${otherId}"]`)).toHaveAttribute("data-selected", "true");
  await list.locator(`[data-annotation-list-id="${annotationId}"]`).click();
  await expect(offsetField).toHaveValue(movedOffset);
  await expect(selectedRow).toHaveAttribute("data-selected", "true");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await save;
  const savedPath = testInfo.outputPath(`annotation-anchor-${viewport.width}.tcd`);
  await download.saveAs(savedPath);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath);
  const reopenedRow = list.locator(`[data-annotation-list-id="${annotationId}"]`);
  await expect(reopenedRow).toHaveCount(1);
  await reopenedRow.click();
  await expect(offsetField).toHaveValue(movedOffset);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  expect(runtimeErrors).toEqual([]);
});
