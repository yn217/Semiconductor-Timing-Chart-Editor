import { expect, test } from "@playwright/test";

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/?visual-reference");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function openBulkRegistration(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("bulk-register-open").click();
  return page.getByRole("dialog", { name: "Bulk Signal Registration" });
}

async function openHierarchy(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("hierarchy-open").click();
  return page.getByRole("dialog", { name: "Hardware Hierarchy" });
}

async function openFileDialog(page: import("@playwright/test").Page, name: "Save As" | "Properties" | "Export") {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name, exact: true }).click();
  return page.getByRole("dialog", { name: name === "Properties" ? "Document Properties" : name === "Export" ? "Export Timing Chart" : "Save As" });
}

test("Escape closes modal dialogs without mutating canonical revision, history, or dirty state", async ({ page }) => {
  await ready(page);
  const before = {
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  const bulk = await openBulkRegistration(page);
  await bulk.getByLabel("Bulk signal definitions").fill("dut.demo.signal binary");
  await bulk.getByLabel("Bulk signal definitions").press("Escape");
  await expect(bulk).toBeHidden();
  const reopenedBulk = await openBulkRegistration(page);
  await expect(reopenedBulk.getByLabel("Bulk signal definitions")).toHaveValue("dut.demo.signal binary");
  await page.keyboard.press("Escape");
  await expect(reopenedBulk).toBeHidden();
  await expect(page.getByRole("button", { name: "Add signal or group" })).toBeFocused();

  const properties = await openFileDialog(page, "Properties");
  const originalTitle = await properties.getByLabel("Document title").inputValue();
  await properties.getByLabel("Document title").fill("Esc draft should cancel");
  await properties.getByLabel("Document title").press("Escape");
  await expect(properties).toBeHidden();
  const reopenedProperties = await openFileDialog(page, "Properties");
  await expect(reopenedProperties.getByLabel("Document title")).toHaveValue(originalTitle);
  await page.keyboard.press("Escape");
  await expect(reopenedProperties).toBeHidden();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true })).toBeFocused();

  const saveAs = await openFileDialog(page, "Save As");
  await saveAs.getByLabel("Save As filename").fill("esc-copy");
  await saveAs.getByLabel("Save As filename").press("Escape");
  await expect(saveAs).toBeHidden();

  const exportDialog = await openFileDialog(page, "Export");
  await exportDialog.getByLabel("Export format").selectOption("pdf");
  await exportDialog.getByLabel("Export format").press("Escape");
  await expect(exportDialog).toBeHidden();

  const hierarchy = await openHierarchy(page);
  await hierarchy.getByTestId("hierarchy-path-view").focus();
  await page.keyboard.press("Escape");
  await expect(hierarchy).toBeHidden();
  await expect(page.getByRole("button", { name: "More tree actions" })).toBeFocused();

  await expect(page.getByTestId("revision-status")).toHaveText(before.revision ?? "");
  await expect(page.getByTestId("history-status")).toHaveText(before.history ?? "");
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty ?? "");
});

test("outside click cancels modal drafts, is consumed, and leaves selection and document state unchanged", async ({ page }) => {
  await ready(page);
  const before = {
    selection: await page.getByTestId("selection-status").textContent(),
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  const properties = await openFileDialog(page, "Properties");
  const originalTitle = await properties.getByLabel("Document title").inputValue();
  await properties.getByLabel("Document title").fill("outside click draft must cancel");
  await properties.getByRole("heading", { name: "Document Properties" }).click();
  await expect(properties).toBeVisible();
  const propertiesBackdrop = page.locator(".modal-backdrop").last();
  const propertiesBounds = await propertiesBackdrop.boundingBox();
  expect(propertiesBounds).not.toBeNull();
  await page.mouse.click(propertiesBounds!.x + 4, propertiesBounds!.y + 4);
  await expect(properties).toBeHidden();
  await expect(page.getByTestId("selection-status")).toHaveText(before.selection ?? "");
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision ?? "");
  await expect(page.getByTestId("history-status")).toHaveText(before.history ?? "");
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty ?? "");

  const reopenedProperties = await openFileDialog(page, "Properties");
  await expect(reopenedProperties.getByLabel("Document title")).toHaveValue(originalTitle);
  await page.keyboard.press("Escape");

  const bulk = await openBulkRegistration(page);
  const bulkBackdrop = page.locator(".modal-backdrop").last();
  const bulkBounds = await bulkBackdrop.boundingBox();
  expect(bulkBounds).not.toBeNull();
  await page.mouse.click(bulkBounds!.x + 4, bulkBounds!.y + 4);
  await expect(bulk).toBeHidden();

  const hierarchy = await openHierarchy(page);
  const hierarchyBackdrop = page.locator(".modal-backdrop").last();
  const hierarchyBounds = await hierarchyBackdrop.boundingBox();
  expect(hierarchyBounds).not.toBeNull();
  await page.mouse.click(hierarchyBounds!.x + 4, hierarchyBounds!.y + 4);
  await expect(hierarchy).toBeHidden();

  const saveAs = await openFileDialog(page, "Save As");
  const saveAsBackdrop = page.locator(".modal-backdrop").last();
  const saveAsBounds = await saveAsBackdrop.boundingBox();
  expect(saveAsBounds).not.toBeNull();
  await page.mouse.click(saveAsBounds!.x + 4, saveAsBounds!.y + 4);
  await expect(saveAs).toBeHidden();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Save As", exact: true })).toBeFocused();
  await expect(page.getByTestId("selection-status")).toHaveText(before.selection ?? "");
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision ?? "");
  await expect(page.getByTestId("history-status")).toHaveText(before.history ?? "");
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty ?? "");

  const exportDialog = await openFileDialog(page, "Export");
  const exportBackdrop = page.locator(".modal-backdrop").last();
  const exportBounds = await exportBackdrop.boundingBox();
  expect(exportBounds).not.toBeNull();
  await page.mouse.click(exportBounds!.x + 4, exportBounds!.y + 4);
  await expect(exportDialog).toBeHidden();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const findTrigger = page.getByTestId("find-replace-trigger");
  await findTrigger.click();
  const findDialog = page.getByRole("dialog", { name: "Find and Replace" });
  await expect(findDialog).toBeVisible();
  const cycleViewport = await page.getByTestId("cycle-viewport").boundingBox();
  expect(cycleViewport).not.toBeNull();
  await page.mouse.click(cycleViewport!.x + Math.min(180, cycleViewport!.width / 2), cycleViewport!.y + Math.min(100, cycleViewport!.height / 2));
  await expect(findDialog).toBeHidden();
  await expect(findTrigger).toBeFocused();
  await expect(page.getByTestId("selection-status")).toHaveText(before.selection ?? "");

  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  const scaleTrigger = page.getByTestId("transaction-time-scale-trigger");
  await scaleTrigger.click();
  const scaleDialog = page.getByRole("dialog", { name: "Transaction Time Scale" });
  await expect(scaleDialog).toBeVisible();
  const transactionViewport = await page.getByTestId("transaction-lanes").boundingBox();
  expect(transactionViewport).not.toBeNull();
  await page.mouse.click(transactionViewport!.x + Math.min(180, transactionViewport!.width / 2), transactionViewport!.y + Math.min(100, transactionViewport!.height / 2));
  await expect(scaleDialog).toBeHidden();
  await expect(scaleTrigger).toBeFocused();
});
