import { expect, test } from "@playwright/test";

test("non-Home design-system primitives own stable button and icon geometry", async ({ page }) => {
  await page.goto("/");
  const metrics = await page.evaluate(() => {
    const group = document.createElement("div");
    group.className = "ds-ribbon-group";
    const button = document.createElement("button");
    button.className = "ds-ribbon-button";
    const icon = document.createElement("span");
    icon.className = "ds-ribbon-button__icon";
    const label = document.createElement("span");
    label.className = "ds-ribbon-button__label";
    label.textContent = "Two line";
    button.append(icon, label);
    group.append(button);
    document.body.append(group);
    const rect = (element: Element) => element.getBoundingClientRect();
    const buttonRect = rect(button);
    const iconRect = rect(icon);
    const labelRect = rect(label);
    const root = getComputedStyle(document.documentElement);
    const result = {
      buttonHeight: buttonRect.height,
      buttonMinWidth: Number.parseFloat(getComputedStyle(button).minWidth),
      iconSize: [iconRect.width, iconRect.height],
      iconCenterY: iconRect.top + iconRect.height / 2,
      buttonCenterY: buttonRect.top + buttonRect.height / 2,
      labelWithinButton: labelRect.top >= buttonRect.top && labelRect.bottom <= buttonRect.bottom,
      hasHomeDesignSystemNode: document.querySelector(".home-ribbon .ds-ribbon-button, .home-ribbon .ds-ribbon-group") !== null,
      tokenButtonHeight: root.getPropertyValue("--ds-ribbon-button-height").trim(),
    };
    group.remove();
    return result;
  });

  expect(metrics.buttonHeight).toBe(66);
  expect(metrics.buttonMinWidth).toBe(48);
  expect(metrics.iconSize).toEqual([20, 20]);
  expect(Math.abs(metrics.iconCenterY - metrics.buttonCenterY)).toBeLessThanOrEqual(23);
  expect(metrics.labelWithinButton).toBe(true);
  expect(metrics.hasHomeDesignSystemNode).toBe(false);
  expect(metrics.tokenButtonHeight).toBe("66px");
});
