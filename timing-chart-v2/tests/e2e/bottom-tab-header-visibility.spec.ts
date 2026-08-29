import { expect, test } from "@playwright/test";

const readTabState = async (page: import("@playwright/test").Page) => page.getByTestId("bottom-tabs").locator("[data-bottom-tab]").evaluateAll((tabs) => tabs.map((tab) => {
  const element = tab as HTMLElement;
  const rect = element.getBoundingClientRect();
  return {
    id: element.dataset.bottomTab,
    selected: element.getAttribute("aria-selected"),
    active: element.classList.contains("active"),
    x: rect.x,
    width: rect.width,
  };
}));

test("keeps every configured Bottom tab header visible and switchable", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const tabList = page.getByTestId("bottom-tabs");
  const tabs = tabList.locator("[data-bottom-tab]");
  const expectedTabs = ["Signal", "Annotation", "Problems", "JSON"];
  await expect(tabs).toHaveCount(expectedTabs.length);
  await expect(tabs.evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.bottomTab))).resolves.toEqual(expectedTabs);
  await expect(tabList).toHaveAttribute("role", "tablist");
  await expect(page.locator("#bottom-context-content")).toHaveAttribute("role", "tabpanel");

  const before = {
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await page.getByTestId("cycle-surface").locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
    layout: await readTabState(page),
  };

  for (const tabName of expectedTabs) {
    const tab = tabList.locator(`[data-bottom-tab='${tabName}']`);
    await tab.click();
    await expect(tabs).toHaveCount(expectedTabs.length);
    for (const candidate of expectedTabs) await expect(tabList.locator(`[data-bottom-tab='${candidate}']`)).toBeVisible();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toHaveClass(/active/);
    const selectedCount = (await readTabState(page)).filter((item) => item.selected === "true").length;
    expect(selectedCount).toBe(1);
  }

  const resizer = page.getByTestId("bottom-resizer");
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 48);
  await page.mouse.up();
  await expect(resizer).toBeVisible();
  for (const candidate of expectedTabs) await expect(tabList.locator(`[data-bottom-tab='${candidate}']`)).toBeVisible();
  const afterResize = await readTabState(page);
  expect(afterResize.map((item) => item.id)).toEqual(expectedTabs);
  expect(afterResize.every((item) => item.width > 0)).toBe(true);

  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(page.getByTestId("cycle-surface").locator("[data-role='timing-chart-surface']")).toHaveAttribute("data-render-counters", before.counters!);
});
