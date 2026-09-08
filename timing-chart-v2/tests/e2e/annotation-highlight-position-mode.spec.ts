import { expect, test } from "@playwright/test";

// #419 -- Highlight "Cycle Snap / Free positioning" mode. Zero GUI existed
// anywhere despite `annotation.setPositionMode` already being a fully-
// validated semantic command (rejects switching to cycle-snap when the
// current boundaries aren't integer cycles). This adds an immediate-commit
// Mode select to the Bottom Panel's Annotation editor for Highlight,
// dispatching that exact existing command -- one atomic mode flip, own
// History entry, no new Canonical owner.

test("Highlight Position Mode is editable in the Bottom Panel and commits through the existing annotation.setPositionMode command", async ({ page }) => {
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
  // Immediate commit -- one atomic mode flip, its own History entry.
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(modeSelect).toHaveValue("free");

  await modeSelect.selectOption("cycle-snap");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(modeSelect).toHaveValue("cycle-snap");
});
