import { expect, test } from "@playwright/test";

test("Document Properties icon-only actions use accessible inline SVG buttons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();

  const properties = page.getByRole("dialog", { name: "Document Properties" });
  const iconButtons = properties.locator("button[data-icon-button]");
  await expect(iconButtons).toHaveCount(7);
  await expect(iconButtons.evaluateAll((buttons) => buttons.map((button) => ({
    label: button.getAttribute("aria-label"),
    icon: button.getAttribute("data-icon-button"),
    text: button.textContent,
    svgCount: button.querySelectorAll("svg").length,
    pathCount: button.querySelectorAll("svg path").length,
    tabIndex: (button as HTMLButtonElement).tabIndex,
  })))).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({ label: "Close properties", icon: "close", text: "", svgCount: 1, pathCount: 1, tabIndex: 0 }),
    expect.objectContaining({ icon: "up", text: "", svgCount: 1, pathCount: 1, tabIndex: 0 }),
    expect.objectContaining({ icon: "down", text: "", svgCount: 1, pathCount: 1, tabIndex: 0 }),
  ]));

  const legend = properties.getByTestId("legend-entry-editor");
  await expect(legend.locator("button[data-icon-button='up']")).toHaveCount(3);
  await expect(legend.locator("button[data-icon-button='down']")).toHaveCount(3);
  await expect(legend.locator("[data-legend-entry-id='legend_input'] button[data-icon-button='up']")).toBeDisabled();

  const output = legend.locator("[data-legend-entry-id='legend_output']");
  await output.locator("button[data-icon-button='up']").click();
  await expect(legend.locator("[data-legend-entry-id]").first()).toHaveAttribute("data-legend-entry-id", "legend_output");
  await output.locator("button[data-icon-button='down']").focus();
  await page.keyboard.press("Space");
  await expect(legend.locator("[data-legend-entry-id]").first()).toHaveAttribute("data-legend-entry-id", "legend_input");
});
