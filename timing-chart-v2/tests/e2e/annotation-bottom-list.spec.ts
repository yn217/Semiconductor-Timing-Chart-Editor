import { expect, test } from "@playwright/test";

test("Annotation Bottom keeps a stable collection while selection, import, and Save/Open remain canonical", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();

  const list = page.getByTestId("annotation-list");
  await expect(list).toHaveAttribute("aria-rowcount", "17");
  await expect(page.getByTestId("create-annotation-preset")).toBeVisible();
  await expect(page.getByTestId("annotation-editor")).toHaveCount(0);
  await expect(list.locator(".annotation-list-header")).toContainText("Start");
  await expect(list.locator(".annotation-list-header")).toContainText("End");
  await expect(list.locator(".annotation-list-header")).toContainText("Label / Text");
  await expect(page.getByRole("toolbar", { name: "Annotation collection actions" })).toBeVisible();
  const ids = await list.locator("[data-annotation-list-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-list-id")));
  expect(ids).toEqual(ids.filter((id): id is string => id !== null));
  expect(new Set(ids).size).toBe(ids.length);
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
  const selectedRow = list.locator("[data-annotation-list-id]").nth(1);
  await selectedRow.click();
  await expect(selectedRow).toHaveAttribute("data-selected", "true");
  await expect(page.getByRole("textbox", { name: "Inspector annotation label" })).toBeVisible();
  await expect(page.getByTestId("annotation-editor")).toHaveCount(0);
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
  await expect(surface).toHaveAttribute("data-render-counters", counters!);
  const importedId = "annotation_imported";
  await page.getByLabel("Import annotations").setInputFiles({ name: "annotations.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ id: importedId, type: "text", label: "Imported", visible: true, anchor: { signalId: "sig_cycle_request", cycle: 2, point: "cycle-start" } }])) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
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
