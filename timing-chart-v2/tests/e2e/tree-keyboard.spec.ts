import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("navigates the projected signal tree with keyboard semantics without mutating the document", async ({ page }) => {
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const tree = surface.locator("[data-role='left-tree-rows']");
  await expect(tree).toHaveAttribute("role", "tree");
  const items = tree.locator("[role='treeitem']");
  // 3 Groups + 8 Signals: the Cycle window now spans Main + Bottom (#756), so the whole projected tree is mounted.
  await expect(items).toHaveCount(11);

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const control = tree.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control']");
  await control.focus();
  await expect(control).toHaveAttribute("aria-expanded", "true");
  await control.press("ArrowRight");
  const firstControlRow = tree.locator("[role='treeitem'][data-group-id='grp_cycle_control']:not([data-group-header='true'])").first();
  await expect(firstControlRow).toBeFocused();
  await firstControlRow.press("ArrowLeft");
  await expect(control).toBeFocused();
  await control.press("End");
  // End goes to the LAST tree item. The Cycle window now spans Main + Bottom (#756), so the whole tree is mounted and the last item
  // is the trailing empty Scratch group header rather than the last Signal.
  const lastItem = tree.locator("[role='treeitem']:not([hidden])").last();
  await expect(lastItem).toBeFocused();
  await lastItem.dispatchEvent("keydown", { key: "Home", bubbles: true, cancelable: true });
  await expect(control).toBeFocused();

  const signal = tree.locator("[role='treeitem'][data-row-id='sig_cycle_request']");
  await signal.focus();
  await signal.press("Enter");
  await expect(signal).toHaveAttribute("aria-selected", "true");
  await signal.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});

test("filters treeitems and repairs focus after collapse", async ({ page }) => {
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const tree = surface.locator("[data-role='left-tree-rows']");
  const filter = page.getByTestId("signal-tree-search-top");
  await filter.fill("REQUEST");
  const request = tree.locator("[role='treeitem'][data-row-id='sig_cycle_request']");
  await expect(request).toBeVisible();
  // Filtering is applied to canonical rows before virtualization (#1055), so
  // non-matching rows are absent from the projected tree rather than hidden in DOM.
  await expect(tree.locator("[role='treeitem'][data-row-id='sig_cycle_ready']")).toHaveCount(0);
  await request.focus();
  await request.press("ArrowUp");
  await expect(tree.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control']")).toBeFocused();
  await filter.fill("");
  const control = tree.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control']");
  await control.focus();
  await control.press("ArrowLeft");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await expect(control).toBeFocused();
  await control.press("ArrowRight");
  await expect(tree.locator("[role='treeitem'][data-group-id='grp_cycle_control']:not([data-group-header='true'])").first()).toBeFocused();
});
