import type { Page } from "@playwright/test";

export async function openBottomSettings(page: Page) {
  const gear = page.getByTestId("bottom-settings");
  if ((await gear.getAttribute("aria-expanded")) !== "true") await gear.click();
}
