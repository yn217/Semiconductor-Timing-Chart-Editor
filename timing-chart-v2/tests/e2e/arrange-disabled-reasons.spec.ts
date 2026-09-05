import { expect, test } from "@playwright/test";

// #332 item D: implemented-but-currently-unavailable Arrange controls must
// expose a truthful, contextual disabled reason -- never the generic
// "Not yet implemented" a genuinely unbuilt control would show. Group,
// Ungroup, Align, and Same width are all fully wired (annotationGroup.create/
// delete, batched annotation.updateLabelOffset/matchSpan); they only go
// disabled because the current selection doesn't satisfy their precondition.
test("Arrange controls distinguish selection/context-unavailable from a real disabled state", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const groupButton = page.locator(".arrange-group").getByRole("button", { name: "Group" });
  const openMenu = async () => {
    const trigger = page.locator(".arrange-dropdown-trigger");
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  };

  // Nothing selected: every control is unavailable for the same reason --
  // there is no Annotation to arrange, not because Group/etc. is unbuilt.
  await expect(groupButton).toHaveAttribute("title", "Select at least one annotation");

  // One annotation selected: Group/Align/Same width need a second member;
  // Ungroup correctly reports the selection isn't grouped at all.
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const firstId = await host.locator("[data-role='annotation-owner']").last().getAttribute("data-annotation-id");
  await expect(groupButton).toHaveAttribute("title", "Select at least 2 annotations");
  await openMenu();
  const menu = page.locator(".arrange-menu");
  await expect(menu.getByRole("menuitem", { name: "Ungroup" })).toHaveAttribute("title", "Selected annotations are not grouped");
  await expect(menu.getByRole("menuitem", { name: "Align" })).toHaveAttribute("title", "Select at least 2 annotations");
  await expect(menu.getByRole("menuitem", { name: "Same width" })).toHaveAttribute("title", "Select at least 2 annotations");
  // Rotate/Lock/Unlock have no selection-count precondition beyond "at least
  // one" -- they must be genuinely enabled here, not disabled at all.
  await expect(menu.getByRole("menuitem", { name: "Rotate right 90°" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Lock", exact: true })).toBeEnabled();

  // A second annotation selected via Ctrl+click: Group becomes available.
  await page.getByLabel("Annotation type").selectOption("marker");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const secondId = await host.locator("[data-role='annotation-owner']").last().getAttribute("data-annotation-id");
  const first = host.locator(`[data-role='annotation-owner'][data-annotation-id='${firstId}']`);
  const second = host.locator(`[data-role='annotation-owner'][data-annotation-id='${secondId}']`);
  await first.locator("[data-role='annotation-label']").click();
  await second.locator("[data-role='annotation-label']").click({ modifiers: ["Control"] });
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(second).toHaveAttribute("data-selected", "true");
  await expect(groupButton).toBeEnabled();
  await expect(groupButton).toHaveAttribute("title", "Group");

  // Group them, then Ungroup becomes available and Group correctly reports
  // the already-grouped state instead of a generic placeholder.
  await groupButton.click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(groupButton).toHaveAttribute("title", "Selected annotations are already grouped");
  await openMenu();
  await expect(menu.getByRole("menuitem", { name: "Ungroup" })).toBeEnabled();
});
