import { expect, test } from "@playwright/test";

// #426 Visual Quality Closure -- Annotation type-aware editor audit:
// "Marker=Cycle/Vertical span" per the Goal's own per-type field list.
// Cycle was already editable (the shared anchor editor), but Vertical
// span had zero edit UI anywhere despite `annotation.updateVerticalSpan`
// already existing as a fully-validated semantic command
// (packages/commands/src/planner.ts) -- only a read-only property-row
// showed the current mode. This adds a real editor for it in the Bottom
// Panel's Annotation tab, reusing that exact existing command.

test("Marker's Vertical span is editable in the Bottom Panel, dispatching the existing annotation.updateVerticalSpan command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  await page.getByLabel("Annotation type").selectOption("marker");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByRole("tab", { name: "Annotation", exact: true }).click();
  const editor = page.locator("[aria-label='Marker vertical span']");
  await expect(editor).toBeVisible();

  const applyBtn = page.getByTestId("apply-marker-vertical-span");
  await expect(applyBtn).toBeDisabled(); // no draft change yet -- Draft: no Canonical delta before Apply

  await page.getByLabel("Marker vertical span mode").selectOption("rows");
  // Rows mode requires both endpoints before it's a valid command --
  // Apply stays disabled until both are picked.
  await expect(applyBtn).toBeDisabled();
  await page.getByLabel("Marker vertical span start row").selectOption({ label: "CLOCK" });
  await page.getByLabel("Marker vertical span end row").selectOption({ label: "READY" });
  await expect(applyBtn).toBeEnabled();

  await applyBtn.click();
  // One logical History unit for the whole vertical-span edit.
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(applyBtn).toBeDisabled(); // draft now matches applied Canonical state
});
