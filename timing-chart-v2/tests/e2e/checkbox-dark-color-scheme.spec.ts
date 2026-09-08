import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

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

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

test("checkboxes render an explicit bordered box (not a solid black square) under dark color-scheme, both checked and unchecked", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  const selectAll = page.locator(".transaction-select-all input[type='checkbox']");
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
