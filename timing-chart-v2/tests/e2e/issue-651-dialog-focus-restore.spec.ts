import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 1672, height: 941 },
  { width: 1280, height: 720 },
];

async function openBulkByKeyboard(page: Page, viewport: typeof viewports[number]) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const trigger = page.getByRole("button", { name: "Add signal or group", exact: true });
  let reachedTrigger = false;
  for (let index = 0; index < 120; index += 1) {
    await page.keyboard.press("Tab");
    if (await trigger.evaluate((element) => element === document.activeElement)) {
      reachedTrigger = true;
      break;
    }
  }
  expect(reachedTrigger, "keyboard Tab navigation must reach the Add signal or group trigger").toBe(true);
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Add signal or group" });
  const firstItem = menu.getByRole("menuitem").first();
  await expect(firstItem).toBeFocused();
  for (let index = 0; index < 8; index += 1) await page.keyboard.press("ArrowDown");
  const bulkItem = page.getByTestId("bulk-register-open");
  await expect(bulkItem).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  await expect(dialog).toBeVisible();
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement ? { tag: active.tagName, ariaLabel: active.getAttribute("aria-label"), testId: active.dataset.testid, text: active.textContent?.trim() } : null;
  });
  expect(focused, `focus immediately after opening Bulk Registration: ${JSON.stringify(focused)}`).toMatchObject({ ariaLabel: "Bulk signal definitions" });
  return { dialog, trigger };
}

for (const viewport of viewports) {
  test(`Bulk Signal Registration Escape restores keyboard invoker at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const { dialog, trigger } = await openBulkByKeyboard(page, viewport);
    const before = {
      revision: await page.getByTestId("revision-status").textContent(),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.getByTestId("revision-status").textContent()).toBe(before.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  });

  test(`Bulk Signal Registration Cancel restores keyboard invoker at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const { dialog, trigger } = await openBulkByKeyboard(page, viewport);
    const before = {
      revision: await page.getByTestId("revision-status").textContent(),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Close bulk registration" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.getByTestId("revision-status").textContent()).toBe(before.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  });

  test(`Bulk Signal Registration Apply restores keyboard invoker at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const { dialog, trigger } = await openBulkByKeyboard(page, viewport);
    const definitions = dialog.getByLabel("Bulk signal definitions");
    await definitions.fill("qa.issue651.apply binary");
    await dialog.getByTestId("bulk-register-preview-button").click();
    const apply = dialog.getByTestId("bulk-register-apply");
    await expect(apply).toBeEnabled();
    const revisionBeforeApply = Number((await page.getByTestId("revision-status").textContent())?.match(/\d+$/)?.[0]);
    const historyBeforeApply = Number((await page.getByTestId("history-status").textContent())?.match(/History (\d+)/)?.[1]);
    await apply.click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    const revisionAfterApply = Number((await page.getByTestId("revision-status").textContent())?.match(/\d+$/)?.[0]);
    const historyAfterApply = Number((await page.getByTestId("history-status").textContent())?.match(/History (\d+)/)?.[1]);
    expect(revisionAfterApply).toBe(revisionBeforeApply + 1);
    expect(historyAfterApply).toBe(historyBeforeApply + 1);
    await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  });

  test(`Bulk Signal Registration falls back when its trigger is disabled at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const { dialog, trigger } = await openBulkByKeyboard(page, viewport);
    await trigger.evaluate((element) => { (element as HTMLButtonElement).disabled = true; });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "More tree actions", exact: true })).toBeFocused();
  });

  test(`Bulk Signal Registration keyboard focus remains trapped at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const { dialog } = await openBulkByKeyboard(page, viewport);
    const close = dialog.getByRole("button", { name: "Close bulk registration" });
    const lastEnabled = dialog.getByTestId("bulk-register-preview-button");
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(lastEnabled).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
  });

  test(`Document Properties Escape returns focus to its Ribbon invoker at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    const trigger = page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true });
    const before = {
      revision: await page.getByTestId("revision-status").textContent(),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Document Properties" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.getByTestId("revision-status").textContent()).toBe(before.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  });
}
