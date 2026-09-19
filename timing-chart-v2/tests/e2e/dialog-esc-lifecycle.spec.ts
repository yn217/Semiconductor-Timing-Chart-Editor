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

  const properties = await openFileDialog(page, "Properties");
  const originalTitle = await properties.getByLabel("Document title").inputValue();
  await properties.getByLabel("Document title").fill("Esc draft should cancel");
  await properties.getByLabel("Document title").press("Escape");
  await expect(properties).toBeHidden();
  const reopenedProperties = await openFileDialog(page, "Properties");
  await expect(reopenedProperties.getByLabel("Document title")).toHaveValue(originalTitle);
  await page.keyboard.press("Escape");
  await expect(reopenedProperties).toBeHidden();

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

  await expect(page.getByTestId("revision-status")).toHaveText(before.revision ?? "");
  await expect(page.getByTestId("history-status")).toHaveText(before.history ?? "");
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty ?? "");
});
