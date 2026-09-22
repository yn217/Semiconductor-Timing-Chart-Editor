import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// #429/#397 Transaction Mode Product Closure P0-7: an unstyled
// `<input type="checkbox">` takes its rendered appearance from the UA's
// native widget theme -- under `color-scheme: dark` (responsive.css,
// `prefers-color-scheme: dark`) Chromium's native *unchecked* checkbox
// renders as a stark, unbordered solid-black square (setting only
// `accent-color` tints the checked fill but leaves the unchecked native
// widget exactly as dark) with no visible border/check state, easy to
// mistake for a detached/broken element -- reported as exactly that: a
// stray black square in the Bottom Panel. Every checkbox in the app was
// exposed to this (none had ever set explicit checkbox styling); fixed
// with one shared, app-wide rule (controls.css) instead of a
// Transaction-only patch.


test("checkboxes render an explicit bordered box (not a solid black square) under dark color-scheme, both checked and unchecked", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  // #737 removed the Transaction bulk-select checkboxes; the Home ribbon's Display checkboxes (Grid/Snap/...) are the
  // remaining app-wide native checkboxes covered by the shared controls.css rule.
  const selectAll = page.getByTestId("ribbon").locator("input[type='checkbox']").first();
  await selectAll.uncheck();
  const unchecked = await selectAll.evaluate((el) => ({ appearance: getComputedStyle(el).appearance, background: getComputedStyle(el).backgroundColor, borderWidth: getComputedStyle(el).borderTopWidth }));
  // The bug's exact signature: an unstyled native checkbox renders with no
  // explicit background/border of its own (it's the UA's native paint, not
  // a CSS-visible box) -- this app's fix always has a real border and a
  // real (non-transparent) background color, checked or not.
  expect(unchecked.appearance).toBe("none");
  expect(unchecked.borderWidth).not.toBe("0px");
  expect(unchecked.background).not.toBe("rgba(0, 0, 0, 0)");

  await selectAll.check();
  const checked = await selectAll.evaluate((el) => getComputedStyle(el).backgroundColor);
  // Checked and unchecked must be visually distinct (a real check state),
  // and checked must not be plain black either.
  expect(checked).not.toBe(unchecked.background);
  expect(checked).not.toBe("rgb(0, 0, 0)");
});
