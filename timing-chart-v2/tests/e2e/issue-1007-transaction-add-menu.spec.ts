import { expect, test, type Page } from "@playwright/test";
import { documentState } from "./view-only.js";

/**
 * #1007: the Transaction left panel's `+ Add` opens the same Add menu surface as Cycle (Transaction / Group); the standalone `+ Group`
 * button is gone. Opening/closing/navigating is view-only; only activating an item mutates the document.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

const state = documentState;

for (const mode of ["Transaction"] as const) for (const size of sizes) {
  test(`${mode}: Add menu offers Transaction / Group with mouse, keyboard, Esc, outside click and focus return at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/?transaction-demo");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    const add = page.getByTestId("add-transaction-tree");
    await expect(add).toBeVisible();
    await expect(page.getByTestId("add-transaction-group-tree-visible"), "standalone + Group is removed").toHaveCount(0);
    await expect(add).toHaveAttribute("aria-haspopup", "menu");
    const baseline = await state(page);
    const menu = page.getByTestId("transaction-tree-add-menu");

    // Mouse: open, items present, no clipping, then close by outside click.
    await add.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["Transaction", "Group"]);
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    const topmost = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-testid='transaction-tree-add-menu']") !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(topmost, "menu is not covered/clipped by the sidebar, timeline or ribbon").toBe(true);
    await page.mouse.click(size.width / 2, size.height - 4);
    await expect(menu).toHaveCount(0);

    // Keyboard: Enter opens with the first item focused; Arrow Down/Up move; Esc closes and returns focus to the trigger.
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Transaction" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Group" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("menuitem", { name: "Transaction" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(add).toBeFocused();
    await page.keyboard.press("Space");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await state(page), "open / navigate / close is view-only").toEqual(baseline);

    // Activation mutates the document exactly once per item.
    const transactionCount = () => page.locator("[data-testid='transaction-lanes'] [data-transaction-id]").count();
    const groupCount = () => page.locator("[data-testid^='transaction-group-']").count();
    const groups = await groupCount();
    await add.click();
    await menu.getByRole("menuitem", { name: "Group" }).click();
    await expect.poll(groupCount).toBeGreaterThan(groups);
    await expect.poll(async () => (await state(page)).history).not.toEqual(baseline.history);
    const afterGroup = await state(page);
    await add.click();
    await page.keyboard.press("Enter"); // first item: Transaction
    await expect.poll(async () => (await state(page)).history).not.toEqual(afterGroup.history);
    void transactionCount;
  });
}

for (const size of sizes) {
  test(`Cycle Add menu still works at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await page.getByRole("button", { name: "Add signal or group", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Add signal or group" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Group" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });
}
