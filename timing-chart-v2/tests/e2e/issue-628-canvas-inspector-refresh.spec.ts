import { expect, test } from "@playwright/test";

test("canvas Annotation handle drag refreshes Inspector and Bottom list for the same stable ID", async ({ page }) => {
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
  await expect(selectedRow).toHaveAttribute("data-annotation-list-id", annotationId!);
  await expect(selectedRow).toHaveAttribute("data-selected", "true");
  await expect(owner).toHaveAttribute("data-annotation-id", annotationId!);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});
