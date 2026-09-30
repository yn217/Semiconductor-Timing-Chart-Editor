import { expect, test } from "@playwright/test";
import { openBottomSettings } from "./bottom-settings";

test("Bottom settings explain Follow Selection and Pin without a persistent status chip", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await page.getByTestId("revision-status").innerText(),
    history: await page.getByTestId("history-status").innerText(),
    dirty: await page.getByTestId("dirty-status").innerText(),
    tabs: await page.getByTestId("bottom-tabs").evaluate((element) => element.getBoundingClientRect().toJSON()),
    content: await page.locator(".bottom-content").evaluate((element) => element.getBoundingClientRect().toJSON()),
  };
  const gear = page.getByTestId("bottom-settings");
  const gearBox = await gear.boundingBox();
  expect(gearBox?.width).toBeGreaterThanOrEqual(28);
  expect(gearBox?.height).toBeGreaterThanOrEqual(28);
  const iconBox = await gear.locator("svg").boundingBox();
  expect(iconBox?.width).toBeGreaterThanOrEqual(16);
  expect(iconBox?.width).toBeLessThanOrEqual(18);
  expect(iconBox?.height).toBeGreaterThanOrEqual(16);
  expect(iconBox?.height).toBeLessThanOrEqual(18);
  await expect(page.getByTestId("bottom-target-mode")).toHaveCount(0);
  await expect(page.getByTestId("bottom-follow-status")).toHaveCount(0);
  await expect(page.getByText("Following Selection", { exact: true })).toHaveCount(0);
  const popover = page.getByTestId("bottom-settings-popover");
  await expect(popover).toBeHidden();
  await expect(page.getByTestId("bottom-pin")).toBeHidden();
  await openBottomSettings(page);
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute("aria-label", "Bottom Panel Settings");
  await expect(popover).toContainText("Choose how the Bottom Panel reacts when the editor selection changes.");
  await expect(page.getByTestId("follow-selection")).toBeVisible();
  await expect(popover).toContainText("Automatically update the Bottom Panel target when you select another item.");
  await expect(popover).toContainText("Keep the content currently shown fixed while you inspect or select other items.");
  await expect(page.getByTestId("follow-selection")).toBeChecked();
  const afterOpen = {
    tabs: await page.getByTestId("bottom-tabs").evaluate((element) => element.getBoundingClientRect().toJSON()),
    content: await page.locator(".bottom-content").evaluate((element) => element.getBoundingClientRect().toJSON()),
  };
  expect(afterOpen.tabs).toEqual(before.tabs);
  expect(afterOpen.content).toEqual(before.content);
  await page.getByTestId("follow-selection").uncheck();
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(gear).toBeFocused();
  expect(await page.getByTestId("revision-status").innerText()).toBe(before.revision);
  expect(await page.getByTestId("history-status").innerText()).toBe(before.history);
  expect(await page.getByTestId("dirty-status").innerText()).toBe(before.dirty);
});

test("Bottom settings gear remains right-aligned and layout-stable at supported viewports", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
    await page.setViewportSize(viewport);
    const nav = page.getByTestId("bottom-tabs");
    const gear = page.getByTestId("bottom-settings");
    await expect(page.getByTestId("bottom-target-mode")).toHaveCount(0);
    await expect(gear).toBeVisible();
    const before = {
      nav: await nav.boundingBox(),
      content: await page.locator(".bottom-content").boundingBox(),
      gear: await gear.boundingBox(),
    };
    expect(before.gear?.width).toBeGreaterThanOrEqual(28);
    expect(before.gear!.x + before.gear!.width).toBeLessThanOrEqual(viewport.width);
    expect(before.nav!.x + before.nav!.width - (before.gear!.x + before.gear!.width)).toBeLessThanOrEqual(10);
    await openBottomSettings(page);
    await expect(page.getByTestId("bottom-settings-popover")).toBeVisible();
    expect(await nav.boundingBox()).toEqual(before.nav);
    expect(await page.locator(".bottom-content").boundingBox()).toEqual(before.content);
    await page.keyboard.press("Escape");
    await expect(gear).toBeFocused();
  }
});
