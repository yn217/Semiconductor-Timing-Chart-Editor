import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// #419 -- Highlight "Cycle Snap / Free positioning" is an immediate, single-
// History semantic choice. It is intentionally independent of other pending
// Inspector drafts, which remain unapplied until Apply or Revert.

test("Inspector Highlight Position Mode commits through annotation.setPositionMode", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  await page.getByLabel("Annotation type").selectOption("highlight");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByRole("tab", { name: "Annotation", exact: true }).click();
  const modeSelect = page.getByRole("combobox", { name: "Highlight position mode" });
  await expect(modeSelect).toHaveValue("cycle-snap"); // default, matches schema's back-compat contract

  await modeSelect.selectOption("free");
  // Immediate commit -- one atomic mode flip, its own History entry. The
  // Inspector explains this boundary beside the control.
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByLabel("Highlight position mode section")).toContainText("Applies immediately as one Undo step");
  await expect(modeSelect).toHaveValue("free");

  const startCycle = page.getByLabel("Inspector annotation anchor cycle");
  await expect(startCycle).toHaveAttribute("step", "0.01");
  await startCycle.fill("8.35");
  await page.getByRole("button", { name: "Apply Anchor" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(startCycle).toHaveValue("8.35");

  await modeSelect.selectOption("cycle-snap");
  // Fractional Free coordinates cannot be silently rounded when returning to
  // Cycle Snap; the existing semantic command rejects the mode flip and
  // leaves Canonical/History unchanged.
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(modeSelect).toHaveValue("free");
});

test("Highlight Position Mode immediate commit preserves and does not apply another Inspector draft", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("highlight");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const inspector = page.getByTestId("annotation-editor");
  const label = inspector.getByLabel("Annotation label").first();
  const initialLabel = await label.inputValue();
  await label.fill("unapplied label draft");
  const modeSelect = inspector.getByRole("combobox", { name: "Highlight position mode" });
  await modeSelect.selectOption("free");

  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(label).toHaveValue("unapplied label draft");
  await expect(modeSelect).toHaveValue("free");

  await inspector.getByRole("button", { name: "Discard unapplied Inspector draft" }).click();
  await expect(label).toHaveValue(initialLabel);
  await expect(modeSelect).toHaveValue("free");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("Fractional Highlight Free position survives production Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("highlight");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("tab", { name: "Annotation", exact: true }).click();
  const modeSelect = page.getByRole("combobox", { name: "Highlight position mode" });
  await modeSelect.selectOption("free");
  const startCycle = page.getByLabel("Inspector annotation anchor cycle");
  await startCycle.fill("8.35");
  await page.getByRole("button", { name: "Apply Anchor" }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const pendingSave = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const saved = await pendingSave;
  const savedPath = await saved.path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("tab", { name: "Annotation", exact: true }).click();
  await page.locator("[data-annotation-list-id]").first().click();
  await expect(modeSelect).toHaveValue("free");
  await expect(startCycle).toHaveValue("8.35");
});
