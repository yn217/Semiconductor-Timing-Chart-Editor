import { expect, test } from "@playwright/test";

test("Annotation bottom editor lists stable annotation IDs without mutating document state", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  const annotationTools = page.getByTestId("annotation-toolbar");
  await annotationTools.getByRole("button", { name: "Add annotation" }).click();
  await annotationTools.getByRole("button", { name: "Add annotation" }).click();

  const list = page.getByTestId("annotation-list");
  await expect(list.locator("[data-annotation-list-id]")).toHaveCount(18);
  for (const id of ["demo_ann_request", "demo_ann_data", "demo_ann_response", "demo_ann_measurement", "demo_ann_region", "demo_ann_ghost"]) {
    await expect(list.locator(`[data-annotation-list-id="${id}"]`)).toBeVisible();
  }
  await expect(list.locator(".annotation-list-header")).toContainText("Start");
  await expect(list.locator(".annotation-list-header")).toContainText("End");
  await expect(list.locator(".annotation-list-header")).toContainText("Label / Text");
  await expect(page.getByRole("toolbar", { name: "Annotation operations" })).toBeVisible();
  await expect(page.getByTestId("annotation-preview-status")).toHaveText("Preview ready");
  await page.getByTestId("annotation-preview-action").click();
  await expect(page.getByTestId("annotation-preview-status")).toHaveText("Previewing draft (updated 1) · canonical data unchanged");
  const ids = await list.locator("[data-annotation-list-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-list-id")));
  expect(ids).toEqual(ids.filter((id): id is string => id !== null));
  expect(new Set(ids).size).toBe(18);
  const visibility = list.locator("[data-annotation-list-id]").first().locator("[data-testid^='annotation-list-visibility-']");
  await expect(visibility).toHaveAttribute("aria-pressed", "true");
  const visibilityRevision = await host.getAttribute("data-canonical-revision");
  await visibility.click();
  await expect(visibility).toHaveAttribute("aria-pressed", "false");
  await expect(host).not.toHaveAttribute("data-canonical-revision", visibilityRevision!);

  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const counters = await surface.getAttribute("data-render-counters");
  await list.locator("[data-annotation-list-id]").first().click();
  await expect(list.locator("[data-annotation-list-id]").first()).toHaveAttribute("data-selected", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
  await expect(surface).toHaveAttribute("data-render-counters", counters!);
  const importedId = "annotation_imported";
  await page.getByLabel("Import annotations").setInputFiles({ name: "annotations.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ id: importedId, type: "text", label: "Imported", visible: true, anchor: { signalId: "sig_cycle_request", cycle: 2, point: "cycle-start" } }])) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
  await expect(page.getByTestId("annotation-list").locator(`[data-annotation-list-id="${importedId}"]`)).toHaveAttribute("data-selected", "true");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("annotation-list").locator(`[data-annotation-list-id="${importedId}"]`)).toContainText("Imported");
});
