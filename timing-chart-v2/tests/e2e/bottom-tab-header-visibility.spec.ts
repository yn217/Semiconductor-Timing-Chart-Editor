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
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const tabList = page.getByTestId("bottom-tabs");
  const tabs = tabList.locator("[data-bottom-tab]");
  const expectedTabs = ["Signal", "Annotation", "Bookmarks", "AI", "Problems", "JSON"];
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

// #391: an unstyled <button> takes its text color from the UA's own
// ButtonText system color rather than inheriting from its parent -- under
// `color-scheme: dark` (emulated below) that system default resolves to
// near-white, which read as invisible against this panel's always-light
// background. Every Bottom tab state must set its own explicit,
// sufficiently-contrasting color regardless of the page's color-scheme.
test("keeps inactive/hover/active Bottom tabs legible under both color schemes (#391)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  // Fresh startup defaults to Transaction mode, whose Bottom tabs are
  // Transaction-specific. This contrast case exercises the Cycle Bottom
  // tab strip, so select its production View Mode explicitly.
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const tabList = page.getByTestId("bottom-tabs");

  const relativeLuminance = (rgb: string): number => {
    const [r, g, b] = rgb.match(/\d+/g)!.map(Number).map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrastRatio = (a: string, b: string): number => {
    const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
  };

  const readStates = () => tabList.locator("[data-bottom-tab]").evaluateAll((tabs) => tabs.map((tab) => {
    const el = tab as HTMLElement;
    const cs = getComputedStyle(el);
    return { id: el.dataset.bottomTab, active: el.classList.contains("active"), color: cs.color, background: cs.backgroundColor };
  }));

  const inactiveStates = (await readStates()).filter((state) => !state.active);
  expect(inactiveStates.length).toBeGreaterThan(0);
  for (const state of inactiveStates) {
    // A near-white background is where the reported bug (white-on-white)
    // actually manifested -- treat the panel's own light background as the
    // effective backdrop for a transparent-looking button background.
    const effectiveBackground = state.background === "rgba(0, 0, 0, 0)" ? "rgb(255, 255, 255)" : state.background;
    expect(contrastRatio(state.color, effectiveBackground), JSON.stringify(state)).toBeGreaterThan(4.5);
  }

  const annotationTab = tabList.locator("[data-bottom-tab='Annotation']");
  const idleBox = await annotationTab.boundingBox();
  const before = await annotationTab.evaluate((el) => getComputedStyle(el).backgroundColor);
  await annotationTab.hover();
  const hovered = await annotationTab.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(hovered).not.toBe(before);
  const hoverBox = await annotationTab.boundingBox();
  // Hover must not shift the tab strip's own geometry.
  expect(Math.abs(hoverBox!.width - idleBox!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(hoverBox!.x - idleBox!.x)).toBeLessThanOrEqual(1);

  await annotationTab.click();
  await expect(annotationTab).toHaveClass(/active/);
  const activeStyle = await annotationTab.evaluate((el) => { const cs = getComputedStyle(el); return { color: cs.color, fontWeight: cs.fontWeight, borderColor: cs.borderTopColor }; });
  const inactiveStyle = inactiveStates.find((state) => state.id === "Annotation")!;
  expect(activeStyle.color).not.toBe(inactiveStyle.color);

  await page.keyboard.press("ArrowRight");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("data-bottom-tab", "Bookmarks");
  const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});
