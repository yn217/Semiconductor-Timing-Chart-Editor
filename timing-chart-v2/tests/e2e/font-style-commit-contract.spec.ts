import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #331 P1 UX/history item: Font Family / Size / Color must each be one
// completed edit = one History entry, not one entry per keystroke/drag
// tick -- and Clear Formatting must be a true no-op (no History entry at
// all) when there's nothing to clear.
test("Font Family/Size/Color commit once on blur or Enter, and Clear formatting is scoped and no-op when already clear", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const history = page.getByTestId("history-status");
  const clear = page.getByTestId("annotation-font-clear");
  const historyDepth = async () => Number((await history.textContent())?.match(/History (\d+)/)?.[1] ?? NaN);
  const base = await historyDepth(); // annotation.create already committed one entry.

  // Clear is disabled when there's nothing to clear yet.
  await expect(clear).toBeDisabled();

  // Bold is an immediate one-click commit (unchanged contract).
  await page.getByTestId("annotation-font-bold").click();
  await expect(history).toHaveText(`History ${base + 1} / Redo 0`);
  await expect(clear).toBeEnabled();

  // Typing a font family does NOT commit until blur -- only one History
  // entry for the whole completed edit, not one per keystroke.
  const family = page.getByTestId("annotation-font-font-family");
  await family.fill("Ari");
  await expect(history).toHaveText(`History ${base + 1} / Redo 0`);
  await family.fill("Arial");
  await expect(history).toHaveText(`History ${base + 1} / Redo 0`);
  await family.blur();
  await expect(history).toHaveText(`History ${base + 2} / Redo 0`);
  // Blurring again without a further edit must not double-commit.
  await family.blur();
  await expect(history).toHaveText(`History ${base + 2} / Redo 0`);

  // Font size commits on Enter, once, for the final value.
  const size = page.getByTestId("annotation-font-font-size");
  await size.fill("14");
  await size.fill("18");
  await expect(history).toHaveText(`History ${base + 2} / Redo 0`);
  await size.press("Enter");
  await expect(history).toHaveText(`History ${base + 3} / Redo 0`);

  // Color commits once on blur.
  const color = page.getByTestId("annotation-font-color");
  await color.focus();
  await color.evaluate((element: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, "#336699");
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(history).toHaveText(`History ${base + 3} / Redo 0`);
  await color.blur();
  await expect(history).toHaveText(`History ${base + 4} / Redo 0`);

  // Clear formatting is one commit, removes only font fields, and is a
  // true no-op (no History entry) when clicked again with nothing left to
  // clear -- the button also disables itself once there's nothing left.
  await clear.click();
  await expect(history).toHaveText(`History ${base + 5} / Redo 0`);
  await expect(clear).toBeDisabled();
});
