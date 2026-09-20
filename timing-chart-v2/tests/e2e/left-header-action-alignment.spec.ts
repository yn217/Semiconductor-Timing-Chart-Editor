import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function readHeaderLayout(page: import("@playwright/test").Page) {
  return page.locator(".left-column-heading").evaluate((header) => {
    const title = header.querySelector("strong")!.getBoundingClientRect();
    const actions = header.querySelector(".left-column-actions")!.getBoundingClientRect();
    const addButton = header.querySelector(".tree-add-button")!;
    const add = addButton.getBoundingClientRect();
    const more = header.querySelector(".tree-more-button")!.getBoundingClientRect();
    const bounds = header.getBoundingClientRect();
    const addIcon = addButton.querySelector("svg")!.getBoundingClientRect();
    return {
      header: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
      title: { left: title.left, right: title.right },
      actions: { left: actions.left, right: actions.right },
      add: { left: add.left, right: add.right, width: add.width, top: add.top, bottom: add.bottom },
      more: { left: more.left, right: more.right, width: more.width, height: more.height },
      addIconCenterY: addIcon.top + addIcon.height / 2,
    };
  });
}

async function assertAligned(page: import("@playwright/test").Page): Promise<void> {
  const layout = await readHeaderLayout(page);
  expect(layout.actions.right).toBeLessThanOrEqual(layout.header.right + 0.1);
  expect(layout.header.right - layout.actions.right).toBeGreaterThanOrEqual(4);
  expect(layout.header.right - layout.actions.right).toBeLessThanOrEqual(7);
  expect(layout.title.right).toBeLessThanOrEqual(layout.actions.left + 0.1);
  expect(layout.more.left - layout.add.right).toBeGreaterThanOrEqual(4);
  expect(layout.more.left - layout.add.right).toBeLessThanOrEqual(6);
  expect(Math.abs(layout.more.width - layout.more.height)).toBeLessThanOrEqual(1);
  expect(layout.add.width).toBeGreaterThan(layout.more.width);
  // #392: the "+" icon and the "Add" label (a ::after generated text node)
  // must share the same visual center rather than the icon sitting above an
  // offset-low label -- assert the icon's own center lands within 1px of
  // the button's own vertical center.
  const buttonCenterY = (layout.add.top + layout.add.bottom) / 2;
  expect(Math.abs(layout.addIconCenterY - buttonCenterY)).toBeLessThanOrEqual(1);
}

async function resizeLeftPane(page: import("@playwright/test").Page, deltaX: number): Promise<void> {
  const resizer = page.getByTestId("left-pane-resizer");
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + deltaX, box!.y + box!.height / 2);
  await page.mouse.up();
}

test("right-aligns Left Tree header actions without changing command behavior", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const header = page.locator(".left-column-heading");
  const add = page.locator(".left-column-actions > .tree-add-button");
  const more = page.locator(".left-column-actions > .tree-more-button");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  await assertAligned(page);
  await add.click();
  const addMenu = page.getByRole("menu", { name: "Add signal or group" });
  await expect(addMenu).toBeVisible();
  await expect(addMenu.boundingBox()).resolves.toBeTruthy();
  await add.click();
  await more.click();
  const moreMenu = page.getByRole("menu", { name: "More tree actions" });
  await expect(moreMenu).toBeVisible();
  await expect(moreMenu.boundingBox()).resolves.toBeTruthy();
  await more.click();

  await resizeLeftPane(page, -500);
  await assertAligned(page);
  const minimumWidth = Number(await page.locator(".editor-shell").getAttribute("data-left-pane-width"));
  expect(minimumWidth).toBe(265);

  await resizeLeftPane(page, 70);
  await assertAligned(page);
  const normalWidth = Number(await page.locator(".editor-shell").getAttribute("data-left-pane-width"));
  expect(normalWidth).toBeGreaterThan(minimumWidth);

  await resizeLeftPane(page, 500);
  await assertAligned(page);
  const wideWidth = Number(await page.locator(".editor-shell").getAttribute("data-left-pane-width"));
  expect(wideWidth).toBe(420);

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(host).toHaveAttribute("data-history-depth", before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(header).toBeVisible();
});
