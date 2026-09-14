import { expect, test } from "@playwright/test";

type MenuState = { color: string; background: string; outline: string };

async function state(locator: import("@playwright/test").Locator): Promise<MenuState> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor, outline: style.outlineStyle };
  });
}

test("Left Tree menus keep readable normal, hover, focus, and disabled states", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  await page.getByRole("button", { name: "More tree actions" }).click();
  const treeMenu = page.getByRole("menu", { name: "More tree actions" });
  await expect(treeMenu).toBeVisible();
  const treeItem = treeMenu.getByRole("menuitem").first();
  await treeItem.evaluate((element) => (element as HTMLElement).blur());
  const treeNormal = await state(treeItem);
  expect(treeNormal.color).toBe("rgb(38, 61, 88)");
  expect(treeNormal.background).toBe("rgba(0, 0, 0, 0)");
  await treeItem.hover();
  const treeHover = await state(treeItem);
  expect(treeHover.color).toBe("rgb(22, 59, 97)");
  expect(treeHover.background).toBe("rgb(232, 242, 253)");
  await treeItem.focus();
  expect((await state(treeItem)).outline).toBe("solid");
  await treeItem.press("ArrowDown");
  await expect(treeMenu.getByRole("menuitem").nth(1)).toBeFocused();
  await treeItem.press("Escape");
  await expect(treeMenu).toBeHidden();

  const row = surface.locator("[data-role='frozen-row']").first();
  await row.locator("[data-role='frozen-signal-name']").click({ button: "right" });
  const contextMenu = page.getByTestId("signal-context-menu");
  await expect(contextMenu).toBeVisible();
  await expect(contextMenu).toHaveAttribute("data-context-target", "signal");
  const contextItem = contextMenu.getByRole("menuitem", { name: "Copy", exact: true });
  await contextItem.evaluate((element) => (element as HTMLElement).blur());
  const contextNormal = await state(contextItem);
  expect(contextNormal.color).toBe("rgb(38, 61, 88)");
  expect(contextNormal.background).toBe("rgba(0, 0, 0, 0)");
  await contextItem.hover();
  const contextHover = await state(contextItem);
  expect(contextHover.color).toBe("rgb(22, 59, 97)");
  expect(contextHover.background).toBe("rgb(232, 242, 253)");
  await contextItem.focus();
  expect((await state(contextItem)).outline).toBe("solid");
  await contextItem.press("ArrowDown");
  await expect(contextMenu.getByRole("menuitem").nth(1)).toBeFocused();
  await contextItem.press("Escape");
  await expect(contextMenu).toBeHidden();

  await row.locator("[data-role='frozen-signal-name']").click({ button: "right" });
  await expect(contextMenu).toBeVisible();
  const disabledItems = contextMenu.locator("button:disabled");
  await expect(disabledItems.first()).toBeVisible();
  const disabled = await state(disabledItems.first());
  expect(disabled.color).toBe("rgb(113, 128, 150)");
  expect(disabled.background).toBe("rgb(243, 245, 248)");

  await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(surface).toHaveAttribute("data-history-depth", before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
