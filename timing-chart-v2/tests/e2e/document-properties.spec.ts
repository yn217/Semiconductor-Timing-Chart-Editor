import { expect, test } from "@playwright/test";

test("Document Properties legend reorder actions are named and keyboard operable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();

  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await expect(properties.getByRole("button", { name: "Close properties", exact: true })).toBeVisible();

  const legend = properties.getByTestId("legend-entry-editor");
  await expect(legend.getByRole("button", { name: "Move legend_input up", exact: true })).toBeDisabled();

  const moveOutputUp = legend.getByRole("button", { name: "Move legend_output up", exact: true });
  await expect(moveOutputUp).toBeEnabled();
  await moveOutputUp.click();
  await expect(legend.locator("[data-legend-entry-id]").first()).toHaveAttribute("data-legend-entry-id", "legend_output");
  const moveOutputDown = legend.getByRole("button", { name: "Move legend_output down", exact: true });
  await moveOutputDown.focus();
  await expect(moveOutputDown).toBeFocused();
  await page.keyboard.press("Space");
  await expect(legend.locator("[data-legend-entry-id]").first()).toHaveAttribute("data-legend-entry-id", "legend_input");
});
