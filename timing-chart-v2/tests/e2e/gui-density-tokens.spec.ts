import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Event Table controls never silently fall back to the browser's native font size", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  const fontSizeOf = async (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontSize);

  // These are the controls that previously fell through to the 16px UA default
  // because they weren't wrapped in any font-styled ancestor.
  for (const selector of [".event-row input", ".event-actions button", ".transition-form-actions button[type='submit']", ".quick-values button"]) {
    const size = await fontSizeOf(selector);
    expect(size).not.toBe("16px");
  }

  // They must match the shared --font-ui token, same baseline as the Inspector.
  const tokenValue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ds-font-size").trim());
  const scale = await page.evaluate(() => ["--ds-font-size", "--ds-font-size-caption", "--ds-font-size-label", "--ds-font-size-section", "--ds-font-size-small"].map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()));
  const inspectorInputSize = await fontSizeOf(".inspector input");
  expect(inspectorInputSize).toBe(tokenValue);
  for (const selector of [".event-row input", ".event-actions button", ".transition-form-actions button[type='submit']", ".quick-values button"]) {
    // #721: the typography scale has several ds sizes (body 11px, caption/small 10px, ...); a control must sit on that scale.
    expect(scale).toContain(await fontSizeOf(selector));
  }
});
